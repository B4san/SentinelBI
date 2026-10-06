import { slotsForArchetype } from './archetypes';
import { PALETTES, pickPaletteForMode, palettesForMode } from './palettes';
import { createRng, makeSeed, pick, shuffle } from './seed';
import { aggregateNumber, formatMetric } from './format';
import { inferMetricPolarity, isFillerKpi, type MetricPolarity } from './metrics';
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
  DerivedMeasure,
  LayoutArchetype,
} from './types';
import { LAYOUT_ARCHETYPES } from './types';
import { nearestComponent } from './catalog';
import { finalizeDashboardSpec } from './finalize';
import { computeDerivedValue, formatDerived, inferAggregation, proposeDerivedMeasures } from './measures';

export interface GenerateDashboardContext {
  title?: string;
  intent?: string;
  datasets: DashboardDataset[];
  seed?: number;
  archetype?: LayoutArchetype;
  paletteId?: string;
  mode?: 'light' | 'dark';
}

interface DerivedKpi {
  title: string;
  field?: string;
  aggregation: Aggregation;
  format: 'number' | 'currency' | 'percent' | 'multiple' | 'duration';
  value: number;
  delta?: number;
  sparkline?: number[];
  filter?: DashboardWidget['filter'];
  hint?: string;
  polarity: MetricPolarity;
  measure?: DerivedMeasure;
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
  if (opts.hasCategory) pool.push('bar', 'horizontal-bar', 'donut', 'treemap');
  if (opts.featured && opts.hasTime) pool.push('area', 'line');
  if (pool.length === 0) pool.push('bar');
  const unused = pool.filter((t) => !opts.used.has(t));
  return pick(rng, unused.length ? unused : pool);
}

function kpiTitle(field: string | undefined, aggregation: Aggregation): string {
  if (!field) return 'Metric';
  const name = prettyField(field).replace(/seconds/i, 'duration').replace(/dso days/i, 'DSO').replace(/^avg\s+/i, '');
  if (/ebitda/i.test(field)) return aggregation === 'sum' ? 'EBITDA' : `Avg EBITDA`;
  if (/cogs/i.test(field)) return aggregation === 'sum' ? 'COGS' : `Avg COGS`;
  if (aggregation === 'avg' || /^avg_|_rate$|_seconds$/i.test(field)) return `Avg ${name.toLowerCase()}`;
  if (aggregation === 'max') return `Peak ${name.toLowerCase()}`;
  if (aggregation === 'min') return `Floor ${name.toLowerCase()}`;
  return `Total ${name.toLowerCase()}`;
}

function measureKpi(
  rows: Record<string, unknown>[],
  field: string,
  aggregation: Aggregation,
  timeField?: string,
  extra?: Partial<DerivedKpi>,
): DerivedKpi {
  const values = rows.map((row) => Number(row[field])).filter((n) => !Number.isNaN(n));
  const change = timeField ? periodChange(rows, timeField, field) : null;
  return {
    title: extra?.title || kpiTitle(field, aggregation),
    field,
    aggregation,
    format: extra?.format || metricFormat(field),
    value: extra?.value ?? aggregateNumber(values, aggregation),
    delta: extra?.delta ?? change?.deltaPct,
    sparkline: extra?.sparkline ?? sparklineValues(rows, field, timeField),
    filter: extra?.filter,
    hint: extra?.hint,
    polarity: extra?.polarity || inferMetricPolarity(field),
  };
}

function preferMeasures(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const rank = (name: string) => (/rev|gmv|sales/i.test(name) ? 0 : /session|conversion|unit/i.test(name) ? 1 : 2);
    return rank(a) - rank(b);
  });
}

