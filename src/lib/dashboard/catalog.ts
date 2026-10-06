export interface CatalogEncoding {
  id: string;
  label: string;
}

export interface CatalogEntry {
  id: string;
  description: string;
  when: string;
  encodings: string[];
  min: { w: number; h: number };
  max: { w: number; h: number };
  example: string;
  interactions: string[];
  kind: 'chart' | 'kpi' | 'table' | 'control' | 'custom';
}

export const COMPONENT_CATALOG: CatalogEntry[] = [
  {
    id: 'arc.line-chart',
    description: 'Time series line',
    when: 'Trend over time; add a dashed compare overlay for prior period.',
    encodings: ['xField=time', 'yField=measure', 'optional series[] / compare'],
    min: { w: 6, h: 4 },
    max: { w: 12, h: 8 },
    example: '{"type":"chart","componentId":"arc.line-chart","layout":{"x":0,"y":0,"w":8,"h":6},"xField":"order_date","yField":"revenue","compare":"previous-period"}',
    interactions: ['brush', 'tooltip', 'cross-filter'],
    kind: 'chart',
  },
  {
    id: 'arc.bar-chart',
    description: 'Categorical or ranking bars with data labels',
    when: 'Ranking or comparison across ≤12 categories. Sort desc. Use horizontal-bar when labels are long.',
    encodings: ['xField=dimension', 'yField=measure'],
    min: { w: 4, h: 4 },
    max: { w: 12, h: 8 },
    example: '{"type":"chart","componentId":"arc.bar-chart","chartType":"bar","layout":{"x":0,"y":0,"w":6,"h":5},"xField":"region","yField":"revenue"}',
    interactions: ['click-filter', 'tooltip'],
    kind: 'chart',
  },
  {
    id: 'arc.donut-chart',
    description: 'Part-to-whole donut',
    when: 'Share of a total with ≤6 parts whose shares actually differ. Never equal thirds.',
    encodings: ['xField=dimension', 'yField=additive measure'],
    min: { w: 3, h: 4 },
    max: { w: 6, h: 7 },
    example: '{"type":"chart","componentId":"arc.donut-chart","chartType":"donut","layout":{"x":6,"y":0,"w":6,"h":5},"xField":"channel","yField":"revenue"}',
    interactions: ['legend-filter', 'tooltip', 'click-filter'],
    kind: 'chart',
  },
  {
    id: 'arc.treemap',
    description: 'Hierarchical tiles sized by a measure',
    when: 'Part-to-whole when sizes matter more than precise comparison. ≤8 tiles. Must cross-filter.',
    encodings: ['xField=dimension', 'yField=measure'],
    min: { w: 4, h: 4 },
    max: { w: 12, h: 8 },
    example: '{"type":"chart","componentId":"arc.treemap","chartType":"treemap","layout":{"x":0,"y":0,"w":6,"h":5},"xField":"product","yField":"revenue"}',
    interactions: ['click-filter', 'tooltip'],
    kind: 'chart',
  },
  {
    id: 'arc.brush-chart',
    description: 'Focus + context area/line',
    when: 'Hero trend on time-indexed data. Prefer over a rainbow bar time series.',
    encodings: ['xField=time', 'yField=measure'],
    min: { w: 6, h: 5 },
    max: { w: 12, h: 8 },
    example: '{"type":"chart","componentId":"arc.brush-chart","chartType":"area","layout":{"x":0,"y":0,"w":12,"h":6},"xField":"order_date","yField":"revenue"}',
    interactions: ['brush'],
    kind: 'chart',
  },
  {
    id: 'arc.slope-chart',
    description: 'Two-period slope',
    when: 'Period change by category (H1→H2). Not totals-as-bars.',
    encodings: ['xField=dimension', 'yField=measure'],
    min: { w: 4, h: 4 },
    max: { w: 8, h: 7 },
    example: '{"type":"chart","componentId":"arc.slope-chart","layout":{"x":0,"y":0,"w":6,"h":5},"xField":"region","yField":"revenue"}',
    interactions: ['tooltip'],
    kind: 'chart',
  },
  {
    id: 'arc.waffle-chart',
    description: 'Unit/waffle share',
    when: 'A single share versus 100% with ≤6 parts.',
    encodings: ['xField=dimension', 'yField=measure'],
    min: { w: 3, h: 3 },
    max: { w: 6, h: 6 },
    example: '{"type":"chart","componentId":"arc.waffle-chart","layout":{"x":0,"y":0,"w":4,"h":4},"xField":"channel","yField":"sessions"}',
    interactions: ['tooltip'],
    kind: 'chart',
  },
  {
    id: 'arc.scatter-chart',
    description: 'Distribution / correlation scatter',
    when: 'Two numeric measures against each other (e.g. discount vs margin).',
    encodings: ['xField=measure', 'yField=measure'],
    min: { w: 5, h: 5 },
    max: { w: 12, h: 8 },
    example: '{"type":"chart","componentId":"arc.scatter-chart","chartType":"scatter","layout":{"x":0,"y":0,"w":6,"h":5},"xField":"discount_rate","yField":"gross_margin"}',
    interactions: ['tooltip'],
    kind: 'chart',
  },
  {
    id: 'arc.gauge',
    description: 'Single-value gauge',
    when: 'One attainment metric vs a target. Prefer a KPI card if you also need a sparkline.',
    encodings: ['yField=measure', 'optional targetField'],
    min: { w: 3, h: 3 },
    max: { w: 5, h: 5 },
    example: '{"type":"kpi","componentId":"arc.gauge","layout":{"x":0,"y":0,"w":4,"h":3},"measure":{"field":"gross_margin","agg":"avg","format":"percent"}}',
    interactions: [],
    kind: 'kpi',
  },
  {
    id: 'arc.sparkline',
    description: 'Inline sparkline',
    when: 'Tiny supporting trend next to a KPI. Do not use as a full chart.',
    encodings: ['time × measure'],
    min: { w: 2, h: 2 },
    max: { w: 4, h: 3 },
    example: '{"type":"kpi","componentId":"arc.sparkline","layout":{"x":0,"y":0,"w":3,"h":2},"measure":{"field":"revenue","agg":"sum","format":"currency"}}',
    interactions: [],
    kind: 'kpi',
  },
  {
    id: 'arc.metric-card',
    description: 'KPI with delta and sparkline',
    when: '3–4 real business measures, including derived ratios. Never filler unique-counts.',
    encodings: ['measure or derived ratio'],
    min: { w: 3, h: 2 },
    max: { w: 7, h: 4 },
    example: '{"type":"kpi","componentId":"arc.metric-card","role":"hero","layout":{"x":0,"y":0,"w":6,"h":4},"title":"Gross margin","measure":{"kind":"weighted","numerator":{"field":"gross_margin","agg":"avg"},"denominator":{"field":"revenue","agg":"sum"},"format":"percent"}}',
    interactions: ['period-compare'],
    kind: 'kpi',
  },
  {
    id: 'arc.sortable-data-table',
    description: 'Sortable aggregated table with data bars',
    when: 'Detail slice of top N combos. groupBy 1–2 dims, 2–3 measures, limit ≤12.',
    encodings: ['table.groupBy[] × table.measures[]'],
    min: { w: 6, h: 4 },
    max: { w: 12, h: 8 },
    example: '{"type":"table","componentId":"arc.sortable-data-table","layout":{"x":0,"y":0,"w":12,"h":6},"table":{"groupBy":["region","channel"],"sort":{"field":"revenue","dir":"desc"},"limit":8,"measures":[{"field":"revenue","agg":"sum","format":"currency"}]}}',
    interactions: ['sort', 'limit'],
    kind: 'table',
  },
  {
    id: 'sbi.small-multiples',
    description: 'Small multiples of a measure by a facet',
    when: 'Many groups over time (5–8 panels). Set groupField to the facet.',
    encodings: ['xField=time', 'yField=measure', 'groupField=facet'],
    min: { w: 6, h: 5 },
    max: { w: 12, h: 8 },
    example: '{"type":"chart","componentId":"sbi.small-multiples","layout":{"x":0,"y":0,"w":12,"h":6},"xField":"order_date","yField":"revenue","groupField":"region"}',
    interactions: ['cross-filter'],
    kind: 'custom',
  },
  {
    id: 'sbi.ridgeline',
    description: 'Distribution ridges by group',
    when: 'Distribution of a measure across a few groups. Falls back to small multiples if needed.',
    encodings: ['xField=measure or time', 'groupField=facet'],
    min: { w: 6, h: 5 },
    max: { w: 12, h: 8 },
    example: '{"type":"chart","componentId":"sbi.ridgeline","layout":{"x":0,"y":0,"w":8,"h":6},"xField":"order_date","yField":"revenue","groupField":"channel"}',
    interactions: ['tooltip'],
    kind: 'custom',
  },
  {
    id: 'sbi.bullet-variance',
    description: 'Budget vs actual bullet',
    when: 'Variance vs a target (opex vs budget). Red if overspend on lower-is-better.',
    encodings: ['xField=dimension', 'yField=actual', 'series target or targetField'],
    min: { w: 4, h: 3 },
    max: { w: 8, h: 5 },
    example: '{"type":"chart","componentId":"sbi.bullet-variance","layout":{"x":0,"y":0,"w":6,"h":4},"xField":"business_unit","yField":"opex","targetField":"budget_opex","series":[{"field":"opex","style":"bar"},{"field":"budget_opex","style":"target"}]}',
    interactions: [],
    kind: 'custom',
  },
  {
    id: 'sbi.kpi-drilldown',
    description: 'KPI that drills a hierarchy',
    when: 'A hero KPI that should filter the rest of the board on click.',
    encodings: ['measure', 'optional filter.field'],
    min: { w: 3, h: 3 },
    max: { w: 6, h: 4 },
    example: '{"type":"kpi","componentId":"sbi.kpi-drilldown","layout":{"x":0,"y":0,"w":4,"h":3},"title":"APAC revenue","measure":{"field":"revenue","agg":"sum","format":"currency"},"filter":{"field":"region","op":"equals","value":"APAC"}}',
    interactions: ['drill'],
    kind: 'custom',
  },
  {
    id: 'arc.filter-toolbar',
    description: 'Arc filter toolbar with add-filter menu',
    when: 'The canvas always mounts this for live filters. Do not emit as a widget; pick chart/kpi/table ids instead.',
    encodings: ['control'],
    min: { w: 12, h: 1 },
    max: { w: 12, h: 2 },
    example: '{"type":"section","componentId":"arc.filter-toolbar","title":"Filters"}',
    interactions: ['filter'],
    kind: 'control',
  },
  {
    id: 'arc.chip-group',
    description: 'Facet chip group for a dimension slicer',
    when: 'Slicing a board by a low-cardinality dimension. The renderer mounts chips from the dataset; you still pick chart encodings.',
    encodings: ['dimension values'],
    min: { w: 4, h: 1 },
    max: { w: 12, h: 2 },
    example: '{"type":"section","componentId":"arc.chip-group","title":"Region"}',
    interactions: ['filter'],
    kind: 'control',
  },
  {
    id: 'planes.segmented-control',
    description: 'Planes segmented control (period compare)',
    when: 'Switch actual vs previous-period vs previous-year. Mounted on the canvas.',
    encodings: ['none'],
    min: { w: 4, h: 1 },
    max: { w: 6, h: 2 },
    example: '{"type":"section","componentId":"planes.segmented-control","title":"Compare"}',
    interactions: ['period-compare'],
    kind: 'control',
  },
  {
    id: 'arc.badge',
    description: 'Arc badge for filter chips and status',
    when: 'Call out an active filter or polarity on a KPI. Renderer applies badges automatically.',
    encodings: ['label'],
    min: { w: 2, h: 1 },
    max: { w: 4, h: 2 },
    example: '{"type":"kpi","componentId":"arc.badge","title":"On track"}',
    interactions: [],
    kind: 'control',
  },
];

