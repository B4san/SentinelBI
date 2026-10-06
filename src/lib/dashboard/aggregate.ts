import { classifyFields, looksLikeTime, metricFormat, periodChange, sparklineValues } from './insights';
import { aggregateNumber, formatMetric } from './format';
import type { DashboardDataset, DashboardWidget, FilterOp, WidgetFilter } from './types';

export { aggregateNumber, formatMetric };

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

  const timeSeries = looksLikeTime(xField, series.map((row) => row.name));
  if (timeSeries) {
    series.sort((a, b) => Date.parse(String(a.name)) - Date.parse(String(b.name)));
  } else if (widget.chartType === 'pie' || widget.chartType === 'donut' || widget.chartType === 'bar' || widget.chartType === 'horizontal-bar') {
    series.sort((a, b) => Number(b.value) - Number(a.value));
  }

  return series.slice(0, widget.chartType === 'pie' || widget.chartType === 'donut' ? 8 : 16);
}

export interface KpiStats {
  value: string;
  raw: number;
  delta?: number;
  trend?: string;
  sparkline: number[];
  format: 'number' | 'currency' | 'percent';
}

export function computeKpiStats(
  datasets: DashboardDataset[],
  widget: DashboardWidget,
  extraFilters: WidgetFilter[] = [],
): KpiStats {
  const dataset = resolveDataset(datasets, widget.datasetId);
  const format = widget.kpi?.format || metricFormat(widget.kpi?.field || widget.yField);
  if (!dataset) {
    return { value: widget.kpi?.value || '—', raw: 0, trend: widget.kpi?.trend, sparkline: widget.kpi?.sparkline || [], format };
  }

  let rows = dataset.data || [];
  for (const filter of extraFilters) rows = applyFilter(rows, filter);
  rows = applyFilter(rows, widget.filter);

  const field = widget.kpi?.field || widget.yField;
  const aggregation = widget.kpi?.aggregation || widget.aggregation || 'sum';
  if (!field) {
    return {
      value: widget.kpi?.value || formatMetric(rows.length, 'number'),
      raw: rows.length,
      trend: widget.kpi?.trend,
      sparkline: widget.kpi?.sparkline || [],
      format,
    };
  }
  const values = rows.map((row) => Number(row[field])).filter((n) => !Number.isNaN(n));
  const raw = aggregateNumber(values, aggregation);
  const fields = classifyFields(dataset);
  const timeField = fields.time[0];
  const change = field && timeField ? periodChange(rows, timeField, field) : null;
  const delta = widget.kpi?.delta ?? change?.deltaPct;
  const sparkline = widget.kpi?.sparkline?.length
    ? widget.kpi.sparkline
    : field
      ? sparklineValues(rows, field, timeField)
      : [];
  const trend = widget.kpi?.trend && !/complete|coverage|healthy/i.test(widget.kpi.trend)
    ? widget.kpi.trend
    : delta != null
      ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% vs first half`
      : undefined;

  return {
    value: formatMetric(raw, format),
    raw,
    delta,
    trend,
    sparkline,
    format,
  };
}

export function computeKpiValue(
  datasets: DashboardDataset[],
  widget: DashboardWidget,
  extraFilters: WidgetFilter[] = [],
): string {
  if (widget.kpi?.value && !widget.kpi.field) return widget.kpi.value;
  return computeKpiStats(datasets, widget, extraFilters).value;
}
