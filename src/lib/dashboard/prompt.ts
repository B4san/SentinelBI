import { computeDataTruth } from '../DataTruthEngine';
import { catalogPromptBlock } from './catalog';
import { analyzeDataset, classifyFields, prettyField } from './insights';
import { proposeDerivedMeasures } from './measures';
import { PALETTES, palettesForMode } from './palettes';
import { createRng, makeSeed, pick } from './seed';
import type { DashboardDataset, LayoutArchetype } from './types';
import { LAYOUT_ARCHETYPES } from './types';

export const ARC_DESIGN_GUIDE = `Arc composition (Power BI-grade or better — never a grid of identical grey cards):
- The renderer mounts real Arc / Planes / Space UI components: MetricCard + AnimatedCounter, Sparkline (area, scrubbable), Gauge (270° radial), BarChart (rounded growing bars + average line), LineChart (monotone + gradient area), BrushChart (focus+context), DonutChart (gapped arcs), Treemap, SlopeChart, WaffleChart, SortableDataTable, ChipGroup, FilterToolbar, SegmentedControl, Badge.
- Pick componentId ONLY from the catalog. Hero KPIs use arc.metric-card (role=hero, h>=4) so they get glass/gradient + sparkline. Attainment uses arc.gauge. Tiny trends use arc.sparkline.
- Distinctive chart styling is required: rounded bars, annotated average, compare overlays as dashed series, donuts with a centre total, gauges with thresholds. Do not emit a generic "bar chart" when a slope, waffle, bullet, or brush is the better question.
- One hero insight backed by a computed fact. 3–4 KPI cards with sparklines and real measures (including derived ratios like AOV, weighted margin, opex vs budget). No filler unique-counts.
- Match the chart to the question: trend → line/area/brush with compare overlay; part-to-whole → donut/treemap/waffle only if ≤6 parts AND shares differ; ranking → sorted bars with data labels; distribution → scatter; variance vs target → bullet-variance; many groups over time → small multiples; period change → slope chart.
- Avoid 3 near-equal bars or a donut of equal thirds — pick a more informative cut (another dimension, a trend, a ranking).
- No duplicated widgets or titles. Sentence-case titles. Never raw field names (use Gross margin, EBITDA, Avg session duration).
- NEVER state numbers yourself. Emit encodings only; the server computes and verifies every KPI, delta, and insight sentence.
- Fill a 12-column grid. Rows sum to w=12. Vary opening by archetype. Adjacent charts use different types.
- polarity required on KPIs: higher-is-better vs lower-is-better.
- Use series[] for overlays (line|bar|area|dashed|target).`;

