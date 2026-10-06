import { METRIC_POLARITIES, type Aggregation, type DashboardWidget, type MetricPolarity } from './types';

export { METRIC_POLARITIES };
export type { MetricPolarity };

const LOWER_IS_BETTER = /\b(bounce|churn|attrition|cac|cpc|cpa|cpm|cogs|latency|error|errors|refund|refunds|complaint|complaints|downtime|cancel|cancellation|cancellations|abandon|abandonment|defect|defects|fail|failure|failures|loss|losses|idle|wait|waiting|spend|expense|expenses|cost|costs|waste|delay|delays|overdue|reject|rejection|drop|drops|friction|unpaid|debt|default|defaults|sla|incident|incidents|discount|dso|opex)\b/i;

const HIGHER_OVERRIDE = /\b(roi|return on|revenue|revenues|profit|profits|margin|conversion|conversions|session|sessions)\b/i;

const FILLER_TITLE = /^(rows loaded|row count|records( loaded)?|active cohorts|number of [\w\s]+|count of [\w\s]+|[\w\s]+ count)$/i;
const FILLER_CARDINALITY = /^(channels?|devices?|regions?|products?|categories|cohorts|landings?|queues?|departments?|locations?|agents?|priorities)$/i;

export function inferMetricPolarity(name?: string | null): MetricPolarity {
  if (!name) return 'higher-is-better';
  const normalized = name.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (HIGHER_OVERRIDE.test(normalized) && !/\b(cost|cac|cpc|cpa|spend)\b/.test(normalized)) {
    return 'higher-is-better';
  }
  if (LOWER_IS_BETTER.test(normalized)) return 'lower-is-better';
  return 'higher-is-better';
}

export function isFillerMetricName(name?: string | null): boolean {
  if (!name) return false;
  const normalized = name.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (FILLER_TITLE.test(normalized) || FILLER_CARDINALITY.test(normalized)) return true;
  if (/^(row|rows|record|records|count)$/.test(normalized)) return true;
  return false;
}

export function isFillerKpi(widget: Pick<DashboardWidget, 'title' | 'yField' | 'aggregation' | 'kpi'>): boolean {
  const title = widget.title || widget.kpi?.value || '';
  const field = widget.kpi?.field || widget.yField;
  if (isFillerMetricName(title) || isFillerMetricName(field)) return true;
  const aggregation: Aggregation | undefined = widget.kpi?.aggregation || widget.aggregation;
  if ((aggregation === 'count' || !field) && isFillerMetricName(title)) return true;
  if (aggregation === 'count' && !field) return true;
  return false;
}

export function isDeltaFavorable(delta: number, polarity: MetricPolarity = 'higher-is-better'): boolean {
  if (delta === 0) return true;
  return polarity === 'lower-is-better' ? delta < 0 : delta > 0;
}

export function deltaColor(delta: number, polarity: MetricPolarity = 'higher-is-better'): string {
  if (delta === 0) return '#64748b';
  return isDeltaFavorable(delta, polarity) ? '#059669' : '#e11d48';
}

export function isRateMetric(name?: string, format?: string): boolean {
  if (format === 'percent') return true;
  return /margin|discount|cvr|conversion rate|bounce|attrition|accept/i.test(name || '');
}

export function isNoisyDelta(delta: number, rate = false): boolean {
  return Math.abs(delta) < (rate ? 0.08 : 0.15);
}

export function formatDeltaLabel(delta: number, opts: { rate?: boolean; polarity?: MetricPolarity } = {}): {
  label: string;
  color: string;
  flat: boolean;
} {
  const polarity = opts.polarity || 'higher-is-better';
  if (isNoisyDelta(delta, opts.rate)) {
    return { label: 'flat', color: '#64748b', flat: true };
  }
  const label = opts.rate
    ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pp`
    : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
  return { label, color: deltaColor(delta, polarity), flat: false };
}

export function sanitizePolarity(value: unknown, field?: string, title?: string): MetricPolarity {
  if (value === 'lower-is-better' || value === 'higher-is-better') return value;
  return inferMetricPolarity(field || title);
}
