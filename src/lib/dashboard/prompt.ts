import { computeDataTruth } from '../DataTruthEngine';
import { DESIGN_PRINCIPLES } from './archetypes';
import { catalogPromptBlock } from './catalog';
import { analyzeDataset, classifyFields, prettyField } from './insights';
import { proposeDerivedMeasures } from './measures';
import { PALETTES, palettesForMode } from './palettes';
import { createRng, makeSeed, pick } from './seed';
import type { DashboardDataset, LayoutArchetype } from './types';
import { LAYOUT_ARCHETYPES } from './types';

export function summarizeDatasets(datasets: DashboardDataset[]): string {
  if (!datasets.length) return 'No datasets available.';
  return datasets
    .map((ds) => {
      const truth = computeDataTruth(ds.data || []);
      const fields = classifyFields(ds);
      const findings = analyzeDataset(ds);
      const numeric = Object.entries(truth.numericSummary)
        .map(([col, stat]) => `  - ${col}: sum=${stat.sum.toFixed(2)}, avg=${stat.avg.toFixed(2)}, min=${stat.min}, max=${stat.max}`)
        .join('\n');
      const categorical = fields.dimensions
        .map((col) => {
          const stat = truth.categoricalSummary[col];
          if (!stat) return `  - ${col}`;
          return `  - ${col}: ${stat.uniqueCount} distinct. Top: ${stat.topValues.map((v) => `${v.value} (${v.count})`).join(', ')}`;
        })
        .join('\n');
      return `Dataset ID: ${ds.id}
Name: ${ds.name}
Rows: ${truth.rowCount}
Measures: ${fields.measures.join(', ') || '(none)'}
Dimensions: ${fields.dimensions.join(', ') || '(none)'}
Time fields: ${fields.time.join(', ') || '(none)'}
Numeric summaries:
${numeric || '  (none)'}
Categorical summaries (do NOT treat time fields as categories):
${categorical || '  (none)'}
Computed findings you may quote or refine:
${findings.map((f) => `  - ${f.title}: ${f.text}`).join('\n')}`;
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
  mode?: 'light' | 'dark';
}): { prompt: string; seed: number; archetype: LayoutArchetype } {
  const seed = opts.seed || makeSeed([opts.intent, opts.title, opts.widgetId, Date.now()]);
  const rng = createRng(seed);
  const archetype = opts.preferredArchetype || pick(rng, LAYOUT_ARCHETYPES);
  const mode = opts.mode || 'light';
  const paletteHint = pick(rng, palettesForMode(mode).length ? palettesForMode(mode) : PALETTES);
  const principles = DESIGN_PRINCIPLES.map((p, i) => `${i + 1}. ${p}`).join('\n');

  const scope = opts.widgetId
    ? `Regenerate ONLY the widget with id "${opts.widgetId}". Return the full dashboard JSON with that widget replaced and everything else preserved.`
    : opts.existingJson
      ? `Modify the existing dashboard according to the user instruction. Return a complete replacement spec.`
      : `Create a brand-new dashboard. Do not reuse a 4-KPI + 2-column template. The opening row must match the archetype brief.`;

  const archetypeBrief: Record<LayoutArchetype, string> = {
    'hero-kpi-rail': 'Executive OPENING: one oversized hero KPI (w=6–7, h=4) plus 2–3 supporting metrics of mixed sizes — NEVER a row of four equal KPI tiles. Then an insight strip, a full-width hero trend (h=6), two supporting charts.',
    editorial: 'Editorial OPENING: section headline + a short featured insight (w=5, h=3–4) beside one hero chart (w=7, h=6). KPIs come AFTER the story, 2–3 larger cards. Never start with a KPI strip. Insight cards must not be tall empty columns.',
    'command-center': 'Analytical OPENING: chart-first. Hero chart (w=8, h=7) with a KPI sidebar (w=4) of 2–3 stacked metrics. Then diagnostic charts and a table. Do not open with four KPIs.',
    'story-arc': 'Narrative walk: section headline, hero trend first, insight strip, then 2–3 KPIs, then a table.',
    'split-insight': 'Short featured finding (w=4, h=5) on the left, hero chart on the right, then KPIs and a second chart. Do not make the insight a tall empty column.',
    'metric-mosaic': 'KPI wall OPENING: a dense mosaic of VARIED card sizes (6×3, 3×3, 4×2, 8×2, …) — never eight identical 3×2 tiles. Use only real business metrics; fewer larger cards if measures are scarce. Then one working chart + insight.',
    comparison: 'Comparison OPENING: split A/B header — two large KPIs (w=6, h=3) with roles compare-a and compare-b — then two equal comparison charts (w=6, h=6). Not a four-KPI strip.',
    'funnel-flow': 'Flow OPENING: full-width trend first (no KPI row), then three equal diagnostic charts, KPIs last.',
  };

  const prompt = `You are the Visual Systems designer for SentinelBI. Compose a unique, polished analytics dashboard as STRICT JSON (no markdown). The rendered board must look like Linear / Vercel / Stripe / Observable: full-width, compact, typographically disciplined.

USER INTENT: ${opts.intent || opts.instruction || 'Explore the dataset and surface the most useful operating picture.'}
APP MODE: ${mode}. Use a ${mode} palette. Never place a dark board on a light page or a light island on a dark page.
PREFERRED ARCHETYPE for this seed (${seed}): ${archetype}
ARCHETYPE COMPOSITION: ${archetypeBrief[archetype]}
PREFERRED PALETTE: ${paletteHint.id} (${paletteHint.mode})
${scope}
${opts.instruction ? `Additional instruction: ${opts.instruction}` : ''}

DESIGN RULES:
${principles}
8. Fill the entire 12-column grid. Every row should sum to w=12. No orphaned empty right half.
9. KPI count and size MUST vary with the archetype. Hero KPIs may be h=3–4 / w=6–7. Supporting KPIs may be h=2. Include kpi.value, kpi.delta, kpi.sparkline (6–10 numbers), and kpi.polarity.
10. Chart tiles are h=5–7 and MUST fill the card (no empty band under the plot). Time fields encode as line/area, sorted chronologically. Categories encode as bar/donut/horizontal-bar. NEVER use a date as a “leader” dimension.
11. Insight copy must be grammatical and specific, e.g. “${prettyField('region') || 'APAC'} generated $75.4K in revenue, 19% of the total.” Forbidden: “2026-09-08 leads Date with 1 observations”. Featured insight cards are h=3–5 (content-fit), never h=7+ empty columns.
12. Adjacent charts must use different chartType values. Comparison boards must encode two different dimensions and open with a split A/B header.
13. theme.palette.background must be "transparent". Cards use a surface that matches ${mode} mode.
14. Keep titles short. NEVER emit filler / meta KPIs: rows loaded, number of channels, number of devices, unique counts of dimensions, “Active cohorts”. If there are only 2–3 real measures, draw 2–3 larger cards.
15. polarity is required on every KPI: "higher-is-better" (revenue, conversions, sessions) or "lower-is-better" (bounce rate, churn, cost, CAC, latency, errors, refunds, attrition). The UI colors an increase red and a decrease green when polarity is lower-is-better.
16. Choose fields, aggregations, and derived measures. NEVER invent KPI numbers, deltas, or claims — the server computes every value from the rows. For a simple metric emit measure: { "field": "revenue", "agg": "sum", "format": "currency" }. For a ratio emit measure: { "kind": "ratio", "numerator": { "field": "revenue", "agg": "sum" }, "denominator": { "field": "units", "agg": "sum" }, "format": "currency" }. Sentence case titles. No eyebrows or repeated headlines.
17. Pick componentId ONLY from the catalog below. Do not invent chartType names outside the catalog. Use series[] for multi-measure charts (style may be line|bar|area|dashed|target) and table.groupBy/sort/limit for ranked tables. Horizontal bars put the dimension on xField and the measure on yField.

COMPONENT CATALOG (the only visual vocabulary):
${catalogPromptBlock()}

DERIVED MEASURE CANDIDATES:
${opts.datasets.map((ds) => proposeDerivedMeasures(ds).map((m) => m.measure ? `${m.title}: ${m.measure.kind} ${m.measure.numerator.field}/${m.measure.denominator.field}` : `${m.title}: avg ${m.field}`).join(', ') || '(none)').join('\n')}

VARIETY RULES:
- Mix widths (3,4,6,8,12). Do not clone a generic SaaS 4-up + 2-chart template unless the archetype is executive.
- 10–14 widgets: KPI rail, hero trend with compare, breakdown, composition (treemap or donut), ranking, table with groupBy, insight.
- Unique titles. Subtitle must not repeat the title. Two widgets may not share the same measure+dimension+grain.
- Donuts only for additive part-to-whole measures, ≤7 slices. Rate metrics use bars.
- Quote or refine the computed findings; do not invent numbers that contradict the summaries.

EXAMPLE SPEC for ${archetype} (compact, valid — vary fields for this dataset):
${exampleSpec(archetype)}

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
    "palette": { "id": "${paletteHint.id}", "label": "${paletteHint.label}", "mode": "${mode}", "background": "transparent", "surface": "${paletteHint.surface}", "text": "${paletteHint.text}", "muted": "${paletteHint.muted}", "accent": "${paletteHint.accent}", "accentSoft": "${paletteHint.accentSoft}", "border": "${paletteHint.border}", "chart": ${JSON.stringify(paletteHint.chart)} },
    "fontFamily": "font-sans",
    "headingFont": "font-grotesk",
    "radius": "rounded-2xl",
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
      "role": "hero|support|compare-a|compare-b|strip|featured",
      "layout": { "x": 0, "y": 0, "w": 6, "h": 4 },
      "chartType": "bar",
      "datasetId": "exact dataset id",
      "xField": "exact column",
      "yField": "exact column",
      "aggregation": "sum",
      "componentId": "arc.line-chart",
      "measure": { "field": "revenue", "agg": "sum", "format": "currency" },
      "series": [{ "field": "revenue", "style": "line" }, { "field": "budget_opex", "style": "target" }],
      "table": { "groupBy": ["region", "channel"], "sort": { "field": "revenue", "dir": "desc" }, "limit": 12 },
      "polarity": "higher-is-better",
      "color": "#2563eb",
      "kpi": { "value": "1,240", "trend": "+4.2% vs first half", "field": "exact column", "aggregation": "sum", "format": "number", "delta": 4.2, "sparkline": [1, 2, 3, 4], "polarity": "higher-is-better" },
      "insight": { "title": "finding title", "text": "grammatical finding", "tone": "positive" }
    }
  ]
}`;

  return { prompt, seed, archetype };
}

function exampleSpec(archetype: LayoutArchetype): string {
  const examples: Record<LayoutArchetype, string> = {
    'hero-kpi-rail': '{"title":"Executive revenue review","archetype":"hero-kpi-rail","widgets":[{"type":"kpi","title":"Total revenue","role":"hero","layout":{"x":0,"y":0,"w":6,"h":4},"measure":{"field":"revenue","agg":"sum","format":"currency"}},{"type":"chart","title":"Revenue trend","componentId":"arc.brush-chart","layout":{"x":0,"y":6,"w":12,"h":6},"xField":"order_date","yField":"revenue"}]}',
    editorial: '{"title":"Editorial briefing","archetype":"editorial","widgets":[{"type":"section","title":"What changed","layout":{"x":0,"y":0,"w":12,"h":2}},{"type":"insight","role":"featured","layout":{"x":0,"y":2,"w":5,"h":2},"insight":{"text":"APAC generated 19% of revenue."}},{"type":"chart","title":"Revenue by region","componentId":"arc.bar-chart","layout":{"x":5,"y":2,"w":7,"h":6},"xField":"region","yField":"revenue"}]}',
    'command-center': '{"title":"Analytical deep-dive","archetype":"command-center","widgets":[{"type":"chart","title":"Monthly revenue","role":"hero","componentId":"arc.line-chart","layout":{"x":0,"y":0,"w":8,"h":7},"xField":"order_date","yField":"revenue"},{"type":"kpi","title":"Total revenue","layout":{"x":8,"y":0,"w":4,"h":3},"measure":{"field":"revenue","agg":"sum","format":"currency"}}]}',
    'story-arc': '{"title":"Story arc","archetype":"story-arc","widgets":[{"type":"section","title":"The walk","layout":{"x":0,"y":0,"w":12,"h":2}},{"type":"chart","componentId":"arc.brush-chart","layout":{"x":0,"y":2,"w":12,"h":6},"xField":"order_date","yField":"revenue"}]}',
    'split-insight': '{"title":"Insight split","archetype":"split-insight","widgets":[{"type":"insight","role":"featured","layout":{"x":0,"y":0,"w":4,"h":4},"insight":{"text":"Partner share slipped."}},{"type":"chart","componentId":"arc.bar-chart","layout":{"x":4,"y":0,"w":8,"h":4},"xField":"channel","yField":"revenue"}]}',
    'metric-mosaic': '{"title":"KPI wall","archetype":"metric-mosaic","widgets":[{"type":"kpi","role":"hero","layout":{"x":0,"y":0,"w":6,"h":3},"measure":{"field":"revenue","agg":"sum","format":"currency"}},{"type":"kpi","layout":{"x":6,"y":0,"w":6,"h":3},"measure":{"field":"units","agg":"sum","format":"number"}}]}',
    comparison: '{"title":"Side-by-side","archetype":"comparison","widgets":[{"type":"kpi","role":"compare-a","layout":{"x":0,"y":0,"w":6,"h":3},"measure":{"field":"revenue","agg":"sum","format":"currency"}},{"type":"kpi","role":"compare-b","layout":{"x":6,"y":0,"w":6,"h":3},"measure":{"kind":"ratio","numerator":{"field":"revenue","agg":"sum"},"denominator":{"field":"units","agg":"sum"},"format":"currency"}}]}',
    'funnel-flow': '{"title":"Flow review","archetype":"funnel-flow","widgets":[{"type":"chart","role":"hero","componentId":"arc.brush-chart","layout":{"x":0,"y":0,"w":12,"h":6},"xField":"date","yField":"sessions"},{"type":"chart","componentId":"arc.donut-chart","layout":{"x":0,"y":6,"w":4,"h":5},"xField":"channel","yField":"sessions"}]}',
  };
  return examples[archetype];
}