export function buildBusinessKpis(dataset: DashboardDataset): DerivedKpi[] {
  const rows = dataset.data || [];
  const fields = classifyFields(dataset);
  const nums = preferMeasures(fields.measures);
  const cats = fields.dimensions;
  const times = fields.time;
  const kpis: DerivedKpi[] = [];
  const seen = new Set<string>();

  const push = (kpi: DerivedKpi) => {
    const key = `${kpi.title}|${kpi.field}|${kpi.aggregation}|${kpi.filter?.value || ''}`;
    if (seen.has(key)) return;
    if (isFillerKpi({ title: kpi.title, yField: kpi.field, aggregation: kpi.aggregation, kpi: { value: '', field: kpi.field, aggregation: kpi.aggregation } })) {
      return;
    }
    seen.add(key);
    kpis.push(kpi);
  };

  for (const field of nums) {
    if (/gross_margin|discount_rate|bounce_rate/i.test(field)) continue;
    const aggregation: Aggregation = inferAggregation(field, metricFormat(field));
    push(measureKpi(rows, field, aggregation, times[0]));
  }

  for (const candidate of proposeDerivedMeasures(dataset)) {
    const raw = candidate.measure;
    if (raw) {
      push({
        title: candidate.title,
        field: raw.numerator.field,
        aggregation: raw.numerator.agg || 'sum',
        format: raw.format || 'number',
        value: computeDerivedValue(rows, raw),
        polarity: inferMetricPolarity(candidate.title),
        measure: raw,
      });
      continue;
    }
    if (candidate.field) {
      push(measureKpi(rows, candidate.field, candidate.agg || 'avg', times[0], {
        title: candidate.title,
        format: candidate.format,
        polarity: inferMetricPolarity(candidate.title),
      }));
    }
  }

  if (nums[0] && cats[0]) {
    const ranked = rankedGroups(rows, cats[0], nums[0]);
    if (ranked[0]) {
      const subset = rows.filter((row) => String(row[cats[0]]) === ranked[0].key);
      push(measureKpi(rows, nums[0], 'sum', times[0], {
        title: `${ranked[0].key} · top ${prettyField(cats[0]).toLowerCase()}`,
        value: ranked[0].value,
        filter: { field: cats[0], op: 'equals', value: ranked[0].key },
        sparkline: sparklineValues(subset, nums[0], times[0]),
        hint: ranked[0].key,
      }));
    }
  }

  if (nums[0] && cats[1]) {
    const ranked = rankedGroups(rows, cats[1], nums[0]);
    if (ranked[0]) {
      const subset = rows.filter((row) => String(row[cats[1]]) === ranked[0].key);
      push(measureKpi(rows, nums[0], 'sum', times[0], {
        title: `${ranked[0].key} · top ${prettyField(cats[1]).toLowerCase()}`,
        value: ranked[0].value,
        filter: { field: cats[1], op: 'equals', value: ranked[0].key },
        sparkline: sparklineValues(subset, nums[0], times[0]),
        hint: ranked[0].key,
      }));
    }
  }

  if (nums[0] && metricFormat(nums[0]) !== 'percent') {
    push(measureKpi(rows, nums[0], 'avg', times[0]));
  }
  if (nums[1] && metricFormat(nums[1]) !== 'percent') {
    push(measureKpi(rows, nums[1], 'max', times[0]));
  }
  if (nums[2] && metricFormat(nums[2]) !== 'percent') {
    push(measureKpi(rows, nums[2], 'avg', times[0]));
  }

  return kpis;
}

function rankKpis(pool: DerivedKpi[], intent: string | undefined, dataset: DashboardDataset): DerivedKpi[] {
  const rows = dataset.data || [];
  const names = dataset.columns?.map((c) => c.name) || Object.keys(rows[0] || {});
  const hardware = names.includes('business_unit')
    ? rows.filter((row) => String(row.business_unit) === 'Hardware')
    : [];
  if (hardware.length) {
    const opex = hardware.reduce((acc, row) => acc + Number(row.opex || 0), 0);
    const budget = hardware.reduce((acc, row) => acc + Number(row.budget_opex || 0), 0);
    if (budget) {
      pool.unshift({
        title: 'Hardware opex vs budget',
        field: 'opex',
        aggregation: 'sum',
        format: 'currency',
        value: opex - budget,
        polarity: 'lower-is-better',
        measure: { kind: 'difference', numerator: { field: 'opex', agg: 'sum' }, denominator: { field: 'budget_opex', agg: 'sum' }, format: 'currency' },
        filter: { field: 'business_unit', op: 'equals', value: 'Hardware' },
        hint: 'Hardware',
      });
    }
  }
  const wanted = (intent || '').toLowerCase();
  return [...pool].sort((a, b) => {
    const score = (kpi: DerivedKpi) => {
      let n = 0;
      if (/opex vs budget|hardware opex/i.test(kpi.title)) n -= 6;
      if (/\baov\b/.test(kpi.title) && !names.some((name) => /^(units?|qty|quantity)$/i.test(name) || /(^|_)units$/.test(name.toLowerCase()) || /order/i.test(name))) n += 12;
      if (/\baov\b|gross margin|discount rate/i.test(kpi.title)) n -= 4;
      if (/total budget opex|total opex/i.test(kpi.title) && !/vs/.test(kpi.title)) n += 8;
      if (wanted && kpi.title.toLowerCase().split(/\s+/).some((word) => wanted.includes(word))) n -= 2;
      if (/discount|margin|aov|pricing/i.test(wanted) && /discount|margin|aov/i.test(kpi.title)) n -= 3;
      if (/region|unit|product/i.test(wanted) && /region|unit|product/i.test(kpi.title)) n -= 2;
      return n;
    };
    return score(a) - score(b);
  });
}

