import { loadAiSettings } from '../ai/client';
import { GenerationTimeoutError, openaiGenerate, type ResponseFormatStep } from '../ai/openaiCompatible';
import { geminiGenerate } from '../ai/geminiAdapter';
import { PROVIDERS } from '../ai/providers';
import { resolveProviderConfig } from '../ai/resolve';
import type { EnvLike } from '../ai/resolve';
import { DASHBOARD_JSON_SCHEMA } from './schema';
import { catalogPromptBlock } from './catalog';
import { buildFallbackDashboard, varyWidget, type GenerateDashboardContext } from './fallback';
import { finalizeDashboardSpec } from './finalize';
import { mintDashboardId } from './ids';
import { buildDashboardPrompt } from './prompt';
import { extractJsonObject, validateDashboardSpec } from './validate';
import type { DashboardSpec, DashboardWidget } from './types';

export interface GenerateDashboardResult {
  spec: DashboardSpec;
  source: 'ai' | 'fallback';
  error?: string;
  fallbackReason?: string;
}

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

export async function generateDashboardOnServer(
  ctx: GenerateDashboardContext & { instruction?: string; existing?: DashboardSpec; widgetId?: string; apiKey?: string; provider?: string; model?: string; baseUrl?: string },
  env: EnvLike = typeof process !== 'undefined' ? process.env : {},
): Promise<GenerateDashboardResult> {
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

  if (!hasKey) {
    const reason = 'No API key on the server or in the request. Generated a data-fitted layout.';
    return {
      spec: withUniqueId(fallbackSpec({ ...ctx, seed, archetype })),
      source: 'fallback',
      error: reason,
      fallbackReason: reason,
    };
  }

  const ladder: ResponseFormatStep[] = ['json_schema', 'json_object', 'plain'];
  let lastError = '';

  try {
    if (def.compatible === 'gemini') {
      const text = await geminiGenerate(config, [{ role: 'user', content: prompt }]);
      return parseOrFallback(text, ctx, seed, archetype, 'gemini text');
    }

    for (const step of ladder) {
      try {
        const text = await openaiGenerate(config, [{ role: 'user', content: prompt }], {
          json: step !== 'plain',
          temperature: 0.4,
          maxTokens: Number(env.AI_MAX_TOKENS || 8000),
          jsonSchema: step === 'json_schema' ? DASHBOARD_JSON_SCHEMA : undefined,
          format: step,
        });
        const parsed = extractJsonObject(text);
        const spec = validateDashboardSpec(parsed, {
          seed,
          archetype,
          title: ctx.title,
          intent: ctx.intent,
          widgets: ctx.existing?.widgets,
        });
        if (spec.widgets.length === 0) {
          lastError = `Model returned 0 widgets under ${step}.`;
          continue;
        }
        return {
          spec: withUniqueId(finalizeDashboardSpec(spec, ctx.datasets)),
          source: 'ai',
        };
      } catch (error) {
        if (error instanceof GenerationTimeoutError) throw error;
        lastError = error instanceof Error ? error.message : String(error);
        const stepDown = /400|422|valid JSON|0 widgets|truncated|Unexpected/i.test(lastError);
        if (!stepDown && step === 'json_schema') {
          lastError = `${lastError} (stepping down the response format ladder)`;
        }
      }
    }
  } catch (error) {
    if (error instanceof GenerationTimeoutError) throw error;
    lastError = error instanceof Error ? error.message : 'AI generation unavailable; used a data-fitted layout.';
  }

  const reason = lastError || 'Model did not return a usable dashboard spec.';
  return {
    spec: withUniqueId(fallbackSpec({ ...ctx, seed, archetype })),
    source: 'fallback',
    error: reason,
    fallbackReason: reason,
  };
}

function parseOrFallback(
  text: string,
  ctx: GenerateDashboardContext & { existing?: DashboardSpec; widgetId?: string },
  seed: number,
  archetype: DashboardSpec['archetype'],
  label: string,
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
      return { spec: withUniqueId(fallbackSpec({ ...ctx, seed, archetype })), source: 'fallback', error: reason, fallbackReason: reason };
    }
    return { spec: withUniqueId(finalizeDashboardSpec(spec, ctx.datasets)), source: 'ai' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : `${label} failed to parse.`;
    return { spec: withUniqueId(fallbackSpec({ ...ctx, seed, archetype })), source: 'fallback', error: reason, fallbackReason: reason };
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
    if (res.status === 504) {
      return {
        spec: fallbackSpec(ctx),
        source: 'fallback',
        error: data.error || 'Dashboard generation timed out.',
        fallbackReason: data.error || 'Dashboard generation timed out.',
      };
    }
    if (!res.ok && !data.spec) {
      return {
        spec: fallbackSpec(ctx),
        source: 'fallback',
        error: data.error || 'Dashboard generation failed.',
        fallbackReason: data.fallbackReason || data.error || 'Dashboard generation failed.',
      };
    }
    return {
      spec: data.spec,
      source: data.source || 'fallback',
      error: data.error,
      fallbackReason: data.fallbackReason,
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
