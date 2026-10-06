export const DASHBOARD_SPEC_VERSION = 1 as const;

export const LAYOUT_ARCHETYPES = [
  'hero-kpi-rail',
  'editorial',
  'command-center',
  'story-arc',
  'split-insight',
  'metric-mosaic',
  'comparison',
  'funnel-flow',
] as const;

export type LayoutArchetype = (typeof LAYOUT_ARCHETYPES)[number];

export const CHART_TYPES = [
  'bar',
  'stacked-bar',
  'grouped-bar',
  'horizontal-bar',
  'line',
  'stepped-line',
  'area',
  'stacked-area',
  'pie',
  'donut',
  'scatter',
  'bubble',
  'force',
  'network',
  'pack',
  'radial',
  'tree',
  'treemap',
  'heatmap',
] as const;

export type ChartType = (typeof CHART_TYPES)[number];

export const WIDGET_TYPES = ['kpi', 'chart', 'insight', 'table', 'section'] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const FILTER_OPS = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'gt',
  'gte',
  'lt',
  'lte',
] as const;

export type FilterOp = (typeof FILTER_OPS)[number];

export const AGGREGATIONS = ['sum', 'avg', 'count', 'min', 'max'] as const;
export type Aggregation = (typeof AGGREGATIONS)[number];

export const METRIC_POLARITIES = ['higher-is-better', 'lower-is-better'] as const;
export type MetricPolarity = (typeof METRIC_POLARITIES)[number];

export interface GridPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Palette {
  id: string;
  label: string;
  mode: 'light' | 'dark';
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accentSoft: string;
  border: string;
  chart: string[];
}

export interface WidgetFilter {
  field: string;
  op: FilterOp;
  value: string;
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  subtitle?: string;
  sectionId?: string;
  layout: GridPosition;
  chartType?: ChartType;
  datasetId?: string;
  xField?: string;
  yField?: string;
  groupField?: string;
  sizeField?: string;
  color?: string;
  colors?: string[];
  aggregation?: Aggregation;
  filter?: WidgetFilter;
  role?: 'hero' | 'support' | 'compare-a' | 'compare-b' | 'strip' | 'featured';
  polarity?: MetricPolarity;
  kpi?: {
    value: string;
    trend?: string;
    field?: string;
    aggregation?: Aggregation;
    format?: 'number' | 'currency' | 'percent';
    delta?: number;
    sparkline?: number[];
    polarity?: MetricPolarity;
  };
  insight?: {
    title?: string;
    text: string;
    tone?: 'neutral' | 'positive' | 'warning';
  };
  columns?: string[];
}

export interface DashboardSection {
  id: string;
  title?: string;
  description?: string;
}

export interface DashboardSpec {
  version: typeof DASHBOARD_SPEC_VERSION;
  id: string;
  title: string;
  subtitle?: string;
  intent?: string;
  archetype: LayoutArchetype;
  seed: number;
  theme: {
    palette: Palette;
    fontFamily: string;
    headingFont?: string;
    radius: string;
    density: 'compact' | 'comfortable' | 'airy';
  };
  narrative?: {
    headline: string;
    body: string;
  };
  sections: DashboardSection[];
  widgets: DashboardWidget[];
  filters?: WidgetFilter[];
}

export interface SavedDashboard {
  id: string;
  name: string;
  spec: DashboardSpec;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardPreset {
  id: string;
  name: string;
  description: string;
  paletteId: string;
  archetype?: LayoutArchetype;
  mode: 'light' | 'dark';
}

export interface LegacyDashboardLayout {
  title?: string;
  fontFamily?: string;
  globalBg?: string;
  borderRadius?: string;
  kpis?: Array<{ label?: string; value?: string | number; trend?: string }>;
  charts?: Array<{
    id?: string;
    title?: string;
    type?: string;
    datasetId?: string;
    xAxisField?: string;
    yAxisField?: string;
    groupField?: string;
    sizeField?: string;
    color?: string;
    bgColor?: string;
    filterField?: string;
    filterOp?: string;
    filterValue?: string;
  }>;
}

export interface DatasetColumn {
  name: string;
  type?: string;
}

export interface DashboardDataset {
  id: string;
  name: string;
  data: Record<string, unknown>[];
  columns?: DatasetColumn[];
}
