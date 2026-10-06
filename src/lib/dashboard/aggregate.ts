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
): Array<Record<string, string | number | null>> {
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
  const wantsCombo = /&| vs |overlay|and /i.test(widget.title) || (widget.series || []).some((s) => s.axis === 'right' || s.style === 'line');
  const allowed = seriesFields.filter((field) => {
    const series = widget.series?.find((s) => s.field === field);
    if (series?.axis === 'right' || series?.style === 'line' || wantsCombo) return true;
    return !primaryUnit || units.get(field) === primaryUnit;
  });
  const measureFields = (allowed.length ? allowed : seriesFields).slice(0, 2);
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
      const rec: Record<string, string | number | null> = { [xField]: key, name: label, label };
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
    if (compare) {
      const field = measureFields[0] || derived?.numerator.field || valueKey;
      const shifted = previousPeriodSeries(rows, xField, field, aggregation, compare, derived);
      const aligned = alignCompare(trimmed, shifted);
      return aligned.rows;
    }
    return applyShareOrSlope(trimmed, widget, rows, xField, valueKey);
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
    const rec: Record<string, string | number | null> = { [xField]: name, name };
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
    return applyShareOrSlope(top, widget, rows, xField, valueKey);
  }

  if (widget.compare) {
    const compare = widget.compare === 'prior-year' ? 'previous-year' : widget.compare === 'prior-period' ? 'previous-period' : widget.compare;
    const field = measureFields[0] || derived?.numerator.field || valueKey;
    const shifted = previousPeriodSeries(rows, xField, field, aggregation, compare, derived);
    return alignCompare(applyShareOrSlope(series, widget, rows, xField, valueKey), shifted).rows;
  }

  return applyShareOrSlope(series, widget, rows, xField, valueKey);
}

function applyShareOrSlope(
  series: Array<Record<string, string | number | null>>,
  widget: DashboardWidget,
  rows: Record<string, unknown>[],
  xField: string,
  valueKey: string,
): Array<Record<string, string | number | null>> {
  const title = `${widget.title} ${widget.subtitle || ''} ${widget.componentId || ''}`;
  const wantsShare = /share|% of total/i.test(title) || widget.componentId === 'arc.waffle-chart';
  const wantsSlope = /change|growth driver|slope/i.test(title) || widget.componentId === 'arc.slope-chart';
  if (wantsSlope) {
    const fields = classifyFields({ id: widget.datasetId || 'd', name: 'd', data: rows });
    const timeField = fields.time[0];
    if (timeField) {
      return series.map((row) => {
        const name = String(row.name || row[xField]);
        const slice = rows.filter((r) => String(r[xField]) === name);
        const change = periodChange(slice, timeField, widget.yField || valueKey);
        const value = change?.deltaPct ?? 0;
        return { ...row, value, [valueKey]: value, __start: change?.first ?? 0, __end: change?.second ?? 0 };
      });
    }
  }
  if (wantsShare) {
    const total = series.reduce((acc, row) => acc + Number(row.value || 0), 0) || 1;
    return series.map((row) => {
      const share = Number(row.value || 0) / total;
      return { ...row, value: share, [valueKey]: share, __share: share };
    });
  }
  return series;
}

function alignCompare(
  current: Array<Record<string, string | number | null>>,
  shifted: Array<number | null>,
): { rows: Array<Record<string, string | number | null>>; usedFallback: boolean } {
  const empty = shifted.every((v) => v == null);
  if (!empty) {
    return { rows: current.map((row, i) => ({ ...row, __compare: shifted[i] ?? null })), usedFallback: false };
  }
  const half = Math.floor(current.length / 2);
  return {
    rows: current.map((row, i) => ({
      ...row,
      __compare: i >= half ? Number(current[i - half]?.value ?? 0) : null,
      __compareLabel: 'H1 vs H2',
    })),
    usedFallback: true,
  };
}

function previousPeriodSeries(
  rows: Record<string, unknown>[],
  timeField: string,
  yField: string,
  aggregation: ReturnType<typeof inferAggregation>,
  compare: 'previous-period' | 'previous-year',
  derived?: ReturnType<typeof isDerivedMeasure> extends true ? import('./types').DerivedMeasure : import('./types').DerivedMeasure | undefined,
): Array<number | null> {
  const grain = autoTimeGrain(rows.map((row) => row[timeField]));
  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key = grainKey(row[timeField], grain);
    if (!key) continue;
    const bucket = grouped.get(key) || [];
    bucket.push(row);
    grouped.set(key, bucket);
  }
  const keys = [...grouped.keys()].sort();
  const values = keys.map((key) => {
    const slice = grouped.get(key) || [];
    if (derived) return computeDerivedValue(slice, derived, timeField);
    const nums = slice.map((row) => Number(row[yField])).filter((n) => !Number.isNaN(n));
    return Number(aggregateNumber(nums, inferAggregation(yField) || aggregation).toFixed(4));
  });
  const offset = compare === 'previous-year'
    ? (grain === 'month' ? 12 : grain === 'quarter' ? 4 : grain === 'week' ? 52 : 365)
    : Math.max(1, Math.floor(values.length / 2));
  const shifted = values.map((_, i) => (i >= offset ? values[i - offset] : null));
  if (shifted.some((v) => v != null)) return shifted;
  const half = Math.floor(values.length / 2);
  return values.map((_, i) => (i >= half ? values[i - half] ?? null : null));
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