export function catalogPromptBlock(): string {
  return COMPONENT_CATALOG.map((c) => (
    `${c.id}: ${c.description}. When: ${c.when} Encode: ${c.encodings.join('; ')}. Grid ${c.min.w}x${c.min.h}–${c.max.w}x${c.max.h}. e.g. ${c.example}`
  )).join('\n');
}

const CHART_COMPONENT: Record<string, string> = {
  line: 'arc.line-chart',
  'stepped-line': 'arc.line-chart',
  area: 'arc.brush-chart',
  'stacked-area': 'arc.brush-chart',
  bar: 'arc.bar-chart',
  'stacked-bar': 'arc.bar-chart',
  'grouped-bar': 'arc.bar-chart',
  'horizontal-bar': 'arc.bar-chart',
  pie: 'arc.donut-chart',
  donut: 'arc.donut-chart',
  treemap: 'arc.treemap',
  scatter: 'arc.scatter-chart',
  bubble: 'arc.scatter-chart',
};

export function nearestComponent(id?: string, type?: string, chartType?: string): CatalogEntry {
  if (type === 'insight' || type === 'section') {
    return COMPONENT_CATALOG.find((c) => c.id === 'arc.metric-card')!;
  }
  if (id) {
    const exact = COMPONENT_CATALOG.find((c) => c.id === id);
    if (exact && exact.kind !== 'control') return exact;
    const fuzzy = COMPONENT_CATALOG.find((c) => c.kind !== 'control' && (id.includes(c.id.split('.')[1] || c.id) || c.id.includes(id)));
    if (fuzzy) return fuzzy;
  }
  if (type === 'kpi') return COMPONENT_CATALOG.find((c) => c.id === 'arc.metric-card')!;
  if (type === 'table') return COMPONENT_CATALOG.find((c) => c.id === 'arc.sortable-data-table')!;
  if (chartType && CHART_COMPONENT[chartType]) {
    return COMPONENT_CATALOG.find((c) => c.id === CHART_COMPONENT[chartType])!;
  }
  if (type === 'chart') return COMPONENT_CATALOG.find((c) => c.id === 'arc.bar-chart')!;
  return COMPONENT_CATALOG.find((c) => c.id === 'arc.bar-chart')!;
}