export const EXAMPLE_SPECS: Record<'editorial' | 'command-center' | 'sales' | 'web' | 'finance', unknown> = {
  editorial: {
    version: 1,
    title: 'Pricing briefing',
    archetype: 'editorial',
    widgets: [
      { type: 'section', title: 'Overview', layout: { x: 0, y: 0, w: 12, h: 2 } },
      { type: 'insight', role: 'featured', title: 'Key finding', layout: { x: 0, y: 2, w: 5, h: 3 }, insight: { title: 'Key finding', text: 'Server will replace this with a computed fact.', tone: 'neutral' } },
      { type: 'chart', title: 'Revenue trend', role: 'hero', componentId: 'arc.brush-chart', chartType: 'area', layout: { x: 5, y: 2, w: 7, h: 6 }, xField: 'order_date', yField: 'revenue', measure: { field: 'revenue', agg: 'sum', format: 'currency' }, compare: 'previous-period' },
      { type: 'kpi', title: 'Gross margin', componentId: 'arc.metric-card', layout: { x: 0, y: 5, w: 5, h: 3 }, measure: { kind: 'weighted', numerator: { field: 'gross_margin', agg: 'avg' }, denominator: { field: 'revenue', agg: 'sum' }, format: 'percent' }, polarity: 'higher-is-better' },
      { type: 'kpi', title: 'AOV', componentId: 'arc.metric-card', layout: { x: 0, y: 8, w: 4, h: 2 }, measure: { kind: 'ratio', numerator: { field: 'revenue', agg: 'sum' }, denominator: { field: 'revenue', agg: 'count' }, format: 'currency' } },
      { type: 'kpi', title: 'Discount rate', componentId: 'arc.metric-card', layout: { x: 4, y: 8, w: 4, h: 2 }, measure: { kind: 'weighted', numerator: { field: 'discount_rate', agg: 'avg' }, denominator: { field: 'revenue', agg: 'sum' }, format: 'percent' }, polarity: 'lower-is-better' },
      { type: 'kpi', title: 'Revenue', componentId: 'arc.metric-card', layout: { x: 8, y: 8, w: 4, h: 2 }, measure: { field: 'revenue', agg: 'sum', format: 'currency' } },
      { type: 'chart', title: 'Revenue by region', componentId: 'arc.bar-chart', chartType: 'bar', layout: { x: 0, y: 10, w: 6, h: 5 }, xField: 'region', yField: 'revenue' },
      { type: 'chart', title: 'Revenue share by channel', componentId: 'arc.donut-chart', chartType: 'donut', layout: { x: 6, y: 10, w: 6, h: 5 }, xField: 'channel', yField: 'revenue' },
      { type: 'table', title: 'Region × channel by revenue', componentId: 'arc.sortable-data-table', layout: { x: 0, y: 15, w: 12, h: 6 }, table: { groupBy: ['region', 'channel'], sort: { field: 'revenue', dir: 'desc' }, limit: 8, measures: [{ field: 'revenue', agg: 'sum', format: 'currency' }] } },
    ],
  },
  'command-center': {
    version: 1,
    title: 'Operations command',
    archetype: 'command-center',
    widgets: [
      { type: 'chart', title: 'Revenue trend', role: 'hero', componentId: 'arc.line-chart', chartType: 'area', layout: { x: 0, y: 0, w: 8, h: 7 }, xField: 'month', yField: 'revenue', compare: 'previous-year' },
      { type: 'kpi', title: 'Opex vs budget', componentId: 'arc.metric-card', layout: { x: 8, y: 0, w: 4, h: 2 }, measure: { kind: 'difference', numerator: { field: 'opex', agg: 'sum' }, denominator: { field: 'budget_opex', agg: 'sum' }, format: 'currency' }, polarity: 'lower-is-better' },
      { type: 'kpi', title: 'EBITDA margin', componentId: 'arc.metric-card', layout: { x: 8, y: 2, w: 4, h: 2 }, measure: { kind: 'ratio', numerator: { field: 'ebitda', agg: 'sum' }, denominator: { field: 'revenue', agg: 'sum' }, format: 'percent' } },
      { type: 'kpi', title: 'DSO', componentId: 'arc.metric-card', layout: { x: 8, y: 4, w: 4, h: 3 }, yField: 'dso_days', aggregation: 'avg' },
      { type: 'chart', title: 'Opex vs budget', componentId: 'sbi.bullet-variance', layout: { x: 0, y: 7, w: 6, h: 5 }, xField: 'business_unit', yField: 'opex', targetField: 'budget_opex', series: [{ field: 'opex', style: 'bar' }, { field: 'budget_opex', style: 'target' }] },
      { type: 'chart', title: 'Revenue mix', componentId: 'arc.treemap', chartType: 'treemap', layout: { x: 6, y: 7, w: 6, h: 5 }, xField: 'cost_center', yField: 'revenue' },
      { type: 'chart', title: 'Revenue change by unit', componentId: 'arc.slope-chart', layout: { x: 0, y: 12, w: 6, h: 5 }, xField: 'business_unit', yField: 'revenue' },
      { type: 'chart', title: 'Revenue by month', componentId: 'sbi.small-multiples', layout: { x: 6, y: 12, w: 6, h: 5 }, xField: 'month', yField: 'revenue', groupField: 'business_unit' },
      { type: 'table', title: 'Unit × cost center', componentId: 'arc.sortable-data-table', layout: { x: 0, y: 17, w: 12, h: 6 }, table: { groupBy: ['business_unit', 'cost_center'], sort: { field: 'revenue', dir: 'desc' }, limit: 8, measures: [{ field: 'revenue', agg: 'sum', format: 'currency' }, { field: 'opex', agg: 'sum', format: 'currency' }] } },
      { type: 'insight', role: 'strip', title: 'Key finding', layout: { x: 0, y: 23, w: 12, h: 2 }, insight: { text: 'Server will replace this with a computed fact.' } },
    ],
  },
  sales: {
    version: 1,
    title: 'Northstar revenue',
    archetype: 'hero-kpi-rail',
    widgets: [
      { type: 'kpi', title: 'Revenue', role: 'hero', componentId: 'arc.metric-card', layout: { x: 0, y: 0, w: 7, h: 4 }, measure: { field: 'revenue', agg: 'sum', format: 'currency' }, polarity: 'higher-is-better' },
      { type: 'kpi', title: 'Gross margin', componentId: 'arc.gauge', layout: { x: 7, y: 0, w: 5, h: 4 }, measure: { kind: 'weighted', numerator: { field: 'gross_margin', agg: 'avg' }, denominator: { field: 'revenue', agg: 'sum' }, format: 'percent' } },
      { type: 'chart', title: 'Revenue trend', role: 'hero', componentId: 'arc.brush-chart', chartType: 'area', layout: { x: 0, y: 4, w: 12, h: 6 }, xField: 'order_date', yField: 'revenue', compare: 'previous-period' },
      { type: 'chart', title: 'Revenue by region', componentId: 'arc.bar-chart', chartType: 'bar', layout: { x: 0, y: 10, w: 6, h: 5 }, xField: 'region', yField: 'revenue' },
      { type: 'chart', title: 'Channel mix', componentId: 'arc.donut-chart', chartType: 'donut', layout: { x: 6, y: 10, w: 6, h: 5 }, xField: 'channel', yField: 'revenue' },
      { type: 'table', title: 'Region × product', componentId: 'arc.sortable-data-table', layout: { x: 0, y: 15, w: 12, h: 6 }, table: { groupBy: ['region', 'product'], sort: { field: 'revenue', dir: 'desc' }, limit: 8, measures: [{ field: 'revenue', agg: 'sum', format: 'currency' }] } },
    ],
  },
  web: {
    version: 1,
    title: 'Atlas acquisition',
    archetype: 'funnel-flow',
    widgets: [
      { type: 'chart', title: 'Sessions', role: 'hero', componentId: 'arc.line-chart', chartType: 'area', layout: { x: 0, y: 0, w: 12, h: 6 }, xField: 'date', yField: 'sessions' },
      { type: 'kpi', title: 'Bounce rate', componentId: 'arc.sparkline', layout: { x: 0, y: 6, w: 4, h: 3 }, measure: { kind: 'weighted', numerator: { field: 'bounce_rate', agg: 'avg' }, denominator: { field: 'sessions', agg: 'sum' }, format: 'percent' }, polarity: 'lower-is-better' },
      { type: 'kpi', title: 'Conversion', componentId: 'arc.gauge', layout: { x: 4, y: 6, w: 4, h: 3 }, measure: { kind: 'ratio', numerator: { field: 'conversions', agg: 'sum' }, denominator: { field: 'sessions', agg: 'sum' }, format: 'percent' } },
      { type: 'kpi', title: 'Ad spend', componentId: 'arc.metric-card', layout: { x: 8, y: 6, w: 4, h: 3 }, measure: { field: 'ad_spend', agg: 'sum', format: 'currency' }, polarity: 'lower-is-better' },
      { type: 'chart', title: 'Sessions by channel', componentId: 'arc.waffle-chart', layout: { x: 0, y: 9, w: 6, h: 5 }, xField: 'channel', yField: 'sessions' },
      { type: 'chart', title: 'Conversion by device', componentId: 'arc.bar-chart', chartType: 'bar', layout: { x: 6, y: 9, w: 6, h: 5 }, xField: 'device', yField: 'conversions' },
    ],
  },
  finance: {
    version: 1,
    title: 'Finance operations',
    archetype: 'command-center',
    widgets: [
      { type: 'chart', title: 'Revenue', role: 'hero', componentId: 'arc.line-chart', chartType: 'area', layout: { x: 0, y: 0, w: 8, h: 6 }, xField: 'month', yField: 'revenue' },
      { type: 'kpi', title: 'EBITDA margin', componentId: 'arc.gauge', layout: { x: 8, y: 0, w: 4, h: 3 }, measure: { kind: 'ratio', numerator: { field: 'ebitda', agg: 'sum' }, denominator: { field: 'revenue', agg: 'sum' }, format: 'percent' } },
      { type: 'kpi', title: 'Opex vs budget', componentId: 'arc.metric-card', layout: { x: 8, y: 3, w: 4, h: 3 }, measure: { kind: 'difference', numerator: { field: 'opex', agg: 'sum' }, denominator: { field: 'budget_opex', agg: 'sum' }, format: 'currency' }, polarity: 'lower-is-better' },
      { type: 'chart', title: 'Opex vs budget', componentId: 'sbi.bullet-variance', layout: { x: 0, y: 6, w: 6, h: 5 }, xField: 'business_unit', yField: 'opex', targetField: 'budget_opex', series: [{ field: 'opex', style: 'bar' }, { field: 'budget_opex', style: 'target' }] },
      { type: 'chart', title: 'Revenue change by unit', componentId: 'arc.slope-chart', layout: { x: 6, y: 6, w: 6, h: 5 }, xField: 'business_unit', yField: 'revenue' },
      { type: 'table', title: 'Unit × cost center', componentId: 'arc.sortable-data-table', layout: { x: 0, y: 11, w: 12, h: 6 }, table: { groupBy: ['business_unit', 'cost_center'], sort: { field: 'revenue', dir: 'desc' }, limit: 8, measures: [{ field: 'revenue', agg: 'sum', format: 'currency' }, { field: 'opex', agg: 'sum', format: 'currency' }] } },
    ],
  },
};

