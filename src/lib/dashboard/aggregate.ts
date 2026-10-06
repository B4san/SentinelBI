import { classifyFields, looksLikeTime, metricFormat, periodChange, sparklineValues } from './insights';
import { parseLocalDate } from './dates';
import { aggregateNumber, formatMetric } from './format';
import { computeWidgetKpi } from './facts';
import { inferAggregation, looksLikeDuration } from './measures';
import { bucketTimeSeries } from './timeGrain';
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

  if (widget.chartType === 'scatter' || widget.chartType === 'bubble') {
    const points: Array<Record<string, string | number>> = [];
    for (const row of rows) {
      const x = Number(row[xField]);
      const y = Number(row[yField || '']);
      if (Number.isNaN(x) || Number.isNaN(y)) continue;
      points.push({ [xField]: x, [yField || 'value']: y, name: x, value: y });
    }
    return points.length > 2000 ? samplePoints(points, 2000) : points;
  }

  const aggregation = widget.aggregation || inferAggregation(yField);
  const seriesFields = widget.series?.length ? widget.series.map((s) => s.field) : yField ? [yField] : [];
  const timeSeries = looksLikeTime(xField, rows.map((row) => row[xField]));

  if (timeSeries && seriesFields[0]) {
    const buckets = new Map<string, Record<string, string | number>>();
    for (const field of seriesFields) {
      const grain = bucketTimeSeries(rows, xField, field, aggregation);
      for (const item of grain) {
        const rec = buckets.get(item.key) || { [xField]: item.key, name: item.label, label: item.label };
        rec[field] = item.value;
        if (field === seriesFields[0]) rec.value = item.value;
        buckets.set(item.key, rec);
      }
    }
    const out = Array.from(buckets.values());
    if (widget.compare && timeSeries) {
      const shifted = previousPeriodSeries(rows, xField, seriesFields[0], aggregation, widget.compare);
      return out.map((row, i) => ({ ...row, __compare: shifted[i] ?? 0 }));
    }
    return out;
  }

  const groups = new Map<string, Record<string, number[]>>();
  for (const row of rows) {
    const key = String(row[xField] ?? '');
    if (!key) continue;
    const bucket = groups.get(key) || {};
    for (const field of seriesFields.length ? seriesFields : [yField || '']) {
      const raw = field ? Number(row[field]) : 1;
      const value = field && !Number.isNaN(raw) ? raw : 1;
      bucket[field || 'value'] = bucket[field || 'value'] || [];
      bucket[field || 'value'].push(value);
    }
    groups.set(key, bucket);
  }

  const series = Array.from(groups.entries()).map(([name, values]) => {
    const rec: Record<string, string | number> = { [xField]: name, name };
    for (const [field, nums] of Object.entries(values)) {
      rec[field] = Number(aggregateNumber(nums, field && yField ? aggregation : 'count').toFixed(4));
    }
    rec.value = Number(rec[seriesFields[0] || yField || 'value'] ?? rec.value ?? 0);
    return rec;
  });

  if (widget.chartType === 'pie' || widget.chartType === 'donut' || widget.chartType === 'bar' || widget.chartType === 'horizontal-bar') {
    series.sort((a, b) => Number(b.value) - Number(a.value));
  }

  return series.slice(0, widget.chartType === 'pie' || widget.chartType === 'donut' ? 8 : series.length);
}

function previousPeriodSeries(
  rows: Record<string, unknown>[],
  timeField: string,
  yField: string,
  aggregation: ReturnType<typeof inferAggregation>,
  compare: 'previous-period' | 'previous-year',
): number[] {
  const grain = bucketTimeSeries(rows, timeField, yField, aggregation);
  if (compare === 'previous-year') {
    return grain.map((item, i) => grain[i - 12]?.value ?? 0);
  }
  const half = Math.floor(grain.length / 2);
  return grain.map((_, i) => grain[i - half]?.value ?? 0);
}

function samplePoints<T>(points: T[], limit: number): T[] {
  if (points.length <= limit) return points;
  const step = points.length / limit;
  return Array.from({ length: limit }, (_, i) => points[Math.floor(i * step)]);
}

export function computeKpiStats(
  datasets: DashboardDataset[],
  widget: DashboardWidget,
  extraFilters: WidgetFilter[] = [],
) {
  return computeWidgetKpi(datasets, widget, extraFilters);
}

export function computeKpiValue(
  datasets: DashboardDataset[],
  widget: DashboardWidget,
  extraFilters: WidgetFilter[] = [],
): string {
  return computeWidgetKpi(datasets, widget, extraFilters).value;
}

export { parseLocalDate, looksLikeDuration };
