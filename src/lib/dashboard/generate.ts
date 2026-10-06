import { loadAiSettings } from '../ai/client';
import {
  GenerationTimeoutError,
  modelSupportsStructuredOutputs,
  openaiGenerate,
  resolveGenerateDeadlineMs,
  resolveStepTimeoutMs,
  type ResponseFormatStep,
} from '../ai/openaiCompatible';
import { geminiGenerate } from '../ai/geminiAdapter';
import { PROVIDERS, isNonGenerativeModel, isOpenRouterFreeRouter } from '../ai/providers';
import { resolveProviderConfig } from '../ai/resolve';
import type { EnvLike } from '../ai/resolve';
import { AIProviderError } from '../ai/types';
import { DASHBOARD_JSON_SCHEMA } from './schema';
import { catalogPromptBlock } from './catalog';
import { buildFallbackDashboard, varyWidget, type GenerateDashboardContext } from './fallback';
import { finalizeDashboardSpec } from './finalize';
import { mintDashboardId } from './ids';
import { buildDashboardPrompt } from './prompt';
import { extractJsonObject, validateDashboardSpec } from './validate';
import type { DashboardSpec, DashboardWidget } from './types';

export interface GenerateAttempt {
  step: string;
  status?: number;
  ms: number;
  error?: string;
  model?: string;
  keySource?: 'user' | 'env' | 'none';
}

export interface GenerateDashboardResult {
  spec: DashboardSpec;
  source: 'ai' | 'fallback';
  error?: string;
  fallbackReason?: string;
  attempts?: GenerateAttempt[];
}

export type GenerateServerContext = GenerateDashboardContext & {
  instruction?: string;
  existing?: DashboardSpec;
  widgetId?: string;
  apiKey?: string;
  provider?: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  deadlineMs?: number;
  rateLimitWaitMs?: number;
};

function fallbackSpec(
  ctx: GenerateDashboardContext & { existing?: DashboardSpec; widgetId?: string; seed?: number; archetype?: DashboardSpec['archetype'] },
): DashboardSpec {
  if (ctx.widgetId && ctx.existing) {
    return finalizeDashboardSpec({
      ...ctx.existing,
      widgets: ctx.existing.widgets.map((w) =>
        w.id === ctx.widgetId ? varyWidget(w, ctx.datasets, ctx.seed || 1) : w,
      ),
    }, ctx.datasets, { verifyCopy: false });
  }
  return buildFallbackDashboard(ctx);
}

function withUniqueId(spec: DashboardSpec): DashboardSpec {
  return { ...spec, id: mintDashboardId() };
}

function lockUserTitle(spec: DashboardSpec, title?: string): DashboardSpec {
  const next = title?.trim();
  return next ? { ...spec, title: next } : spec;
}

