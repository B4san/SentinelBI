import { aggregateNumber, formatMetric } from './format';
import { isDerivedMeasure } from './ids';
import { bucketTimeSeries } from './timeGrain';
import type { Aggregation, DashboardDataset, DerivedMeasure, MeasureFormat, MeasureRef, WidgetMeasure } from './types';

export interface DerivedCandidate {
  id: string;
  title: string;
  measure?: DerivedMeasure;
  field?: string;
  agg?: Aggregation;
  format?: MeasureFormat;
}

const NAME = (value: string) => value.toLowerCase().replace(/[_-]+/g, ' ');

function hasField(names: string[], ...needles: string[]): string | undefined {
  return names.find((name) => needles.every((needle) => NAME(name).includes(needle)));
}

export function isSemiAdditive(field?: string): boolean {
  return /headcount|dso|balance|cash|fte|inventory|head count/i.test(field || '');
}

export function isDegenerateRatio(measure?: DerivedMeasure | null): boolean {
  if (!measure) return false;
  if (measure.kind === 'difference' || measure.kind === 'weighted') return false;
  return measure.numerator.field === measure.denominator.field;
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
  const units = hasField(names, 'unit');
  const discount = hasField(names, 'discount');
  const gmField = hasField(names, 'gross', 'margin');

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
  } else if (gmField) {
    out.push({
      id: 'gm',
      title: 'Gross margin',
      field: gmField,
      agg: 'avg',
      format: 'percent',
    });
  }
  if (revenue && (cogs || gmField) && discount) {
    if (gmField && revenue) {
      out.push({
        id: 'disc-margin',
        title: 'Discount-weighted margin',
        measure: { kind: 'weighted', numerator: { field: gmField, agg: 'avg' }, denominator: { field: revenue, agg: 'sum' }, format: 'percent' },
      });
    } else if (revenue && cogs) {
      out.push({
        id: 'disc-margin',
        title: 'Discount-weighted margin',
        measure: { kind: 'margin', numerator: { field: revenue, agg: 'sum' }, denominator: { field: cogs, agg: 'sum' }, format: 'percent' },
      });
    }
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
  if (revenue && units) {
    const ratio: DerivedMeasure = {
      kind: 'ratio',
      numerator: { field: revenue, agg: 'sum' },
      denominator: { field: units, agg: 'sum' },
      format: 'currency',
    };
    out.push({ id: 'aov', title: 'AOV', measure: ratio });
    out.push({ id: 'rev-unit', title: 'Revenue per unit', measure: { ...ratio } });
  }
  return out;
}

export function snapCandidate(title: string, dataset: DashboardDataset): DerivedCandidate | undefined {
  const proposed = proposeDerivedMeasures(dataset);
  const normalized = title.toLowerCase();
  const matchers: Array<{ test: RegExp; id: string }> = [
    { test: /discount[- ]weighted|discount vs margin/i, id: 'disc-margin' },
    { test: /gross margin/i, id: 'gm' },
    { test: /ebitda margin/i, id: 'ebitda-margin' },
    { test: /\broas\b/i, id: 'roas' },
    { test: /conversion rate|\bcvr\b/i, id: 'cvr' },
    { test: /\baov\b|average order/i, id: 'aov' },
    { test: /revenue per (head|fte|employee)/i, id: 'rev-fte' },
    { test: /revenue per unit/i, id: 'rev-unit' },
    { test: /opex vs budget|budget variance/i, id: 'opex-variance' },
  ];
  for (const matcher of matchers) {
    if (matcher.test.test(normalized)) {
      const found = proposed.find((item) => item.id === matcher.id);
      if (found) return found;
    }
  }
  return proposed.find((item) => item.title.toLowerCase() === normalized);
}

function measureRefValue(
  rows: Record<string, unknown>[],
  ref: MeasureRef,
  timeField?: string,
): number {
  const agg = ref.agg || inferAggregation(ref.field);
  if (isSemiAdditive(ref.field) && timeField) {
    const buckets = bucketTimeSeries(rows, timeField, ref.field, 'sum');
    if (buckets.length === 0) return 0;
    if (agg === 'max' || agg === 'min') return buckets[buckets.length - 1].value;
    return aggregateNumber(buckets.map((b) => b.value), 'avg');
  }
  const values = rows.map((row) => Number(row[ref.field])).filter((n) => !Number.isNaN(n));
  return aggregateNumber(values, agg);
}

export function computeDerivedValue(
  rows: Record<string, unknown>[],
  measure: DerivedMeasure,
  timeField?: string,
): number {
  if (isDegenerateRatio(measure)) return Number.NaN;
  if (measure.kind === 'weighted') {
    let num = 0;
    let den = 0;
    for (const row of rows) {
      const rate = Number(row[measure.numerator.field]);
      const weight = Number(row[measure.denominator.field]);
      if (Number.isNaN(rate) || Number.isNaN(weight)) continue;
      num += rate * weight;
      den += weight;
    }
    return den === 0 ? 0 : num / den;
  }
  const left = measureRefValue(rows, measure.numerator, timeField);
  const right = measureRefValue(rows, measure.denominator, timeField);
  if (measure.kind === 'difference') return left - right;
  if (measure.kind === 'margin') return right === 0 && left === 0 ? 0 : (left - right) / (left || 1);
  return right === 0 ? 0 : left / right;
}

export function computeWidgetMeasure(
  rows: Record<string, unknown>[],
  measure: WidgetMeasure | undefined,
  fallback?: { field?: string; agg?: Aggregation },
  timeField?: string,
): number {
  if (isDerivedMeasure(measure) && !isDegenerateRatio(measure as DerivedMeasure)) {
    return computeDerivedValue(rows, measure as DerivedMeasure, timeField);
  }
  const simple = measure && !isDerivedMeasure(measure) ? measure : undefined;
  const field = simple?.field || fallback?.field;
  if (!field) return Number.NaN;
  const agg = simple?.agg || fallback?.agg || inferAggregation(field);
  return measureRefValue(rows, { field, agg }, timeField);
}

export function formatDerived(value: number, format: MeasureFormat = 'number'): string {
  if (!Number.isFinite(value)) return '—';
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
  return /duration|seconds|_sec|latency/i.test(field || '') && !/dso/i.test(field || '');
}

export function inferAggregation(field?: string, format?: MeasureFormat): Aggregation {
  if (format === 'percent') return 'avg';
  if (isSemiAdditive(field)) return 'avg';
  if (/^avg_|_rate$|_pct$|_percent$|_seconds$|rate|margin|bounce|attrition|discount|duration|csat|nps/i.test(field || '')) {
    return 'avg';
  }
  return 'sum';
}

export function unitForField(field?: string, format?: MeasureFormat): string {
  if (format === 'currency' || /rev|sales|amount|gmv|spend|cost|opex|cogs|budget|ebitda/i.test(field || '')) return 'currency';
  if (format === 'percent' || /rate|margin|bounce|pct|percent|attrition|discount/i.test(field || '')) return 'percent';
  if (format === 'duration' || looksLikeDuration(field)) return 'duration';
  if (/session/i.test(field || '')) return 'sessions';
  if (/conversion/i.test(field || '')) return 'conversions';
  if (/unit/i.test(field || '')) return 'units';
  return 'number';
}
