import { computeDataTruth } from '../DataTruthEngine';
import { ARCHETYPE_SLOTS } from './archetypes';
import { FONT_FAMILIES, PALETTES, RADIUS_TOKENS, getPalette } from './palettes';
import { createRng, makeSeed, pick, shuffle } from './seed';
import { formatMetric, aggregateNumber } from './aggregate';
import type {
  Aggregation,
  ChartType,
  DashboardDataset,
  DashboardSpec,
  DashboardWidget,
  LayoutArchetype,
} from './types';
import { LAYOUT_ARCHETYPES } from './types';

export interface GenerateDashboardContext {
  title?: string;
  intent?: string;
  datasets: DashboardDataset[];
  seed?: number;
  archetype?: LayoutArchetype;
  paletteId?: string;
  mode?: 'light' | 'dark';
}

function numericFields(dataset: DashboardDataset): string[] {
  const truth = computeDataTruth(dataset.data || []);
  return Object.keys(truth.numericSummary);
}

function categoricalFields(dataset: DashboardDataset): string[] {
  const truth = computeDataTruth(dataset.data || []);
  return Object.keys(truth.categoricalSummary);
}

function dateLikeFields(dataset: DashboardDataset): string[] {
  return (dataset.columns || [])
    .filter((c) => /date|time|month|week|year/i.test(c.name) || c.type === 'date')
    .map((c) => c.name);
}

function chooseChartType(
  rng: () => number,
  opts: { hasTime: boolean; hasCategory: boolean; hasNumeric: boolean; featured: boolean; used: Set<string> },
): ChartType {
  const pool: ChartType[] = [];
  if (opts.hasTime) pool.push('line', 'area', 'stepped-line');
  if (opts.hasCategory && opts.hasNumeric) pool.push('bar', 'horizontal-bar', 'donut', 'treemap');
  if (opts.hasNumeric) pool.push('scatter', 'area');
  if (opts.featured) pool.push('area', 'bar', 'line');
  if (opts.hasCategory) pool.push('pack', 'radial');
  if (pool.length === 0) pool.push('bar', 'area');
  const unused = pool.filter((t) => !opts.used.has(t));
  return pick(rng, unused.length ? unused : pool);
}