function statusOf(error: unknown): number | undefined {
  if (error instanceof AIProviderError) return error.status;
  if (error instanceof GenerationTimeoutError) return error.status;
  if (error && typeof error === 'object' && 'status' in error) {
    const n = Number((error as { status: unknown }).status);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export async function generateDashboardOnServer(
  ctx: GenerateServerContext,
  env: EnvLike = typeof process !== 'undefined' ? process.env : {},
): Promise<GenerateDashboardResult> {
  const started = Date.now();
  const deadlineMs = ctx.deadlineMs ?? resolveGenerateDeadlineMs(env);
  const deadlineAt = started + deadlineMs;
  const attempts: GenerateAttempt[] = [];
  const { prompt, seed, archetype } = buildDashboardPrompt({
    intent: ctx.intent || ctx.instruction,
    title: ctx.title,
    datasets: ctx.datasets,
    seed: ctx.seed,
    preferredArchetype: ctx.archetype,
    existingJson: ctx.existing ? JSON.stringify(ctx.existing) : undefined,
    widgetId: ctx.widgetId,
    instruction: ctx.instruction,
    mode: ctx.mode,
  });

  const config = resolveProviderConfig({
    provider: ctx.provider as never,
    baseUrl: ctx.baseUrl,
    model: ctx.model,
    apiKey: ctx.apiKey,
  }, env);
  const def = PROVIDERS[config.provider];
  const hasKey = Boolean(config.apiKey) || !def.requiresApiKey;
  const fetchImpl = ctx.fetchImpl || fetch;
  attempts.push({
    step: 'resolve',
    status: 200,
    ms: 0,
    model: config.model,
    keySource: config.source.apiKey,
  });

  const finishFallback = (reason: string): GenerateDashboardResult => ({
    spec: lockUserTitle(withUniqueId(fallbackSpec({ ...ctx, seed, archetype })), ctx.title),
    source: 'fallback',
    error: reason,
    fallbackReason: reason,
    attempts,
  });

  if (!hasKey) {
    const reason = 'No API key on the server or in the request. Generated a data-fitted layout.';
    return finishFallback(reason);
  }

  const remaining = () => Math.max(250, deadlineAt - Date.now());
  const timedOut = () => Date.now() >= deadlineAt;

  try {
    if (def.compatible === 'gemini') {
      const t0 = Date.now();
      try {
        const text = await geminiGenerate(config, [{ role: 'user', content: prompt }]);
        attempts.push({ step: 'gemini', status: 200, ms: Date.now() - t0 });
        return parseOrFallback(text, ctx, seed, archetype, 'gemini text', attempts);
      } catch (error) {
        attempts.push({
          step: 'gemini',
          status: statusOf(error),
          ms: Date.now() - t0,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    const skipSchema = isOpenRouterFreeRouter(config.model);
    let useSchema = !skipSchema;
    const modelCheckStart = Date.now();
    if (skipSchema) {
      attempts.push({ step: 'models', status: 200, ms: 0, error: 'openrouter/free skips json_schema' });
    } else {
      try {
        useSchema = await modelSupportsStructuredOutputs(config, fetchImpl);
        attempts.push({ step: 'models', status: 200, ms: Date.now() - modelCheckStart });
      } catch (error) {
        useSchema = false;
        attempts.push({
          step: 'models',
          status: statusOf(error) || 0,
          ms: Date.now() - modelCheckStart,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const ladder: ResponseFormatStep[] = useSchema
      ? ['json_schema', 'json_object', 'plain']
      : ['json_object', 'plain'];
    let lastError = '';
    let routedModel = config.model;

    for (const step of ladder) {
      if (timedOut()) {
        const elapsed = Math.round((Date.now() - started) / 1000);
        return finishFallback(`timed out after ${elapsed}s at step ${step}`);
      }
      const t0 = Date.now();
      try {
        const generated = await openaiGenerate(config, [{ role: 'user', content: prompt }], {
          json: step !== 'plain',
          temperature: 0.4,
          maxTokens: Number(env.AI_MAX_TOKENS || 8000),
          jsonSchema: step === 'json_schema' ? DASHBOARD_JSON_SCHEMA : undefined,
          format: step,
          timeoutMs: resolveStepTimeoutMs(remaining(), env),
          fetchImpl,
          retries: step === 'json_schema' ? 0 : 2,
          rateLimitWaitMs: ctx.rateLimitWaitMs ?? Number(env.AI_RATE_LIMIT_WAIT_MS || 5000),
          reasoning: { effort: 'low' },
        });
        if (generated.model) routedModel = generated.model;
        if (isNonGenerativeModel(generated.model || routedModel)) {
          lastError = `Non-generative model ${generated.model || routedModel} under ${step}.`;
          logRawModelOutput(step, generated.model || routedModel, generated.text, lastError);
          attempts.push({ step, status: 200, ms: Date.now() - t0, error: lastError, model: generated.model || routedModel });
          continue;
        }
        let parsed: unknown;
        try {
          parsed = extractJsonObject(generated.text);
        } catch (parseError) {
          logRawModelOutput(step, generated.model || routedModel, generated.text, 'invalid JSON');
          throw parseError;
        }
        const spec = validateDashboardSpec(parsed, {
          seed,
          archetype,
          title: ctx.title,
          intent: ctx.intent,
          widgets: ctx.existing?.widgets,
        });
        attempts.push({ step, status: 200, ms: Date.now() - t0, model: generated.model || routedModel });
        if (spec.widgets.length === 0) {
          lastError = `Model returned 0 widgets under ${step}.`;
          attempts[attempts.length - 1].error = lastError;
          logRawModelOutput(step, generated.model || routedModel, generated.text, lastError);
          continue;
        }
        return {
          spec: {
            ...lockUserTitle(withUniqueId(finalizeDashboardSpec(spec, ctx.datasets)), ctx.title),
            generatedBy: routedModel,
          },
          source: 'ai',
          attempts,
        };
      } catch (error) {
        const status = statusOf(error);
        lastError = error instanceof Error ? error.message : String(error);
        attempts.push({ step, status, ms: Date.now() - t0, error: lastError, model: routedModel });
        if (error instanceof GenerationTimeoutError || timedOut()) {
          const elapsed = Math.round((Date.now() - started) / 1000);
          return finishFallback(`timed out after ${elapsed}s at step ${step}`);
        }
        if (status === 429) {
          return finishFallback(`429: ${lastError}`);
        }
        const stepDown = status === 400 || status === 422 || /400|422|valid JSON|0 widgets|truncated|Unexpected/i.test(lastError);
        if (!stepDown && step === 'json_schema') {
          lastError = `${lastError} (stepping down the response format ladder)`;
        }
      }
    }

    return finishFallback(lastError || 'Model did not return a usable dashboard spec.');
  } catch (error) {
    if (error instanceof GenerationTimeoutError || timedOut()) {
      const elapsed = Math.round((Date.now() - started) / 1000);
      return finishFallback(`timed out after ${elapsed}s at step generate`);
    }
    const status = statusOf(error);
    const message = error instanceof Error ? error.message : 'AI generation unavailable; used a data-fitted layout.';
    return finishFallback(status === 429 ? `429: ${message}` : message);
  }
}

function logRawModelOutput(step: string, model: string | undefined, text: string, reason: string) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
  console.warn(`[generate] ${reason} step=${step} model=${model || '?'} chars=${String(text || '').length} raw=${raw}`);
}

function parseOrFallback(
  text: string,
  ctx: GenerateServerContext,
  seed: number,
  archetype: DashboardSpec['archetype'],
  label: string,
  attempts: GenerateAttempt[] = [],
): GenerateDashboardResult {
  try {
    const parsed = extractJsonObject(text);
    const spec = validateDashboardSpec(parsed, {
      seed,
      archetype,
      title: ctx.title,
      intent: ctx.intent,
      widgets: ctx.existing?.widgets,
    });
    if (spec.widgets.length === 0) {
      const reason = `${label}: 0 widgets.`;
      logRawModelOutput(label, undefined, text, reason);
      return {
        spec: lockUserTitle(withUniqueId(fallbackSpec({ ...ctx, seed, archetype })), ctx.title),
        source: 'fallback',
        error: reason,
        fallbackReason: reason,
        attempts,
      };
    }
    return {
      spec: lockUserTitle(withUniqueId(finalizeDashboardSpec(spec, ctx.datasets)), ctx.title),
      source: 'ai',
      attempts,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : `${label} failed to parse.`;
    return {
      spec: lockUserTitle(withUniqueId(fallbackSpec({ ...ctx, seed, archetype })), ctx.title),
      source: 'fallback',
      error: reason,
      fallbackReason: reason,
      attempts,
    };
  }
}

export async function generateDashboardSpec(
  ctx: GenerateDashboardContext & { instruction?: string; existing?: DashboardSpec; widgetId?: string },
): Promise<GenerateDashboardResult> {
  if (typeof window !== 'undefined') {
    const settings = loadAiSettings();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (settings.apiKey) headers['x-api-key'] = settings.apiKey;
    const res = await fetch('/api/dashboards/generate', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: ctx.title,
        intent: ctx.intent || ctx.instruction,
        instruction: ctx.instruction,
        datasets: ctx.datasets,
        existing: ctx.existing,
        widgetId: ctx.widgetId,
        archetype: ctx.archetype,
        mode: ctx.mode,
        seed: ctx.seed,
        provider: settings.provider,
        baseUrl: settings.baseUrl,
        model: settings.model,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data.spec) {
      return {
        spec: fallbackSpec(ctx),
        source: 'fallback',
        error: data.error || `Dashboard generation failed (${res.status}).`,
        fallbackReason: data.fallbackReason || data.error || `Dashboard generation failed (${res.status}).`,
        attempts: data.attempts,
      };
    }
    if (!res.ok && data.spec) {
      return {
        spec: data.spec,
        source: data.source || 'fallback',
        error: data.error,
        fallbackReason: data.fallbackReason || data.error,
        attempts: data.attempts,
      };
    }
    return {
      spec: data.spec,
      source: data.source || 'fallback',
      error: data.error,
      fallbackReason: data.fallbackReason,
      attempts: data.attempts,
    };
  }

  return generateDashboardOnServer(ctx);
}

export function replaceWidget(spec: DashboardSpec, widget: DashboardWidget): DashboardSpec {
  return {
    ...spec,
    widgets: spec.widgets.map((w) => (w.id === widget.id ? widget : w)),
  };
}

export function updateWidget(spec: DashboardSpec, widgetId: string, patch: Partial<DashboardWidget>): DashboardSpec {
  return {
    ...spec,
    widgets: spec.widgets.map((w) => (w.id === widgetId ? { ...w, ...patch, layout: patch.layout || w.layout } : w)),
  };
}

export { catalogPromptBlock };
