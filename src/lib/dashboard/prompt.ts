import { computeDataTruth } from '../DataTruthEngine';
import { DESIGN_PRINCIPLES } from './archetypes';
import { PALETTES } from './palettes';
import { createRng, makeSeed, pick } from './seed';
import type { DashboardDataset, LayoutArchetype } from './types';
import { LAYOUT_ARCHETYPES } from './types';

export function summarizeDatasets(datasets: DashboardDataset[]): string {
  if (!datasets.length) return 'No datasets available.';
  return datasets
    .map((ds) => {
      const truth = computeDataTruth(ds.data || []);
      const numeric = Object.entries(truth.numericSummary)
        .map(([col, stat]) => `  - ${col}: sum=${stat.sum.toFixed(2)}, avg=${stat.avg.toFixed(2)}, min=${stat.min}, max=${stat.max}`)
        .join('\n');
      const categorical = Object.entries(truth.categoricalSummary)
        .map(([col, stat]) => `  - ${col}: ${stat.uniqueCount} distinct. Top: ${stat.topValues.map((v) => `${v.value} (${v.count})`).join(', ')}`)
        .join('\n');
      return `Dataset ID: ${ds.id}
Name: ${ds.name}
Rows: ${truth.rowCount}
Columns: ${(ds.columns || []).map((c) => c.name).join(', ') || Object.keys((ds.data || [])[0] || {}).join(', ')}
Numeric summaries:
${numeric || '  (none)'}
Categorical summaries:
${categorical || '  (none)'}`;
    })
    .join('\n\n');
}

export function buildDashboardPrompt(opts: {
  intent?: string;
  title?: string;
  datasets: DashboardDataset[];
  seed?: number;
  preferredArchetype?: LayoutArchetype;
  existingJson?: string;
  widgetId?: string;
  instruction?: string;
}): { prompt: string; seed: number; archetype: LayoutArchetype } {
  const seed = opts.seed || makeSeed([opts.intent, opts.title, opts.widgetId, Date.now()]);
  const rng = createRng(seed);
  const archetype = opts.preferredArchetype || pick(rng, LAYOUT_ARCHETYPES);
  const paletteHint = pick(rng, PALETTES);
  const principles = DESIGN_PRINCIPLES.map((p, i) => `${i + 1}. ${p}`).join('\n');

  const scope = opts.widgetId
    ? `Regenerate ONLY the widget with id "${opts.widgetId}". Return the full dashboard JSON with that widget replaced and everything else preserved.`
    : opts.existingJson
      ? `Modify the existing dashboard according to the user instruction. Return a complete replacement spec.`
      : `Create a brand-new dashboard. Do not reuse a 4-KPI + 2-column template.`;

  const prompt = `You are the Visual Systems designer for SentinelBI. Compose a unique, polished analytics dashboard as STRICT JSON (no markdown).

USER INTENT: ${opts.intent || opts.instruction || 'Explore the dataset and surface the most useful operating picture.'}
PREFERRED ARCHETYPE for this seed (${seed}): ${archetype}
PREFERRED PALETTE: ${paletteHint.id} (${paletteHint.mode})
${scope}
${opts.instruction ? `Additional instruction: ${opts.instruction}` : ''}

DESIGN PRINCIPLES:
${principles}

VARIETY RULES:
- The layout MUST use the 12-column grid with explicit x,y,w,h on every widget. Mix widths (3,4,5,6,8,12) and heights (3,4,6,7).
- Archetype "${archetype}" should be recognizable but not copy a generic SaaS template.
- Choose chart types from: bar, stacked-bar, horizontal-bar, line, stepped-line, area, pie, donut, scatter, bubble, force, pack, radial, tree, treemap, heatmap.
- Do not assign the same chartType to two adjacent widgets.
- KPI values MUST come from the numeric summaries (format as currency when the field is money-like).
- Insights must mention a real dimension or metric from the summaries.

DATA:
${summarizeDatasets(opts.datasets)}

${opts.existingJson ? `CURRENT SPEC:\n${opts.existingJson}\n` : ''}

Return JSON with this exact shape:
{
  "version": 1,
  "id": "string",
  "title": "string",
  "subtitle": "string",
  "intent": "string",
  "archetype": "${archetype}",
  "seed": ${seed},
  "theme": {
    "palette": { "id": "${paletteHint.id}", "label": "${paletteHint.label}", "mode": "${paletteHint.mode}", "background": "${paletteHint.background}", "surface": "${paletteHint.surface}", "text": "${paletteHint.text}", "muted": "${paletteHint.muted}", "accent": "${paletteHint.accent}", "accentSoft": "${paletteHint.accentSoft}", "border": "${paletteHint.border}", "chart": ${JSON.stringify(paletteHint.chart)} },
    "fontFamily": "font-sans|font-grotesk|font-outfit|font-serif|font-mono|font-roboto",
    "headingFont": "font-grotesk",
    "radius": "rounded-2xl|rounded-3xl|rounded-xl",
    "density": "compact|comfortable|airy"
  },
  "narrative": { "headline": "string", "body": "string" },
  "sections": [{ "id": "main", "title": "string" }],
  "widgets": [
    {
      "id": "string",
      "type": "kpi|chart|insight|table|section",
      "title": "string",
      "subtitle": "string",
      "layout": { "x": 0, "y": 0, "w": 6, "h": 4 },
      "chartType": "bar",
      "datasetId": "exact dataset id",
      "xField": "exact column",
      "yField": "exact column",
      "aggregation": "sum",
      "color": "#2563eb",
      "kpi": { "value": "1,240", "trend": "+4%", "field": "exact column", "aggregation": "sum", "format": "number" },
      "insight": { "text": "finding", "tone": "positive" }
    }
  ]
}`;

  return { prompt, seed, archetype };
}