export function repairCatalogWidgets(spec: import('./types').DashboardSpec, datasets: import('./types').DashboardDataset[]): import('./types').DashboardSpec {
  const names = new Set(
    datasets.flatMap((ds) => ds.columns?.map((c) => c.name) || Object.keys(ds.data?.[0] || {})),
  );
  const firstMeasure = [...names].find((n) => /rev|session|unit|amount|count|opex|ebitda/i.test(n));
  const firstDim = [...names].find((n) => /region|channel|device|product|segment|unit|dept|queue/i.test(n));
  const firstTime = [...names].find((n) => /date|month|week|opened/i.test(n));

  const widgets = spec.widgets.map((widget) => {
    if (widget.type === 'insight' || widget.type === 'section') {
      return { ...widget, componentId: undefined };
    }
    const entry = nearestComponent(widget.componentId, widget.type, widget.chartType);
    const next = { ...widget, componentId: entry.id };
    if (next.componentId === 'sbi.ridgeline') {
      next.componentId = 'sbi.small-multiples';
      next.chartType = 'area';
    }
    if (next.componentId === 'arc.scatter-chart') next.chartType = 'scatter';
    if (next.type === 'chart') {
      if (next.xField && !names.has(next.xField)) next.xField = firstTime || firstDim || next.xField;
      if (next.yField && !names.has(next.yField) && !next.measure) next.yField = firstMeasure || next.yField;
      if (!next.xField) next.xField = firstTime || firstDim;
      if (!next.yField && !next.measure) next.yField = firstMeasure;
      const rateY = /rate|margin|discount|pct|percent/i.test(next.yField || next.title);
      if ((next.chartType === 'donut' || next.chartType === 'pie' || next.componentId === 'arc.donut-chart') && rateY) {
        next.chartType = 'bar';
        next.componentId = 'arc.bar-chart';
      }
      if (!next.series?.length) {
        const mentioned = [...names].filter((n) => new RegExp(n.replace(/_/g, '[-_ ]'), 'i').test(next.title));
        const extras = mentioned.filter((n) => n !== next.yField && n !== next.xField);
        if (/&| vs |overlay/i.test(next.title) && extras[0]) {
          next.series = [
            { field: next.yField || extras[0], style: 'bar' },
            { field: extras[0], style: 'line', axis: 'right' },
          ];
        }
      }
      if (next.componentId === 'sbi.small-multiples' && !next.groupField) {
        const by = next.title.match(/by\s+([a-z0-9_ ]+)/i);
        const facet = by?.[1]?.trim().replace(/\s+/g, '_');
        if (facet && names.has(facet)) next.groupField = facet;
        else next.groupField = firstDim;
        if (!next.groupField) {
          next.componentId = 'arc.line-chart';
          next.chartType = 'line';
        }
      }
    }
    if (next.type === 'kpi' && next.kpi?.field && !names.has(next.kpi.field) && !next.measure) {
      next.kpi = { ...next.kpi, field: firstMeasure };
      next.yField = firstMeasure;
    }
    return next;
  }).filter((widget) => {
    if (widget.type !== 'chart') return true;
    return Boolean(widget.xField && (widget.yField || widget.measure));
  });

  return { ...spec, widgets };
}
