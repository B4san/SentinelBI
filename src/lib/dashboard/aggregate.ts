import { classifyFields, looksLikeTime, metricFormat, periodChange, sparklineValues } from './insights';
import { parseLocalDate, startOfGrain, toLocalISODate } from './dates';
import { aggregateNumber, formatMetric } from './format';
import { computeWidgetKpi } from './facts';
import { isDerivedMeasure } from './ids';
import { computeDerivedValue, inferAggregation, looksLikeDuration, unitForField } from './measures';
import { autoTimeGrain, bucketTimeSeries } from './timeGrain';
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

function grainKey(value: unknown, grain: ReturnType<typeof autoTimeGrain>): string {
  const date = parseLocalDate(value);
  if (!date) return '';
  return toLocalISODate(startOfGrain(date, grain));
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

  const names = new Set(dataset.columns?.map((c) => c.name) || Object.keys(dataset.data?.[0] || {}));
  const xField = widget.xField;
  const yField = widget.yField;
  if (!xField) return [];

  const knownSeries = (widget.series || []).filter((s) => names.has(s.field) || s.field.startsWith('__'));
  if (widget.series?.length && knownSeries.length === 0 && !widget.measure && yField && !names.has(yField)) {
    return [];
  }

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
  const seriesFields = (knownSeries.length ? knownSeries.map((s) => s.field) : yField && names.has(yField) ? [yField] : [])
    .filter((field) => field && (field.startsWith('__') || names.has(field)));
  const units = new Map<string, string>();
  for (const field of seriesFields) units.set(field, unitForField(field));
  const primaryUnit = yField ? unitForField(yField) : units.get(seriesFields[0] || '');
  const allowed = seriesFields.filter((field) => {
    const series = widget.series?.find((s) => s.field === field);
    if (series?.axis === 'right') return true;
    return !primaryUnit || units.get(field) === primaryUnit;
  });
  const measureFields = allowed.length ? allowed : seriesFields.slice(0, 1);
  const timeSeries = looksLikeTime(xField, rows.map((row) => row[xField]));
  const derived = isDerivedMeasure(widget.measure) ? widget.measure : undefined;
  const valueKey = yField || derived?.numerator.field || measureFields[0] || 'value';

  if (timeSeries && (measureFields[0] || derived)) {
    const grain = autoTimeGrain(rows.map((row) => row[xField]));
    const grouped = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) {
      const key = grainKey(row[xField], grain);
      if (!key) continue;
      const bucket = grouped.get(key) || [];
      bucket.push(row);
      grouped.set(key, bucket);
    }
    const keys = [...grouped.keys()].sort();
    const out = keys.map((key) => {
      const slice = grouped.get(key) || [];
      const date = parseLocalDate(key);
      const label = date ? bucketTimeSeries(slice, xField, derived?.numerator.field || measureFields[0] || valueKey, 'sum', grain, { keepPartial: true })[0]?.label || key : key;
      const rec: Record<string, string | number> = { [xField]: key, name: label, label };
      if (derived) {
        const value = computeDerivedValue(slice, derived, xField);
        rec.value = value;
        rec[valueKey] = value;
      } else {
        for (const field of measureFields) {
          const nums = slice.map((row) => Number(row[field])).filter((n) => !Number.isNaN(n));
          rec[field] = Number(aggregateNumber(nums, inferAggregation(field) || aggregation).toFixed(4));
        }
        rec.value = Number(rec[measureFields[0]] ?? 0);
      }
      return rec;
    });
    const complete = bucketTimeSeries(rows, xField, measureFields[0] || derived?.numerator.field || valueKey, 'sum', grain);
    const allowedKeys = new Set(complete.map((b) => b.key));
    const trimmed = out.filter((row) => allowedKeys.has(String(row[xField])));
    const compare = widget.compare === 'prior-year' ? 'previous-year' : widget.compare === 'prior-period' ? 'previous-period' : widget.compare;
    if (compare && measureFields[0]) {
      const shifted = previousPeriodSeries(rows, xField, measureFields[0], aggregation, compare);
      return trimmed.map((row, i) => ({ ...row, __compare: shifted[i] ?? 0 }));
    }
    return trimmed;
  }

  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key = String(row[xField] ?? '');
    if (!key) continue;
    const bucket = groups.get(key) || [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  const series = Array.from(groups.entries()).map(([name, slice]) => {
    const rec: Record<string, string | number> = { [xField]: name, name };
    if (derived) {
      const value = computeDerivedValue(slice, derived, undefined);
      rec.value = value;
      rec[valueKey] = value;
      return rec;
    }
    const fields = measureFields.length ? measureFields : [yField || ''];
    for (const field of fields) {
      if (!field) continue;
      const nums = slice.map((row) => Number(row[field])).filter((n) => !Number.isNaN(n));
      rec[field] = Number(aggregateNumber(nums, inferAggregation(field) || aggregation).toFixed(4));
    }
    rec.value = Number(rec[fields[0] || 'value'] ?? 0);
    return rec;
  });

  if (widget.chartType === 'pie' || widget.chartType === 'donut' || widget.chartType === 'bar' || widget.chartType === 'horizontal-bar') {
    series.sort((a, b) => Number(b.value) - Number(a.value));
  }

  if (widget.chartType === 'pie' || widget.chartType === 'donut') {
    const top = series.slice(0, 7);
    const rest = series.slice(7);
    if (rest.length) {
      top.push({
        [xField]: 'Other',
        name: 'Other',
        value: rest.reduce((acc, row) => acc + Number(row.value || 0), 0),
      });
    }
    return top;
  }

  return series;
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