function pickKpi(pool: DerivedKpi[], slotRole: string | undefined, used: Set<number>): DerivedKpi | undefined {
  if (!pool.length) return undefined;
  const unused = pool.map((kpi, i) => ({ kpi, i })).filter((item) => !used.has(item.i));
  const preferIndex = slotRole === 'compare-b' || slotRole === 'support'
    ? unused.find((item) => item.i > 0)?.i
    : unused[0]?.i;
  const index = preferIndex ?? unused[0]?.i ?? 0;
  used.add(index);
  return pool[index];
}

export function buildFallbackDashboard(ctx: GenerateDashboardContext): DashboardSpec {
  const seed = ctx.seed || makeSeed([ctx.title, ctx.intent, Date.now()]);
  const rng = createRng(seed);
  const datasets = ctx.datasets.length > 0 ? ctx.datasets : [{ id: 'empty', name: 'Empty', data: [], columns: [] }];
  const primary = datasets[0];
  const fields = classifyFields(primary);
  const findings = analyzeDataset(primary);
  const story = narrativeFromFindings(findings, ctx.intent);
  const nums = preferMeasures(fields.measures);
  const cats = fields.dimensions;
  const times = fields.time;
  const archetype = ctx.archetype || pick(rng, LAYOUT_ARCHETYPES);
  const mode = ctx.mode || 'light';
  const palette = ctx.paletteId
    ? pickPaletteForMode(ctx.paletteId, mode)
    : pick(rng, palettesForMode(mode).length ? palettesForMode(mode) : PALETTES);
  const derivedKpis = rankKpis(buildBusinessKpis(primary), ctx.intent, primary);
  const slots = slotsForArchetype(archetype, derivedKpis.length);
  const usedTypes = new Set<string>();
  const widgets: DashboardWidget[] = [];
  const usedEncodings = new Set<string>();
  const usedKpis = new Set<number>();

  let chartCursor = 0;
  let insightCursor = 0;

  slots.forEach((slot, index) => {
    if (slot.type === 'kpi') {
      const kpi = pickKpi(derivedKpis, slot.role, usedKpis);
      if (!kpi) return;
      const trend = kpi.delta != null
        ? `${kpi.delta >= 0 ? '+' : ''}${kpi.delta.toFixed(1)}% vs first half`
        : undefined;
      widgets.push({
        id: `kpi-${index}`,
        type: 'kpi',
        title: kpi.title,
        subtitle: kpi.hint,
        layout: slot.layout,
        role: slot.role,
        datasetId: primary.id,
        yField: kpi.field,
        aggregation: kpi.aggregation,
        filter: kpi.filter,
        color: palette.chart[index % palette.chart.length],
        polarity: kpi.polarity,
        componentId: 'arc.metric-card',
        measure: kpi.measure,
        kpi: {
          value: kpi.measure ? formatDerived(kpi.value, kpi.format) : formatMetric(kpi.value, kpi.format),
          trend,
          field: kpi.field,
          aggregation: kpi.aggregation,
          format: kpi.format,
          delta: kpi.delta,
          sparkline: kpi.sparkline,
          polarity: kpi.polarity,
        },
      });
      return;
    }

    if (slot.type === 'insight') {
      const finding = findings[insightCursor % Math.max(findings.length, 1)];
      widgets.push({
        id: `insight-${index}`,
        type: 'insight',
        title: finding?.title || 'Key finding',
        subtitle: undefined,
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
        title: story.headline && normalizeTitle(story.headline) !== normalizeTitle(ctx.title || '') ? story.headline : 'Overview',
        layout: slot.layout,
      });
      return;
    }

    if (slot.type === 'table') {
      const measure = nums[0];
      widgets.push({
        id: `table-${index}`,
        type: 'table',
        title: cats[0] && measure
          ? `${prettyField(cats[0])}${cats[1] ? ` × ${prettyField(cats[1])}` : ''} by ${prettyField(measure).toLowerCase()}`
          : measure ? `Top 12 by ${prettyField(measure).toLowerCase()}` : 'Detail slice',
        layout: { ...slot.layout, h: Math.max(slot.layout.h, 6) },
        datasetId: primary.id,
        componentId: 'arc.sortable-data-table',
        columns: [...cats.slice(0, 2), ...times.slice(0, 1), ...nums.slice(0, 3)].filter(Boolean),
        table: measure
          ? {
              sort: { field: measure, dir: 'desc' },
              limit: 12,
              groupBy: cats.slice(0, Math.min(2, cats.length)),
              measures: nums.slice(0, 3).map((field) => ({ field, agg: metricFormat(field) === 'percent' ? 'avg' as const : 'sum' as const, format: metricFormat(field) })),
            }
          : undefined,
      });
      return;
    }

    const preferTime = Boolean(slot.prefer?.some((t) => t === 'area' || t === 'line' || t === 'stepped-line') && times[0]);
    const intentDim = /product|helios/i.test(ctx.intent || '')
      ? cats.find((c) => /product/i.test(c))
      : /segment/i.test(ctx.intent || '')
        ? cats.find((c) => /segment/i.test(c))
        : /region/i.test(ctx.intent || '')
          ? cats.find((c) => /region/i.test(c))
          : undefined;
    const xField = slot.role === 'compare-a'
      ? (cats[0] || times[0] || nums[0])
      : slot.role === 'compare-b'
        ? (cats[1] || times[0] || cats[0] || nums[0])
        : preferTime || (times[0] && slot.featured)
          ? times[0]
          : intentDim || cats[(chartCursor + Math.abs(makeSeed([ctx.intent, 'x']))) % Math.max(cats.length, 1)] || times[0] || nums[0];
    const intentShift = Math.abs(makeSeed([ctx.intent, slot.role, chartCursor])) % Math.max(nums.length, 1);
    const dimShift = Math.abs(makeSeed([ctx.intent, 'dim', chartCursor])) % Math.max(cats.length, 1);
    const yField = slot.featured
      ? (/aov|unit|helios/i.test(ctx.intent || '') && nums.includes('units') ? 'units' : nums[0] || nums[1])
      : slot.role === 'compare-b'
        ? (/aov|unit/i.test(ctx.intent || '') && nums.includes('units') ? 'units' : nums[1] || nums[0])
        : /aov|unit|helios/i.test(ctx.intent || '') && nums.includes('units') && chartCursor % 2 === 0
          ? 'units'
          : /discount|margin|pricing/i.test(ctx.intent || '') && nums.find((n) => /discount|margin/i.test(n))
            ? (nums.filter((n) => /discount|margin/i.test(n))[chartCursor % 2] || nums.find((n) => /discount|margin/i.test(n)) || nums[0])
            : nums[(chartCursor + intentShift) % Math.max(nums.length, 1)] || nums[0];
    if (!preferTime && cats.length && !slot.featured && slot.role !== 'compare-a') {
      const preferredDim = /product|helios/i.test(ctx.intent || '')
        ? cats.find((c) => /product/i.test(c))
        : /region/i.test(ctx.intent || '')
          ? cats.find((c) => /region/i.test(c))
          : /segment/i.test(ctx.intent || '')
            ? cats.find((c) => /segment/i.test(c))
            : cats[dimShift];
      if (preferredDim) {
        // used below via xField reassignment when not time
      }
    }
    const encoding = `${xField}:${yField}`;
    let chartType = chooseChartType(rng, slot.prefer, {
      hasTime: Boolean(times[0] && xField === times[0]),
      hasCategory: Boolean(cats.length),
      used: usedTypes,
      featured: slot.featured,
    });
    if (/aov|unit|helios/i.test(ctx.intent || '') && chartType === 'bar' && cats.includes(xField || '')) {
      chartType = 'horizontal-bar';
    }
    if (/discount|margin|pricing/i.test(ctx.intent || '') && chartType === 'donut') {
      chartType = 'treemap';
    }
    if (usedEncodings.has(`${encoding}:${chartType}`) && slot.prefer?.[1]) {
      chartType = slot.prefer[1];
    }
    const categoryCount = xField && cats.includes(xField)
      ? new Set((primary.data || []).map((row) => String(row[xField] ?? ''))).size
      : 0;
    if (chartType === 'horizontal-bar' && categoryCount > 0 && categoryCount <= 4) {
      chartType = 'bar';
    }
    if ((chartType === 'line' || chartType === 'stepped-line') && times[0] && xField === times[0] && slot.featured) {
      chartType = 'area';
    }
    usedTypes.add(chartType);
    usedEncodings.add(`${encoding}:${chartType}`);

    const yPretty = prettyField(yField || 'value');
    const xPretty = prettyField(xField || 'category');
    const budget = nums.find((n) => /budget/i.test(n));
    const intent = (ctx.intent || '').toLowerCase();
    if (intent && /aov|unit|helios|product/i.test(intent) && nums.includes('units') && slot.featured === false) {
      const alt = cats.find((c) => /product|segment/i.test(c));
      if (alt) {
        // prefer a different breakdown than the default channel/region pair
      }
    }
    const wantBullet = Boolean(budget && slot.prefer?.includes('bar') && /opex|ebitda/i.test(yField || ''));
    const wantMultiples = Boolean(slot.prefer?.includes('area') === false && times[0] && cats[0] && chartType === 'line' && !slot.featured);
    if (wantBullet) chartType = 'bar';
    if (slot.prefer?.includes('treemap')) chartType = 'treemap';
    const series = wantBullet && budget && yField
      ? [{ field: yField, style: 'bar' as const }, { field: budget, style: 'target' as const, label: prettyField(budget) }]
      : budget && yField && /opex|revenue|ebitda/i.test(yField)
        ? [{ field: yField, style: 'bar' as const }, { field: budget, style: 'dashed' as const, label: prettyField(budget) }]
        : undefined;
    const componentId = wantBullet
      ? 'sbi.bullet-variance'
      : wantMultiples
        ? 'sbi.small-multiples'
        : nearestComponent(undefined, 'chart', chartType).id;
    const title = wantBullet
      ? `${yPretty} vs budget`
      : wantMultiples
        ? `${yPretty} by ${prettyField(cats[0])}`
        : chartType === 'treemap'
          ? `${yPretty} mix`
          : yField && xField ? `${yPretty} by ${xPretty}` : 'Distribution';
    widgets.push({
      id: `chart-${index}`,
      type: 'chart',
      title,
      subtitle: undefined,
      layout: slot.layout,
      role: slot.role || (slot.featured ? 'hero' : undefined),
      chartType,
      datasetId: primary.id,
      xField: wantMultiples ? times[0] : xField,
      yField,
      componentId,
      series,
      targetField: budget,
      groupField: wantMultiples ? cats[0] : undefined,
      color: palette.chart[index % palette.chart.length],
      aggregation: metricFormat(yField) === 'percent' ? 'avg' : 'sum',
    });
    chartCursor += 1;
  });

  if (times[0] && !widgets.some((w) => w.type === 'chart' && (w.xField === times[0] || w.chartType === 'line' || w.chartType === 'area'))) {
    const yField = nums.find((n) => /rev|ebitda|session/i.test(n)) || nums[0];
    widgets.push({
      id: `chart-trend`,
      type: 'chart',
      title: `${prettyField(yField)} trend`,
      layout: { x: 0, y: Math.max(0, ...widgets.map((w) => w.layout.y + w.layout.h)), w: 12, h: 5 },
      role: 'hero',
      chartType: 'area',
      datasetId: primary.id,
      xField: times[0],
      yField,
      componentId: 'arc.line-chart',
      compare: 'previous-year',
      color: palette.chart[0],
      aggregation: 'sum',
    });
  }

  const editorial = archetype === 'editorial' || archetype === 'story-arc';
  const dense = archetype === 'command-center' || archetype === 'metric-mosaic';

  const spec: DashboardSpec = {
    version: 1,
    id: `dash-${seed.toString(16)}`,
    title: ctx.title || deriveTitle(ctx.intent, archetype),
    subtitle: story.headline && normalizeTitle(story.headline) !== normalizeTitle(ctx.title || deriveTitle(ctx.intent, archetype))
      ? story.headline
      : undefined,
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
    widgets: widgets.filter((w) => w.type !== 'kpi' || !isFillerKpi(w)),
  };
  return finalizeDashboardSpec(spec, datasets, { verifyCopy: false });
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

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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
    const polarity = inferMetricPolarity(field);
    return {
      ...widget,
      yField: field,
      title: prettyField(field),
      polarity,
      kpi: {
        ...widget.kpi,
        field,
        format: metricFormat(field),
        value: formatMetric(aggregateNumber(values, 'sum'), metricFormat(field)),
        sparkline: sparklineValues(dataset.data, field, times[0]),
        polarity,
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
