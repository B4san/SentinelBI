import { aggregateNumber, formatMetric } from './format';
import type { Aggregation, DashboardDataset, DerivedMeasure, MeasureFormat } from './types';

export interface DerivedCandidate {
  id: string;
  title: string;
  measure: DerivedMeasure;
}

const NAME = (value: string) => value.toLowerCase().replace(/[_-]+/g, ' ');

function hasField(names: string[], ...needles: string[]): string | undefined {
  return names.find((name) => needles.every((needle) => NAME(name).includes(needle)));
}

export function proposeDerivedMeasures(dataset: DashboardDataset): DerivedCandidate[] {
  const names = dataset.columns?.map((c) => c.name) || Object.keys(dataset.data?.[0] || {});
  const out: DerivedCandidate[] = [];

  const revenue = hasField(names, 'revenue') || hasField(names, 'rev');
  const spend = hasField(names, 'ad', 'spend') || hasField(names, 'spend');
  const conversions = hasField(names, 'conversion');
  const sessions = hasField(names, 'session');
  const cogs = hasField(names, 'cogs') || hasField(names, 'cost of');
  const ebitda = hasField(names, 'ebitda');
  const headcount = hasField(names, 'headcount') || hasField(names, 'fte');
  const opex = hasField(names, 'opex');
  const budget = hasField(names, 'budget');

  if (revenue && spend) {
    out.push({
      id: 'roas',
      title: 'ROAS',
      measure: { kind: 'ratio', numerator: { field: revenue, agg: 'sum' }, denominator: { field: spend, agg: 'sum' }, format: 'multiple' },
    });
  }
  if (conversions && sessions) {
    out.push({
      id: 'cvr',
      title: 'Conversion rate',
      measure: { kind: 'ratio', numerator: { field: conversions, agg: 'sum' }, denominator: { field: sessions, agg: 'sum' }, format: 'percent' },
    });
  }
  if (revenue && cogs) {
    out.push({
      id: 'gm',
      title: 'Gross margin',
      measure: { kind: 'margin', numerator: { field: revenue, agg: 'sum' }, denominator: { field: cogs, agg: 'sum' }, format: 'percent' },
    });
  }
  if (ebitda && revenue) {
    out.push({
      id: 'ebitda-margin',
      title: 'EBITDA margin',
      measure: { kind: 'ratio', numerator: { field: ebitda, agg: 'sum' }, denominator: { field: revenue, agg: 'sum' }, format: 'percent' },
    });
  }
  if (revenue && headcount) {
    out.push({
      id: 'rev-fte',
      title: 'Revenue per FTE',
      measure: { kind: 'ratio', numerator: { field: revenue, agg: 'sum' }, denominator: { field: headcount, agg: 'avg' }, format: 'currency' },
    });
  }
  if (opex && budget) {
    out.push({
      id: 'opex-variance',
      title: 'Opex vs budget',
      measure: { kind: 'difference', numerator: { field: opex, agg: 'sum' }, denominator: { field: budget, agg: 'sum' }, format: 'currency' },
    });
  }
  return out;
}

export function computeDerivedValue(rows: Record<string, unknown>[], measure: DerivedMeasure): number {
  const left = aggregateNumber(
    rows.map((row) => Number(row[measure.numerator.field])).filter((n) => !Number.isNaN(n)),
    measure.numerator.agg || 'sum',
  );
  const right = aggregateNumber(
    rows.map((row) => Number(row[measure.denominator.field])).filter((n) => !Number.isNaN(n)),
    measure.denominator.agg || 'sum',
  );
  if (measure.kind === 'difference') return left - right;
  if (measure.kind === 'margin') return right === 0 && left === 0 ? 0 : (left - right) / (left || 1);
  return right === 0 ? 0 : left / right;
}

export function formatDerived(value: number, format: MeasureFormat = 'number'): string {
  if (format === 'multiple') return `${value.toFixed(2)}×`;
  if (format === 'duration') return formatDuration(value);
  return formatMetric(value, format === 'percent' || format === 'currency' ? format : 'number');
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export function looksLikeDuration(field?: string): boolean {
  return /duration|seconds|_sec|latency|dso/i.test(field || '');
}

export function inferAggregation(field?: string, format?: MeasureFormat): Aggregation {
  if (format === 'percent' || /rate|margin|bounce|attrition|discount/i.test(field || '')) return 'avg';
  return 'sum';
}
