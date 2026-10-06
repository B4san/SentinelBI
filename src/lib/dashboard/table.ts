import { applyFilter, resolveDataset } from './aggregate';
import { aggregateNumber, formatMetric } from './format';
import { metricFormat } from './insights';
import { looksLikeDuration } from './measures';
import type { DashboardDataset, DashboardWidget, WidgetFilter } from './types';

export interface TableCell { field: string; value: string | number; raw: unknown }
export interface TableModel {
  columns: string[];
  rows: Array<Record<string, string | number>>;
}

export function prepareTableModel(
  datasets: DashboardDataset[],
  widget: DashboardWidget,
  extraFilters: WidgetFilter[] = [],
): TableModel {
  const dataset = resolveDataset(datasets, widget.datasetId);
  if (!dataset) return { columns: [], rows: [] };
  let rows = dataset.data || [];
  for (const filter of extraFilters) rows = applyFilter(rows, filter);
  rows = applyFilter(rows, widget.filter);

  const query = widget.table;
  const groupBy = query?.groupBy?.filter(Boolean) || [];
  const measures = query?.measures?.length
    ? query.measures
    : (widget.columns || []).filter((c) => dataset.data.some((row) => typeof row[c] === 'number')).map((field) => ({ field, agg: 'sum' as const }));

  if (groupBy.length && measures.length) {
    const map = new Map<string, { keys: Record<string, string>; values: Record<string, number[]> }>();
    for (const row of rows) {
      const keys: Record<string, string> = {};
      for (const field of groupBy) keys[field] = String(row[field] ?? '');
      const id = groupBy.map((f) => keys[f]).join('|');
      const bucket = map.get(id) || { keys, values: {} };
      for (const measure of measures) {
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
      for (const measure of measures) {
        rec[measure.field] = aggregateNumber(bucket.values[measure.field] || [], measure.agg || 'sum');
      }
      return rec;
    });
    const sortField = query?.sort?.field || measures[0]?.field;
    if (sortField) {
      const dir = query?.sort?.dir === 'asc' ? 1 : -1;
      out = out.sort((a, b) => (Number(a[sortField]) - Number(b[sortField])) * dir);
    }
    return {
      columns: [...groupBy, ...measures.map((m) => m.field)],
      rows: out.slice(0, query?.limit || 15).map((row) => formatRow(row, measures)),
    };
  }

  const columns = widget.columns?.length ? widget.columns : Object.keys(rows[0] || {}).slice(0, 6);
  const sortField = query?.sort?.field || columns.find((c) => typeof rows[0]?.[c] === 'number');
  const sorted = [...rows].sort((a, b) => {
    if (!sortField) return 0;
    const av = a[sortField];
    const bv = b[sortField];
    const an = Number(av);
    const bn = Number(bv);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return (an - bn) * (query?.sort?.dir === 'asc' ? 1 : -1);
    return String(av).localeCompare(String(bv));
  });
  return {
    columns,
    rows: sorted.slice(0, query?.limit || 15).map((row) => {
      const rec: Record<string, string | number> = {};
      for (const col of columns) rec[col] = formatCell(col, row[col]);
      return rec;
    }),
  };
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
