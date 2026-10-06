import { ARCHETYPE_SLOTS } from './archetypes';
import { PALETTES, pickPaletteForMode, palettesForMode } from './palettes';
import { createRng, makeSeed, pick, shuffle } from './seed';
import { aggregateNumber, formatMetric } from './format';
import {
  analyzeDataset,
  classifyFields,
  metricFormat,
  narrativeFromFindings,
  periodChange,
  prettyField,
  rankedGroups,
  sparklineValues,
} from './insights';
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

function chooseChartType(
  rng: () => number,
  prefer: ChartType[] | undefined,
  opts: { hasTime: boolean; hasCategory: boolean; used: Set<string>; featured?: boolean },
): ChartType {
  const preferred = (prefer || []).filter((t) => {
    if ((t === 'line' || t === 'area' || t === 'stepped-line') && !opts.hasTime) return false;
    if ((t === 'donut' || t === 'pie') && !opts.hasCategory) return false;
    return true;
  });
  const unusedPreferred = preferred.filter((t) => !opts.used.has(t));
  if (unusedPreferred.length) return pick(rng, unusedPreferred);
  if (preferred.length) return pick(rng, preferred);

  const pool: ChartType[] = [];
  if (opts.hasTime) pool.push('area', 'line', 'bar');
  if (opts.hasCategory) pool.push('bar', 'horizontal-bar', 'donut');
  if (opts.featured && opts.hasTime) pool.push('area', 'line');
  if (pool.length === 0) pool.push('bar');
  const unused = pool.filter((t) => !opts.used.has(t));
  return pick(rng, unused.length ? unused : pool);
}

function kpiTitle(field: string | undefined, aggregation: Aggregation, kind?: string): string {
  if (kind === 'rows') return 'Rows loaded';
  if (kind === 'cohorts') return 'Active cohorts';
  if (!field) return 'Records';
  const name = prettyField(field);
  if (aggregation === 'avg') return `Avg ${name.toLowerCase()}`;
  if (aggregation === 'max') return `Peak ${name.toLowerCase()}`;
  if (aggregation === 'count') return `${name} count`;
  return `Total ${name.toLowerCase()}`;
}

