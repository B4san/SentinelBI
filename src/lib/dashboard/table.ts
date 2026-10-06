import { applyFilter, resolveDataset } from './aggregate';
import { aggregateNumber, formatMetric } from './format';
import { metricFormat } from './insights';
import { inferAggregation, looksLikeDuration } from './measures';
import type { DashboardDataset, DashboardWidget, WidgetFilter } from './types';

export interface TableCell { field: string; value: string | number; raw: unknown }
export interface TableModel {
  columns: string[];
  rows: Array<Record<string, string | number>>;
  rawRows: Array<Record<string, string | number>>;
  totals?: Record<string, string | number>;
  barField?: string;
}

export function prepareTableModel(
  datasets: DashboardDataset[],
  widget: DashboardWidget,
  extraFilters: WidgetFilter[] = [],
): TableModel {
  const dataset = resolveDataset(datasets, widget.datasetId);
  if (!dataset) return { columns: [], rows: [], rawRows: [] };
  let rows = dataset.data || [];
  for (const filter of extraFilters) rows = applyFilter(rows, filter);
  rows = applyFilter(rows, widget.filter);

  const names = new Set(dataset.columns?.map((c) => c.name) || Object.keys(dataset.data?.[0] || {}));
  const query = widget.table;
  const groupBy = (query?.groupBy || []).map((field) => resolveColumn(field, names)).filter((field): field is string => Boolean(field));
  const measures = (query?.measures?.length
    ? query.measures
    : (widget.columns || []).filter((c) => dataset.data.some((row) => typeof row[c] === 'number')).map((field) => ({ field, agg: inferAggregation(field) }))
  ).map((item) => ({ ...item, field: resolveColumn(item.field, names) || item.field }))
    .filter((item) => item.field && names.has(item.field));

  if (groupBy.length && (measures.length || widget.columns?.length)) {
    const measureList = measures.length
      ? measures
      : (widget.columns || []).filter((c) => names.has(c) && !groupBy.includes(c)).map((field) => ({ field, agg: inferAggregation(field) }));
    const map = new Map<string, { keys: Record<string, string>; values: Record<string, number[]> }>();
    for (const row of rows) {
      const keys: Record<string, string> = {};
      for (const field of groupBy) keys[field] = String(row[field] ?? '');
      const id = groupBy.map((f) => keys[f]).join('|');
      const bucket = map.get(id) || { keys, values: {} };
      for (const measure of measureList) {
        const n = Number(row[measure.field]);
        if (!Number.isNaN(n)) {
          bucket.values[measure.field] = bucket.values[measure.field] || [];
          bucket.values[measure.field].push(n);
        }
      }
      map.set(id, bucket);
    }
    let out = Array.from(map.values()).map((bucket) => {
      const rec: Record<string, string | number> = { ...bucket.keys };
      for (const measure of measureList) {
        rec[measure.field] = aggregateNumber(bucket.values[measure.field] || [], measure.agg || inferAggregation(measure.field));
      }
      return rec;
    });
    const sortField = resolveColumn(query?.sort?.field, names) || measureList[0]?.field;
    if (sortField) {
      const dir = query?.sort?.dir === 'asc' ? 1 : -1;
      out = out.sort((a, b) => (Number(a[sortField]) - Number(b[sortField])) * dir);
    }
    const columns = [...groupBy, ...measureList.map((m) => m.field)];
    const limited = out.slice(0, query?.limit || 12);
    const totals: Record<string, string | number> = { [groupBy[0]]: 'Total' };
    for (const measure of measureList) {
      const agg = measure.agg || inferAggregation(measure.field);
      totals[measure.field] = aggregateNumber(limited.map((row) => Number(row[measure.field]) || 0), agg === 'avg' ? 'avg' : 'sum');
    }
    return {
      columns,
      rows: [...limited.map((row) => formatRow(row, measureList)), formatRow(totals, measureList)],
      rawRows: [...limited, totals],
      totals: formatRow(totals, measureList),
      barField: measureList[0]?.field,
    };
  }

  const columns = (widget.columns?.length ? widget.columns : Object.keys(rows[0] || {}).slice(0, 6))
    .map((c) => resolveColumn(c, names) || c)
    .filter((c) => names.has(c) || rows.some((row) => c in row));
  const sortField = resolveColumn(query?.sort?.field, names) || columns.find((c) => typeof rows[0]?.[c] === 'number');
  const sorted = [...rows].sort((a, b) => {
    if (!sortField) return 0;
    const av = a[sortField];
    const bv = b[sortField];
    const an = Number(av);
    const bn = Number(bv);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return (an - bn) * (query?.sort?.dir === 'asc' ? 1 : -1);
    return String(av).localeCompare(String(bv));
  });
  const limited = sorted.slice(0, query?.limit || 12);
  const measureCols = columns.filter((c) => limited.some((row) => typeof row[c] === 'number'));
  return {
    columns,
    rows: limited.map((row) => {
      const rec: Record<string, string | number> = {};
      for (const col of columns) rec[col] = formatCell(col, row[col]);
      return rec;
    }),
    rawRows: limited.map((row) => {
      const rec: Record<string, string | number> = {};
      for (const col of columns) rec[col] = typeof row[col] === 'number' ? Number(row[col]) : String(row[col] ?? '');
      return rec;
    }),
    barField: measureCols[0],
  };
}

function resolveColumn(field: string | undefined, names: Set<string>): string | undefined {
  if (!field) return undefined;
  if (names.has(field)) return field;
  const slug = field.toLowerCase().replace(/\s+/g, '_');
  if (names.has(slug)) return slug;
  return [...names].find((name) => name.toLowerCase() === slug || name.toLowerCase().includes(slug));
}

function formatRow(
  row: Record<string, string | number>,
  measures: Array<{ field: string; format?: string }>,
): Record<string, string | number> {
  const rec: Record<string, string | number> = { ...row };
  for (const measure of measures) {
    const n = Number(row[measure.field]);
    if (!Number.isNaN(n)) rec[measure.field] = formatCell(measure.field, n, measure.format);
  }
  return rec;
}

function formatCell(field: string, value: unknown, format?: string): string | number {
  const n = Number(value);
  if (value !== '' && value != null && !Number.isNaN(n) && typeof value !== 'boolean') {
    const fmt = format || (looksLikeDuration(field) ? 'duration' : metricFormat(field));
    return formatMetric(n, fmt as 'number');
  }
  return String(value ?? '');
}
