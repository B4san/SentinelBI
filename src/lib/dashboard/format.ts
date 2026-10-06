import type { Aggregation } from './types';

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
  if (format === 'percent') {
    const pct = Math.abs(value) <= 1 ? value * 100 : value;
    return `${pct.toFixed(1)}%`;
  }
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}