export function buildFallbackDashboard(ctx: GenerateDashboardContext): DashboardSpec {
  const seed = ctx.seed || makeSeed([ctx.title, ctx.intent, Date.now()]);
  const rng = createRng(seed);
  const datasets = ctx.datasets.length > 0 ? ctx.datasets : [{ id: 'empty', name: 'Empty', data: [], columns: [] }];
  const primary = datasets[0];
  const truth = computeDataTruth(primary.data || []);
  const nums = numericFields(primary);
  const cats = categoricalFields(primary);
  const times = dateLikeFields(primary);
  const archetype = ctx.archetype || pick(rng, LAYOUT_ARCHETYPES);
  const palettePool = ctx.mode
    ? PALETTES.filter((p) => p.mode === ctx.mode)
    : PALETTES;
  const palette = ctx.paletteId ? getPalette(ctx.paletteId) : pick(rng, palettePool);
  const slots = ARCHETYPE_SLOTS[archetype];
  const usedTypes = new Set<string>();
  const widgets: DashboardWidget[] = [];

  let kpiCursor = 0;
  let chartCursor = 0;

  slots.forEach((slot, index) => {
    if (slot.type === 'kpi') {
      const field = nums[kpiCursor % Math.max(nums.length, 1)];
      const agg: Aggregation = pick(rng, ['sum', 'avg', 'max']);
      const values = (primary.data || []).map((row) => Number(row[field])).filter((n) => !Number.isNaN(n));
      const value = field ? aggregateNumber(values, agg) : truth.rowCount;
      widgets.push({
        id: `kpi-${index}`,
        type: 'kpi',
        title: field ? `${pretty(field)} ${agg === 'avg' ? 'avg' : agg === 'max' ? 'peak' : 'total'}` : 'Rows loaded',
        subtitle: primary.name,
        layout: slot.layout,
        datasetId: primary.id,
        yField: field,
        aggregation: agg,
        color: palette.chart[index % palette.chart.length],
        kpi: {
          value: field ? formatMetric(value, /rev|sales|amount|price|gmv/i.test(field) ? 'currency' : 'number') : formatMetric(value, 'number'),
          trend: truth.completenessScore >= 90 ? 'Healthy coverage' : `${truth.completenessScore}% complete`,
          field,
          aggregation: agg,
          format: /rev|sales|amount|price|gmv/i.test(field || '') ? 'currency' : 'number',
        },
      });
      kpiCursor += 1;
      return;
    }

    if (slot.type === 'insight') {
      const topCat = cats[0];
      const topNum = nums[0];
      const top = topCat && truth.categoricalSummary[topCat]?.topValues?.[0];
      widgets.push({
        id: `insight-${index}`,
        type: 'insight',
        title: 'Narrative brief',
        layout: slot.layout,
        insight: {
          text: top
            ? `${top.value} leads ${pretty(topCat)} with ${top.count} observations${topNum ? `, while ${pretty(topNum)} totals ${formatMetric(truth.numericSummary[topNum].sum)}` : ''}. ${ctx.intent || 'Focus the next action on the largest cohort.'}`
            : ctx.intent || 'Upload richer dimensions to unlock sharper narrative findings.',
          tone: truth.dataQualityScore < 70 ? 'warning' : 'positive',
        },
      });
      return;
    }

    if (slot.type === 'section') {
      widgets.push({
        id: `section-${index}`,
        type: 'section',
        title: ctx.intent || 'Operating picture',
        subtitle: `${truth.rowCount.toLocaleString()} rows · ${truth.columnCount} fields`,
        layout: slot.layout,
      });
      return;
    }

    if (slot.type === 'table') {
      widgets.push({
        id: `table-${index}`,
        type: 'table',
        title: 'Detail slice',
        layout: slot.layout,
        datasetId: primary.id,
        columns: [...cats.slice(0, 2), ...nums.slice(0, 3)].filter(Boolean),
      });
      return;
    }

    const hasTime = times.length > 0;
    const xField = hasTime && rng() > 0.35 ? times[chartCursor % times.length] : cats[chartCursor % Math.max(cats.length, 1)] || nums[0];
    const yField = nums[(chartCursor + 1) % Math.max(nums.length, 1)] || nums[0];
    const chartType = chooseChartType(rng, {
      hasTime: Boolean(times.length),
      hasCategory: Boolean(cats.length),
      hasNumeric: Boolean(nums.length),
      featured: Boolean(slot.featured),
      used: usedTypes,
    });
    usedTypes.add(chartType);

    widgets.push({
      id: `chart-${index}`,
      type: 'chart',
      title: yField && xField ? `${pretty(yField)} by ${pretty(xField)}` : 'Distribution',
      subtitle: primary.name,
      layout: slot.layout,
      chartType,
      datasetId: primary.id,
      xField,
      yField,
      groupField: cats[(chartCursor + 1) % Math.max(cats.length, 1)],
      color: palette.chart[index % palette.chart.length],
      aggregation: 'sum',
    });
    chartCursor += 1;
  });

  return {
    version: 1,
    id: `dash-${seed.toString(16)}`,
    title: ctx.title || deriveTitle(ctx.intent, archetype),
    subtitle: ctx.intent || 'Generated from the loaded semantic model',
    intent: ctx.intent,
    archetype,
    seed,
    theme: {
      palette,
      fontFamily: pick(rng, FONT_FAMILIES),
      headingFont: pick(rng, ['font-grotesk', 'font-outfit', 'font-serif', 'font-sans']),
      radius: pick(rng, RADIUS_TOKENS),
      density: pick(rng, ['compact', 'comfortable', 'airy'] as const),
    },
    narrative: {
      headline: ctx.intent || 'What changed, and where to look next',
      body: `${truth.rowCount.toLocaleString()} rows across ${truth.columnCount} fields. Completeness ${truth.completenessScore}%.`,
    },
    sections: [{ id: 'main', title: 'Primary view' }],
    widgets,
  };
}

function pretty(name: string): string {
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function deriveTitle(intent: string | undefined, archetype: LayoutArchetype): string {
  if (intent && intent.length > 8) return intent.slice(0, 64);
  const titles: Record<LayoutArchetype, string> = {
    'hero-kpi-rail': 'Pulse Board',
    editorial: 'Editorial Briefing',
    'command-center': 'Command Center',
    'story-arc': 'Story Arc',
    'split-insight': 'Insight Split',
    'metric-mosaic': 'Metric Mosaic',
    comparison: 'Side-by-side Review',
    'funnel-flow': 'Flow Review',
  };
  return titles[archetype];
}

export function varyWidget(widget: DashboardWidget, datasets: DashboardDataset[], seed: number): DashboardWidget {
  const rng = createRng(seed);
  const dataset = datasets.find((d) => d.id === widget.datasetId) || datasets[0];
  if (!dataset) return widget;
  const nums = numericFields(dataset);
  const cats = categoricalFields(dataset);
  if (widget.type === 'chart') {
    const types = shuffle(rng, ['bar', 'line', 'area', 'donut', 'horizontal-bar'] as ChartType[]);
    return {
      ...widget,
      chartType: types[0],
      xField: pick(rng, cats.length ? cats : [widget.xField || '']),
      yField: pick(rng, nums.length ? nums : [widget.yField || '']),
      color: pick(rng, getPalette().chart),
      title: widget.title,
    };
  }
  if (widget.type === 'kpi' && nums.length) {
    const field = pick(rng, nums);
    const values = dataset.data.map((row) => Number(row[field])).filter((n) => !Number.isNaN(n));
    return {
      ...widget,
      yField: field,
      title: pretty(field),
      kpi: {
        ...widget.kpi,
        field,
        value: formatMetric(aggregateNumber(values, 'sum')),
      },
    };
  }
  return widget;
}
