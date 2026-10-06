import { generateContent, loadAiSettings } from '../ai/client';
import { PROVIDERS } from '../ai/providers';
import { buildFallbackDashboard, varyWidget, type GenerateDashboardContext } from './fallback';
import { buildDashboardPrompt } from './prompt';
import { extractJsonObject, validateDashboardSpec } from './validate';
import type { DashboardSpec, DashboardWidget } from './types';

export async function generateDashboardSpec(
  ctx: GenerateDashboardContext & { instruction?: string; existing?: DashboardSpec; widgetId?: string },
): Promise<{ spec: DashboardSpec; source: 'ai' | 'fallback'; error?: string }> {
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

  const settings = loadAiSettings();
  const def = PROVIDERS[settings.provider];
  if (def.requiresApiKey && !settings.apiKey) {
    const fallback = ctx.widgetId && ctx.existing
      ? {
          ...ctx.existing,
          widgets: ctx.existing.widgets.map((w) =>
            w.id === ctx.widgetId ? varyWidget(w, ctx.datasets, seed) : w,
          ),
        }
      : buildFallbackDashboard({ ...ctx, seed, archetype });
    return {
      spec: fallback,
      source: 'fallback',
      error: 'No API key configured. Generated a data-fitted layout. Add a key in Settings to let a model design the board.',
    };
  }

  try {
    const result = await generateContent({ contents: prompt, json: true });
    const parsed = extractJsonObject(result.text);
    const spec = validateDashboardSpec(parsed, {
      seed,
      archetype,
      title: ctx.title,
      intent: ctx.intent,
      widgets: ctx.existing?.widgets,
    });
    if (spec.widgets.length === 0) {
      return { spec: buildFallbackDashboard({ ...ctx, seed, archetype }), source: 'fallback' };
    }
    return { spec, source: 'ai' };
  } catch (error) {
    const fallback = ctx.widgetId && ctx.existing
      ? {
          ...ctx.existing,
          widgets: ctx.existing.widgets.map((w) =>
            w.id === ctx.widgetId ? varyWidget(w, ctx.datasets, seed) : w,
          ),
        }
      : buildFallbackDashboard({ ...ctx, seed, archetype });
    return {
      spec: fallback,
      source: 'fallback',
      error: error instanceof Error ? error.message : 'AI generation unavailable; used a data-fitted layout.',
    };
  }
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