export function buildFallbackDashboard(ctx: GenerateDashboardContext): DashboardSpec {
  const seed = ctx.seed || makeSeed([ctx.title, ctx.intent, Date.now()]);
  const rng = createRng(seed);
  const datasets = ctx.datasets.length > 0 ? ctx.datasets : [{ id: 'empty', name: 'Empty', data: [], columns: [] }];
  const primary = datasets[0];
  const rows = primary.data || [];
  const fields = classifyFields(primary);
  const findings = analyzeDataset(primary);
  const story = narrativeFromFindings(findings, ctx.intent);
  const nums = fields.measures;
  const cats = fields.dimensions;
  const times = fields.time;
  const archetype = ctx.archetype || pick(rng, LAYOUT_ARCHETYPES);
  const mode = ctx.mode || 'light';
  const palette = ctx.paletteId
    ? pickPaletteForMode(ctx.paletteId, mode)
    : pick(rng, palettesForMode(mode).length ? palettesForMode(mode) : PALETTES);
  const slots = ARCHETYPE_SLOTS[archetype];
  const usedTypes = new Set<string>();
  const widgets: DashboardWidget[] = [];
  const usedEncodings = new Set<string>();

  let kpiCursor = 0;
  let chartCursor = 0;
  let insightCursor = 0;

  const derivedKpis: Array<{
    title: string;
    field?: string;
    aggregation: Aggregation;
    format: 'number' | 'currency' | 'percent';
    value: number;
    delta?: number;
    sparkline?: number[];
  }> = [];

  if (nums[0]) {
    const values = rows.map((row) => Number(row[nums[0]])).filter((n) => !Number.isNaN(n));
    const change = times[0] ? periodChange(rows, times[0], nums[0]) : null;
    derivedKpis.push({
      title: kpiTitle(nums[0], 'sum'),
      field: nums[0],
      aggregation: 'sum',
      format: metricFormat(nums[0]),
      value: aggregateNumber(values, 'sum'),
      delta: change?.deltaPct,
      sparkline: sparklineValues(rows, nums[0], times[0]),
    });
  }
  if (nums[1]) {
    const values = rows.map((row) => Number(row[nums[1]])).filter((n) => !Number.isNaN(n));
    const change = times[0] ? periodChange(rows, times[0], nums[1]) : null;
    derivedKpis.push({
      title: kpiTitle(nums[1], metricFormat(nums[1]) === 'percent' ? 'avg' : 'sum'),
      field: nums[1],
      aggregation: metricFormat(nums[1]) === 'percent' ? 'avg' : 'sum',
      format: metricFormat(nums[1]),
      value: aggregateNumber(values, metricFormat(nums[1]) === 'percent' ? 'avg' : 'sum'),
      delta: change?.deltaPct,
      sparkline: sparklineValues(rows, nums[1], times[0]),
    });
  }
  if (nums[0] && cats[0]) {
    const ranked = rankedGroups(rows, cats[0], nums[0]);
    if (ranked[0]) {
      derivedKpis.push({
        title: `Top ${prettyField(cats[0]).toLowerCase()}`,
        field: nums[0],
        aggregation: 'sum',
        format: metricFormat(nums[0]),
        value: ranked[0].value,
        sparkline: sparklineValues(rows.filter((row) => String(row[cats[0]]) === ranked[0].key), nums[0], times[0]),
      });
    }
  }
  if (nums[2]) {
    const values = rows.map((row) => Number(row[nums[2]])).filter((n) => !Number.isNaN(n));
    derivedKpis.push({
      title: kpiTitle(nums[2], metricFormat(nums[2]) === 'percent' ? 'avg' : 'sum'),
      field: nums[2],
      aggregation: metricFormat(nums[2]) === 'percent' ? 'avg' : 'sum',
      format: metricFormat(nums[2]),
      value: aggregateNumber(values, metricFormat(nums[2]) === 'percent' ? 'avg' : 'sum'),
      sparkline: sparklineValues(rows, nums[2], times[0]),
    });
  }
  derivedKpis.push({
    title: 'Rows loaded',
    aggregation: 'count',
    format: 'number',
    value: rows.length,
  });
  if (cats[0]) {
    derivedKpis.push({
      title: `${prettyField(cats[0])}s`,
      aggregation: 'count',
      format: 'number',
      value: new Set(rows.map((row) => String(row[cats[0]]))).size,
    });
  }
  if (nums[3]) {
    const values = rows.map((row) => Number(row[nums[3]])).filter((n) => !Number.isNaN(n));
    derivedKpis.push({
      title: kpiTitle(nums[3], 'avg'),
      field: nums[3],
      aggregation: 'avg',
      format: metricFormat(nums[3]),
      value: aggregateNumber(values, 'avg'),
      sparkline: sparklineValues(rows, nums[3], times[0]),
    });
  }

  slots.forEach((slot, index) => {
    if (slot.type === 'kpi') {
      const kpi = derivedKpis[kpiCursor % Math.max(derivedKpis.length, 1)] || derivedKpis[0];
      const trend = kpi?.delta != null
        ? `${kpi.delta >= 0 ? '+' : ''}${kpi.delta.toFixed(1)}% vs first half`
        : undefined;
      widgets.push({
        id: `kpi-${index}`,
        type: 'kpi',
        title: kpi?.title || 'Metric',
        subtitle: primary.name,
        layout: slot.layout,
        role: slot.role,
        datasetId: primary.id,
        yField: kpi?.field,
        aggregation: kpi?.aggregation || 'sum',
        color: palette.chart[index % palette.chart.length],
        kpi: {
          value: formatMetric(kpi?.value || 0, kpi?.format),
          trend,
          field: kpi?.field,
          aggregation: kpi?.aggregation,
          format: kpi?.format,
          delta: kpi?.delta,
          sparkline: kpi?.sparkline,
        },
      });
      kpiCursor += 1;
      return;
    }

    if (slot.type === 'insight') {
      const finding = findings[insightCursor % Math.max(findings.length, 1)];
      widgets.push({
        id: `insight-${index}`,
        type: 'insight',
        title: finding?.title || 'Key finding',
        subtitle: finding?.kind,
        layout: slot.layout,
        role: slot.featured ? 'featured' : slot.role,
        insight: {
          title: finding?.title,
          text: finding?.text || story.body,
          tone: finding?.tone || 'neutral',
        },
      });
      insightCursor += 1;
      return;
    }

    if (slot.type === 'section') {
      widgets.push({
        id: `section-${index}`,
        type: 'section',
        title: story.headline,
        subtitle: story.body,
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
        columns: [...cats.slice(0, 2), ...times.slice(0, 1), ...nums.slice(0, 3)].filter(Boolean),
      });
      return;
    }

    const preferTime = Boolean(slot.prefer?.some((t) => t === 'area' || t === 'line' || t === 'stepped-line') && times[0]);
    const compareDim = slot.role === 'compare-b' ? cats[1] || cats[0] : cats[chartCursor % Math.max(cats.length, 1)];
    const xField = preferTime || (times[0] && slot.featured)
      ? times[0]
      : compareDim || times[0] || nums[0];
    const yField = nums[chartCursor % Math.max(nums.length, 1)] || nums[0];
    const encoding = `${xField}:${yField}`;
    let chartType = chooseChartType(rng, slot.prefer, {
      hasTime: Boolean(times[0] && xField === times[0]),
      hasCategory: Boolean(cats.length),
      used: usedTypes,
      featured: slot.featured,
    });
    if (usedEncodings.has(`${encoding}:${chartType}`) && slot.prefer?.[1]) {
      chartType = slot.prefer[1];
    }
    usedTypes.add(chartType);
    usedEncodings.add(`${encoding}:${chartType}`);

    const yPretty = prettyField(yField || 'value');
    const xPretty = prettyField(xField || 'category');

    widgets.push({
      id: `chart-${index}`,
      type: 'chart',
      title: yField && xField ? `${yPretty} by ${xPretty}` : 'Distribution',
      subtitle: slot.role === 'compare-a' || slot.role === 'compare-b'
        ? `Compared on ${xPretty}`
        : primary.name,
      layout: slot.layout,
      role: slot.role || (slot.featured ? 'hero' : undefined),
      chartType,
      datasetId: primary.id,
      xField,
      yField,
      groupField: cats[(chartCursor + 1) % Math.max(cats.length, 1)],
      color: palette.chart[index % palette.chart.length],
      aggregation: metricFormat(yField) === 'percent' ? 'avg' : 'sum',
    });
    chartCursor += 1;
  });

  const editorial = archetype === 'editorial' || archetype === 'story-arc';
  const dense = archetype === 'command-center' || archetype === 'metric-mosaic';

  return {
    version: 1,
    id: `dash-${seed.toString(16)}`,
    title: ctx.title || deriveTitle(ctx.intent, archetype),
    subtitle: story.headline,
    intent: ctx.intent,
    archetype,
    seed,
    theme: {
      palette,
      fontFamily: 'font-sans',
      headingFont: editorial ? 'font-serif' : dense ? 'font-grotesk' : 'font-outfit',
      radius: editorial ? 'rounded-xl' : 'rounded-2xl',
      density: dense ? 'compact' : editorial ? 'airy' : 'comfortable',
    },
    narrative: {
      headline: story.headline,
      body: story.body,
    },
    sections: [{ id: 'main', title: 'Primary view' }],
    widgets,
  };
}

