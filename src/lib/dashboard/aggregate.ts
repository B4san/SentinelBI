import type { Aggregation, DashboardDataset, DashboardWidget, FilterOp, WidgetFilter } from './types';

export function applyFilter<T extends Record<string, unknown>>(rows: T[], filter?: WidgetFilter | null): T[] {
  if (!filter?.field || filter.value == null || filter.value === '') return rows;
  return rows.filter((row) => matchesFilter(row[filter.field], filter.op, filter.value));
}

export function matchesFilter(value: unknown, op: FilterOp, expected: string): boolean {
  const str = String(value ?? '').toLowerCase();
  const exp = String(expected ?? '').toLowerCase();
  const numVal = Number(value);
  const numExp = Number(expected);
  const bothNumeric = value !== '' && expected !== '' && !Number.isNaN(numVal) && !Number.isNaN(numExp);

  switch (op) {
    case 'equals':
      return str === exp;
    case 'not_equals':
      return str !== exp;
    case 'contains':
      return str.includes(exp);
    case 'not_contains':
      return !str.includes(exp);
    case 'starts_with':
      return str.startsWith(exp);
    case 'ends_with':
      return str.endsWith(exp);
    case 'gt':
      return bothNumeric ? numVal > numExp : str > exp;
    case 'gte':
      return bothNumeric ? numVal >= numExp : str >= exp;
    case 'lt':
      return bothNumeric ? numVal < numExp : str < exp;
    case 'lte':
      return bothNumeric ? numVal <= numExp : str <= exp;
    default:
      return true;
  }
}

export function aggregateNumber(values: number[], aggregation: Aggregation = 'sum'): number {
  if (values.length === 0) return 0;
  if (aggregation === 'count') return values.length;
  if (aggregation === 'min') return Math.min(...values);
  if (aggregation === 'max') return Math.max(...values);
  const sum = values.reduce((acc, n) => acc + n, 0);
  if (aggregation === 'avg') return sum / values.length;
  return sum;
}

export function formatMetric(value: number, format?: 'number' | 'currency' | 'percent'): string {
  if (!Number.isFinite(value)) return '—';
  if (format === 'currency') {
    if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  if (format === 'percent') return `${value.toFixed(1)}%`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function resolveDataset(datasets: DashboardDataset[], datasetId?: string): DashboardDataset | undefined {
  if (datasets.length === 0) return undefined;
  return datasets.find((d) => d.id === datasetId) || datasets[0];
}

export function prepareChartSeries(
  datasets: DashboardDataset[],
  widget: DashboardWidget,
  extraFilters: WidgetFilter[] = [],
): Array<Record<string, string | number>> {
  const dataset = resolveDataset(datasets, widget.datasetId);
  if (!dataset) return [];

  let rows = dataset.data || [];
  for (const filter of extraFilters) rows = applyFilter(rows, filter);
  rows = applyFilter(rows, widget.filter);

  const xField = widget.xField;
  const yField = widget.yField;
  if (!xField) return [];

  const aggregation = widget.aggregation || 'sum';
  const groups = new Map<string, number[]>();

  for (const row of rows) {
    const key = String(row[xField] ?? '');
    if (!key) continue;
    const raw = yField ? Number(row[yField]) : 1;
    const value = yField && !Number.isNaN(raw) ? raw : 1;
    const bucket = groups.get(key) || [];
    bucket.push(value);
    groups.set(key, bucket);
  }

  const series = Array.from(groups.entries()).map(([name, values]) => ({
    [xField]: name,
    name,
    [yField || 'value']: Number(aggregateNumber(values, yField ? aggregation : 'count').toFixed(2)),
    value: Number(aggregateNumber(values, yField ? aggregation : 'count').toFixed(2)),
  }));

  series.sort((a, b) => Number(b.value) - Number(a.value));
  return series.slice(0, widget.chartType === 'pie' || widget.chartType === 'donut' ? 8 : 16);
}

export function computeKpiValue(
  datasets: DashboardDataset[],
  widget: DashboardWidget,
  extraFilters: WidgetFilter[] = [],
): string {
  if (widget.kpi?.value && !widget.kpi.field) return widget.kpi.value;
  const dataset = resolveDataset(datasets, widget.datasetId);
  if (!dataset) return widget.kpi?.value || '—';

  let rows = dataset.data || [];
  for (const filter of extraFilters) rows = applyFilter(rows, filter);
  rows = applyFilter(rows, widget.filter);

  const field = widget.kpi?.field || widget.yField;
  const aggregation = widget.kpi?.aggregation || widget.aggregation || 'sum';
  if (!field) return formatMetric(rows.length, 'number');

  const values = rows
    .map((row) => Number(row[field]))
    .filter((n) => !Number.isNaN(n));
  return formatMetric(aggregateNumber(values, aggregation), widget.kpi?.format);
}
