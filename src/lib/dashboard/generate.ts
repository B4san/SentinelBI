import { loadAiSettings } from '../ai/client';
import { openaiGenerate } from '../ai/openaiCompatible';
import { geminiGenerate } from '../ai/geminiAdapter';
import { PROVIDERS } from '../ai/providers';
import { resolveProviderConfig } from '../ai/resolve';
import type { EnvLike } from '../ai/resolve';
import { DASHBOARD_JSON_SCHEMA } from './schema';
import { catalogPromptBlock } from './catalog';
import { buildFallbackDashboard, varyWidget, type GenerateDashboardContext } from './fallback';
import { finalizeDashboardSpec } from './finalize';
import { buildDashboardPrompt } from './prompt';
import { extractJsonObject, validateDashboardSpec } from './validate';
import type { DashboardSpec, DashboardWidget } from './types';

export interface GenerateDashboardResult {
  spec: DashboardSpec;
  source: 'ai' | 'fallback';
  error?: string;
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
    return {
      spec: fallbackSpec({ ...ctx, seed, archetype }),
      source: 'fallback',
      error: 'No API key on the server or in the request. Generated a data-fitted layout.',
    };
  }

  try {
    const text = def.compatible === 'gemini'
      ? await geminiGenerate(config, [{ role: 'user', content: prompt }])
      : await openaiGenerate(config, [{ role: 'user', content: prompt }], {
          json: true,
          temperature: 0.4,
          maxTokens: Number(env.AI_MAX_TOKENS || 8000),
          jsonSchema: DASHBOARD_JSON_SCHEMA,
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
      return { spec: fallbackSpec({ ...ctx, seed, archetype }), source: 'fallback' };
    }
    return { spec: finalizeDashboardSpec(spec, ctx.datasets), source: 'ai' };
  } catch (error) {
    return {
      spec: fallbackSpec({ ...ctx, seed, archetype }),
      source: 'fallback',
      error: error instanceof Error ? error.message : 'AI generation unavailable; used a data-fitted layout.',
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
        error: data.error || 'Dashboard generation failed.',
      };
    }
    return {
      spec: data.spec,
      source: data.source || 'fallback',
      error: data.error,
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
