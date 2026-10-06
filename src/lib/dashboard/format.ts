import type { Aggregation, MeasureFormat } from './types';

export function aggregateNumber(values: number[], aggregation: Aggregation = 'sum'): number {
  if (values.length === 0) return 0;
  if (aggregation === 'count') return values.length;
  if (aggregation === 'min') return Math.min(...values);
  if (aggregation === 'max') return Math.max(...values);
  const sum = values.reduce((acc, n) => acc + n, 0);
  if (aggregation === 'avg') return sum / values.length;
  return sum;
}

export function formatMetric(value: number, format?: MeasureFormat): string {
  if (!Number.isFinite(value)) return '—';
  if (format === 'duration') {
    const total = Math.max(0, Math.round(value));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  }
  if (format === 'multiple') return `${value.toFixed(2)}×`;
  if (format === 'currency') {
    if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  if (format === 'percent') {
    const pct = Math.abs(value) <= 1.5 ? value * 100 : value;
    return `${pct.toFixed(1)}%`;
  }
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  if (!Number.isInteger(value) && Math.abs(value) < 1) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 1 });
  }
  return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}