function deriveTitle(intent: string | undefined, archetype: LayoutArchetype): string {
  if (intent && intent.length > 8) return intent.slice(0, 64);
  const titles: Record<LayoutArchetype, string> = {
    'hero-kpi-rail': 'Executive summary',
    editorial: 'Editorial briefing',
    'command-center': 'Analytical deep-dive',
    'story-arc': 'Story arc',
    'split-insight': 'Insight split',
    'metric-mosaic': 'KPI wall',
    comparison: 'Side-by-side comparison',
    'funnel-flow': 'Flow review',
  };
  return titles[archetype];
}

export function varyWidget(widget: DashboardWidget, datasets: DashboardDataset[], seed: number): DashboardWidget {
  const rng = createRng(seed);
  const dataset = datasets.find((d) => d.id === widget.datasetId) || datasets[0];
  if (!dataset) return widget;
  const fields = classifyFields(dataset);
  const nums = fields.measures;
  const cats = fields.dimensions;
  const times = fields.time;
  if (widget.type === 'chart') {
    const types = shuffle(rng, ['bar', 'line', 'area', 'donut', 'horizontal-bar'] as ChartType[]);
    const xField = widget.chartType === 'line' || types[0] === 'line' || types[0] === 'area'
      ? (times[0] || pick(rng, cats.length ? cats : [widget.xField || '']))
      : pick(rng, cats.length ? cats : [widget.xField || '']);
    return {
      ...widget,
      chartType: types[0],
      xField,
      yField: pick(rng, nums.length ? nums : [widget.yField || '']),
      color: pick(rng, PALETTES[0].chart),
    };
  }
  if (widget.type === 'kpi' && nums.length) {
    const field = pick(rng, nums);
    const values = dataset.data.map((row) => Number(row[field])).filter((n) => !Number.isNaN(n));
    return {
      ...widget,
      yField: field,
      title: prettyField(field),
      kpi: {
        ...widget.kpi,
        field,
        format: metricFormat(field),
        value: formatMetric(aggregateNumber(values, 'sum'), metricFormat(field)),
        sparkline: sparklineValues(dataset.data, field, times[0]),
      },
    };
  }
  if (widget.type === 'insight') {
    const findings = analyzeDataset(dataset);
    const finding = pick(rng, findings);
    return {
      ...widget,
      title: finding.title,
      insight: { title: finding.title, text: finding.text, tone: finding.tone },
    };
  }
  return widget;
}
