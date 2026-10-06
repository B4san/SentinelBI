export interface CatalogEncoding {
  id: string;
  label: string;
}

export interface CatalogEntry {
  id: string;
  description: string;
  encodings: string[];
  min: { w: number; h: number };
  max: { w: number; h: number };
  interactions: string[];
  kind: 'chart' | 'kpi' | 'table' | 'control' | 'custom';
}

export const COMPONENT_CATALOG: CatalogEntry[] = [
  { id: 'arc.line-chart', description: 'Time series line', encodings: ['time × measure[]'], min: { w: 4, h: 4 }, max: { w: 12, h: 8 }, interactions: ['brush', 'tooltip', 'cross-filter'], kind: 'chart' },
  { id: 'arc.bar-chart', description: 'Categorical bars', encodings: ['dimension × measure', 'time × measure'], min: { w: 4, h: 4 }, max: { w: 12, h: 8 }, interactions: ['click-filter', 'tooltip'], kind: 'chart' },
  { id: 'arc.donut-chart', description: 'Part-to-whole donut', encodings: ['dimension × measure'], min: { w: 3, h: 4 }, max: { w: 6, h: 7 }, interactions: ['legend-filter', 'tooltip'], kind: 'chart' },
  { id: 'arc.treemap', description: 'Hierarchical tiles', encodings: ['hierarchy × measure'], min: { w: 4, h: 4 }, max: { w: 12, h: 8 }, interactions: ['drill'], kind: 'chart' },
  { id: 'arc.brush-chart', description: 'Focus + context time series', encodings: ['time × measure'], min: { w: 6, h: 5 }, max: { w: 12, h: 8 }, interactions: ['brush'], kind: 'chart' },
  { id: 'arc.slope-chart', description: 'Two-period slope', encodings: ['dimension × measure × period'], min: { w: 4, h: 4 }, max: { w: 8, h: 7 }, interactions: ['tooltip'], kind: 'chart' },
  { id: 'arc.waffle-chart', description: 'Unit/waffle share', encodings: ['dimension × measure'], min: { w: 3, h: 3 }, max: { w: 6, h: 6 }, interactions: ['tooltip'], kind: 'chart' },
  { id: 'arc.gauge', description: 'Single-value gauge', encodings: ['measure'], min: { w: 3, h: 3 }, max: { w: 5, h: 5 }, interactions: [], kind: 'kpi' },
  { id: 'arc.sparkline', description: 'Inline sparkline', encodings: ['time × measure'], min: { w: 2, h: 2 }, max: { w: 4, h: 3 }, interactions: [], kind: 'kpi' },
  { id: 'arc.metric-card', description: 'KPI with delta and sparkline', encodings: ['measure'], min: { w: 3, h: 2 }, max: { w: 7, h: 4 }, interactions: ['period-compare'], kind: 'kpi' },
  { id: 'arc.sortable-data-table', description: 'Sortable aggregated table', encodings: ['dimension[] × measure[]'], min: { w: 6, h: 4 }, max: { w: 12, h: 8 }, interactions: ['sort', 'limit'], kind: 'table' },
  { id: 'sbi.small-multiples', description: 'Small multiples of a measure by a facet', encodings: ['facet × time × measure'], min: { w: 6, h: 5 }, max: { w: 12, h: 8 }, interactions: ['cross-filter'], kind: 'custom' },
  { id: 'sbi.bullet-variance', description: 'Budget vs actual bullet', encodings: ['measure × target'], min: { w: 4, h: 3 }, max: { w: 8, h: 5 }, interactions: [], kind: 'custom' },
  { id: 'sbi.kpi-drilldown', description: 'KPI that drills a hierarchy', encodings: ['hierarchy × measure'], min: { w: 3, h: 3 }, max: { w: 6, h: 4 }, interactions: ['drill'], kind: 'custom' },
];

export function catalogPromptBlock(): string {
  return COMPONENT_CATALOG.map((c) => `- ${c.id}: ${c.description}. encodings=${c.encodings.join('; ')}. grid ${c.min.w}x${c.min.h}–${c.max.w}x${c.max.h}`).join('\n');
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
  scatter: 'arc.bar-chart',
  bubble: 'arc.bar-chart',
};

export function nearestComponent(id?: string, type?: string, chartType?: string): CatalogEntry {
  if (type === 'insight' || type === 'section') {
    return COMPONENT_CATALOG.find((c) => c.id === 'arc.metric-card')!;
  }
  if (id) {
    const exact = COMPONENT_CATALOG.find((c) => c.id === id);
    if (exact) return exact;
    const fuzzy = COMPONENT_CATALOG.find((c) => id.includes(c.id.split('.')[1] || c.id) || c.id.includes(id));
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