export function summarizeDatasets(datasets: DashboardDataset[]): string {
  if (!datasets.length) return 'No datasets available.';
  return datasets
    .map((ds) => {
      const truth = computeDataTruth(ds.data || []);
      const fields = classifyFields(ds);
      const findings = analyzeDataset(ds).slice(0, 4);
      const cats = fields.dimensions.map((col) => {
        const stat = truth.categoricalSummary[col];
        return stat ? `${col} (${stat.uniqueCount}: ${stat.topValues.slice(0, 4).map((v) => v.value).join(', ')})` : col;
      });
      const derived = proposeDerivedMeasures(ds).map((m) => m.title).join(', ') || 'none';
      return `Dataset ${ds.id} "${ds.name}" rows=${truth.rowCount}
Measures: ${fields.measures.join(', ') || '(none)'}
Dimensions: ${cats.join('; ') || '(none)'}
Time: ${fields.time.join(', ') || '(none)'}
Derived candidates: ${derived}
Findings (refine, do not invent numbers): ${findings.map((f) => f.title).join('; ') || '(none)'}`;
    })
    .join('\n\n');
}

const ARCHETYPE_BRIEF: Record<LayoutArchetype, string> = {
  'hero-kpi-rail': 'Open with one oversized hero KPI (w=6–7, h=4) plus 2–3 mixed supporting metrics — never four equal tiles. Then insight strip + full-width trend.',
  editorial: 'Open with a featured insight (w=5, h=3) beside a hero chart (w=7, h=6). KPIs AFTER the story.',
  'command-center': 'Chart-first: hero trend w=8 h=7 with a KPI sidebar w=4. Then diagnostics and a table.',
  'story-arc': 'Section headline, hero trend, insight, then 2–3 KPIs, then a table.',
  'split-insight': 'Featured finding w=4 on the left, hero chart on the right, then KPIs.',
  'metric-mosaic': 'Varied KPI sizes (6×3, 3×3, 4×2) — never eight identical 3×2 tiles — then one working chart.',
  comparison: 'Split A/B header: two large KPIs w=6 h=3 with roles compare-a/compare-b, then two comparison charts.',
  'funnel-flow': 'Full-width trend first, then three diagnostic charts, KPIs last.',
};

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

  const scope = opts.widgetId
    ? `Regenerate ONLY widget id "${opts.widgetId}". Return the full dashboard JSON with that widget replaced.`
    : opts.existingJson
      ? 'Modify the existing dashboard according to the instruction. Return a complete replacement spec.'
      : 'Create a brand-new dashboard. Opening must match the archetype brief.';

  const examples = archetype === 'command-center'
    ? EXAMPLE_SPECS.finance
    : archetype === 'funnel-flow'
      ? EXAMPLE_SPECS.web
      : archetype === 'hero-kpi-rail'
        ? EXAMPLE_SPECS.sales
        : EXAMPLE_SPECS.editorial;

  const prompt = `You are SentinelBI's Visual Systems designer. Return STRICT JSON (no markdown) for an Arc dashboard.

USER INTENT: ${opts.intent || opts.instruction || 'Surface the most useful operating picture.'}
TITLE LOCK: ${opts.title || '(compose a short sentence-case title if empty — the server may overwrite it with the user title)'}
APP MODE: ${mode}. Palette hint: ${paletteHint.id}. theme.palette.background="transparent".
ARCHETYPE: ${archetype}. ${ARCHETYPE_BRIEF[archetype]}
SEED: ${seed}
${scope}
${opts.instruction ? `Instruction: ${opts.instruction}` : ''}

${ARC_DESIGN_GUIDE}

COMPONENT CATALOG:
${catalogPromptBlock()}

EXAMPLE SPEC (different archetype than a clone of this; vary fields to THIS dataset):
${JSON.stringify(examples)}

DATA:
${summarizeDatasets(opts.datasets)}

${opts.existingJson ? `CURRENT SPEC:\n${opts.existingJson}\n` : ''}

Return JSON: {version,id,title,subtitle,intent,archetype:"${archetype}",seed:${seed},theme:{palette:{id:"${paletteHint.id}",mode:"${mode}",background:"transparent",surface,text,muted,accent,accentSoft,border,chart},fontFamily:"font-sans",headingFont:"font-grotesk",radius:"rounded-2xl",density},narrative:{headline,body},widgets:[{id,type,title,role,layout,chartType,datasetId,xField,yField,aggregation,componentId,measure,series,table,polarity,color,kpi,insight}]}.
Use exact column names from DATA. Dataset id must match. Field "${prettyField('revenue')}" is a label, not a column.`;

  return { prompt, seed, archetype };
}

export function promptGuideTokenEstimate(): number {
  const text = `${ARC_DESIGN_GUIDE}\n${catalogPromptBlock()}\n${JSON.stringify(EXAMPLE_SPECS.sales)}\n${JSON.stringify(EXAMPLE_SPECS.web)}\n${JSON.stringify(EXAMPLE_SPECS.finance)}`;
  return Math.ceil(text.length / 4);
}

export { catalogPromptBlock };
