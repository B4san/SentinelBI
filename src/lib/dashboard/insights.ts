import { formatLocalDate, parseLocalDate } from './dates';
import { aggregateNumber, formatMetric } from './format';
import type { Aggregation, DashboardDataset, MeasureFormat } from './types';

export interface Finding {
  title: string;
  text: string;
  tone: 'positive' | 'warning' | 'neutral';
  kind: 'top' | 'bottom' | 'trend' | 'outlier' | 'share' | 'quality' | 'correlation';
}

export interface FieldClasses {
  measures: string[];
  dimensions: string[];
  time: string[];
}

const TIME_NAME = /(_date|_at|_time)$|^(date|time|day|week|month|year|opened|closed|period|timestamp|created|updated)/i;
const MONEY_NAME = /rev|sales|amount|price|gmv|arr|mrr|acv|spend|cost|payroll|opex|ebitda|budget|cogs/i;
const RATE_NAME = /(rate|margin|csat|nps|pct|percent|bounce|attrition|acceptRate)$/i;

const FIELD_LABELS: Record<string, string> = {
  ebitda: 'EBITDA',
  cogs: 'COGS',
  aov: 'AOV',
  roas: 'ROAS',
  cvr: 'CVR',
  dso: 'DSO',
  dso_days: 'DSO',
  avg_session_seconds: 'Avg session duration',
  bounce_rate: 'Bounce rate',
  discount_rate: 'Discount rate',
  gross_margin: 'Gross margin',
  budget_opex: 'Budget opex',
  ad_spend: 'Ad spend',
  business_unit: 'Business unit',
  cost_center: 'Cost center',
};

export function prettyField(name: string): string {
  const raw = String(name || '');
  const key = raw.toLowerCase().replace(/\s+/g, '_');
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\bebitda\b/ig, 'EBITDA')
    .replace(/\bcogs\b/ig, 'COGS')
    .replace(/\bdso\b/ig, 'DSO')
    .replace(/\bavg session seconds\b/ig, 'Avg session duration')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bEbitda\b/g, 'EBITDA')
    .replace(/\bCogs\b/g, 'COGS');
}

export function prettyValue(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Unknown';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return formatLocalDate(raw);
  return raw;
}

export function metricFormat(field?: string): MeasureFormat {
  if (!field) return 'number';
  if (/duration|seconds|_sec/i.test(field)) return 'duration';
  if (MONEY_NAME.test(field)) return 'currency';
  if (RATE_NAME.test(field)) return 'percent';
  return 'number';
}

export function looksLikeTime(name: string, values: unknown[] = [], type?: string): boolean {
  if (type === 'numeric' || type === 'number') return false;
  if (type === 'date') return true;
  if (TIME_NAME.test(name)) return true;
  const sample = values.slice(0, 12).filter((v) => v != null && v !== '');
  if (sample.length < 3) return false;
  const numeric = sample.filter((v) => typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(String(v)));
  if (numeric.length / sample.length >= 0.8) return false;
  const parsed = sample.filter((v) => {
    const raw = String(v);
    if (/^-?\d+(\.\d+)?$/.test(raw)) return false;
    return !Number.isNaN(Date.parse(raw));
  });
  return parsed.length / sample.length >= 0.7;
}

export function classifyFields(dataset: DashboardDataset): FieldClasses {
  const rows = dataset.data || [];
  const names = dataset.columns?.map((c) => c.name) || (rows[0] ? Object.keys(rows[0]) : []);
  const measures: string[] = [];
  const dimensions: string[] = [];
  const time: string[] = [];

  for (const name of names) {
    const values = rows.map((row) => row[name]);
    const colType = dataset.columns?.find((c) => c.name === name)?.type;
    if (looksLikeTime(name, values, colType)) {
      time.push(name);
      continue;
    }
    const numeric = values.filter((v) => v !== '' && v != null && !Number.isNaN(Number(v)));
    if (values.length > 0 && numeric.length / values.length >= 0.8) {
      measures.push(name);
      continue;
    }
    const unique = new Set(values.map((v) => String(v ?? ''))).size;
    if (unique > 1 && unique < Math.max(3, rows.length * 0.7)) {
      dimensions.push(name);
    }
  }

  return { measures, dimensions, time };
}

export function rankedGroups(
  rows: Record<string, unknown>[],
  dimension: string,
  measure: string,
  aggregation: Aggregation = 'sum',
): Array<{ key: string; value: number; share: number }> {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const key = String(row[dimension] ?? '').trim();
    if (!key) continue;
    const n = Number(row[measure]);
    if (Number.isNaN(n)) continue;
    const bucket = groups.get(key) || [];
    bucket.push(n);
    groups.set(key, bucket);
  }
  const ranked = Array.from(groups.entries()).map(([key, values]) => ({
    key,
    value: aggregateNumber(values, aggregation),
  }));
  const total = ranked.reduce((acc, row) => acc + row.value, 0) || 1;
  return ranked
    .map((row) => ({ ...row, share: row.value / total }))
    .sort((a, b) => b.value - a.value);
}

/** True when a categorical cut has too few members or near-equal values (e.g. 3 flat cost-center bars). */
export function isLowInformationCut(
  rows: Record<string, unknown>[],
  dimension?: string,
  measure?: string,
): boolean {
  if (!dimension || !measure || /date|month|week|time/i.test(dimension)) return false;
  const ranked = rankedGroups(rows, dimension, measure);
  if (ranked.length <= 1) return true;
  if (ranked.length > 6) return false;
  const max = Math.max(...ranked.map((row) => row.value));
  const min = Math.min(...ranked.map((row) => row.value));
  if (max <= 0) return true;
  const spread = (max - min) / max;
  if (ranked.length <= 4 && spread < 0.12) return true;
  const shares = ranked.map((row) => row.share);
  const equalThirds = ranked.length === 3 && shares.every((s) => Math.abs(s - 1 / 3) < 0.04);
  return equalThirds;
}

export function periodChange(
  rows: Record<string, unknown>[],
  timeField: string,
  measure: string,
): { deltaPct: number; first: number; second: number } | null {
  const dated = rows
    .map((row) => ({ t: parseLocalDate(row[timeField])?.getTime() ?? NaN, v: Number(row[measure]) }))
    .filter((row) => !Number.isNaN(row.t) && !Number.isNaN(row.v))
    .sort((a, b) => a.t - b.t);
  if (dated.length < 4) return null;
  const mid = Math.floor(dated.length / 2);
  const first = dated.slice(0, mid).reduce((acc, row) => acc + row.v, 0);
  const second = dated.slice(mid).reduce((acc, row) => acc + row.v, 0);
  if (first === 0) return null;
  return { first, second, deltaPct: ((second - first) / Math.abs(first)) * 100 };
}

export function sparklineValues(
  rows: Record<string, unknown>[],
  measure: string,
  timeField?: string,
  points = 8,
): number[] {
  if (!rows.length) return [];
  if (timeField) {
    const dated = rows
      .map((row) => ({ t: parseLocalDate(row[timeField])?.getTime() ?? NaN, v: Number(row[measure]) }))
      .filter((row) => !Number.isNaN(row.t) && !Number.isNaN(row.v))
      .sort((a, b) => a.t - b.t);
    if (dated.length >= 3) return dated.slice(-points).map((row) => row.v);
  }
  return rows
    .map((row) => Number(row[measure]))
    .filter((n) => !Number.isNaN(n))
    .slice(-points);
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 5) return null;
  const ax = xs.slice(0, n);
  const ay = ys.slice(0, n);
  const mx = ax.reduce((a, b) => a + b, 0) / n;
  const my = ay.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const x = ax[i] - mx;
    const y = ay[i] - my;
    num += x * y;
    dx += x * x;
    dy += y * y;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

export function analyzeDataset(dataset: DashboardDataset): Finding[] {
  const rows = dataset.data || [];
  if (rows.length === 0) {
    return [{ title: 'No rows', text: 'This workspace has no rows to analyze yet.', tone: 'warning', kind: 'quality' }];
  }

  const fields = classifyFields(dataset);
  const findings: Finding[] = [];
  const measure = fields.measures.find((name) => /rev|session|ebitda/i.test(name)) || fields.measures[0];
  const format = metricFormat(measure);

  if (measure && fields.dimensions[0]) {
    const ranked = rankedGroups(rows, fields.dimensions[0], measure);
    if (ranked.length >= 2) {
      const top = ranked[0];
      const bottom = ranked[ranked.length - 1];
      const dim = prettyField(fields.dimensions[0]).toLowerCase();
      const metric = prettyField(measure).toLowerCase();
      findings.push({
        kind: 'top',
        tone: 'positive',
        title: `${prettyValue(top.key)} leads ${metric}`,
        text: `${prettyValue(top.key)} generated ${formatMetric(top.value, format)} in ${metric}, ${(top.share * 100).toFixed(0)}% of the total.`,
      });
      if (bottom.value < top.value * 0.55) {
        findings.push({
          kind: 'bottom',
          tone: 'warning',
          title: `${prettyValue(bottom.key)} is behind`,
          text: `${prettyValue(bottom.key)} contributed ${formatMetric(bottom.value, format)} (${(bottom.share * 100).toFixed(0)}% of ${metric}), well below ${prettyValue(top.key)}.`,
        });
      }
    }
  }

  if (measure && fields.dimensions[1]) {
    const ranked = rankedGroups(rows, fields.dimensions[1], measure);
    if (ranked[0]) {
      findings.push({
        kind: 'share',
        tone: 'neutral',
        title: `${prettyField(fields.dimensions[1])} mix`,
        text: `${prettyValue(ranked[0].key)} is the largest ${prettyField(fields.dimensions[1]).toLowerCase()} at ${formatMetric(ranked[0].value, format)} (${(ranked[0].share * 100).toFixed(0)}% share).`,
      });
    }
  }

  if (measure && fields.time[0]) {
    const change = periodChange(rows, fields.time[0], measure);
    if (change) {
      const up = change.deltaPct >= 0;
      const trend: Finding = {
        kind: 'trend',
        tone: up ? 'positive' : 'warning',
        title: up ? `${prettyField(measure)} accelerated` : `${prettyField(measure)} cooled`,
        text: `${prettyField(measure)} ${up ? 'rose' : 'fell'} ${Math.abs(change.deltaPct).toFixed(0)}% in the second half of the window versus the first (${formatMetric(change.first, format)} → ${formatMetric(change.second, format)}).`,
      };
      if (Math.abs(change.deltaPct) >= 8) findings.unshift(trend);
      else findings.push(trend);
    }
  }

  if (fields.measures[1]) {
    const values = rows.map((row) => Number(row[fields.measures[1]])).filter((n) => !Number.isNaN(n));
    if (values.length >= 4) {
      const avg = aggregateNumber(values, 'avg');
      const min = Math.min(...values);
      const max = Math.max(...values);
      const fmt = metricFormat(fields.measures[1]);
      if (max > avg * 1.4) {
        findings.push({
          kind: 'outlier',
          tone: 'neutral',
          title: `${prettyField(fields.measures[1])} spread`,
          text: `${prettyField(fields.measures[1])} ranges from ${formatMetric(min, fmt)} to ${formatMetric(max, fmt)}, with an average of ${formatMetric(avg, fmt)}.`,
        });
      }
    }
  }

  if (fields.measures[0] && fields.measures[1]) {
    const paired = rows
      .map((row) => [Number(row[fields.measures[0]]), Number(row[fields.measures[1]])] as const)
      .filter(([a, b]) => !Number.isNaN(a) && !Number.isNaN(b));
    const r = pearson(paired.map((p) => p[0]), paired.map((p) => p[1]));
    if (r != null && Math.abs(r) >= 0.45) {
      const direction = r > 0 ? 'move together' : 'move in opposite directions';
      findings.push({
        kind: 'correlation',
        tone: 'neutral',
        title: `${prettyField(fields.measures[0])} and ${prettyField(fields.measures[1])}`,
        text: `${prettyField(fields.measures[0])} and ${prettyField(fields.measures[1])} ${direction} (r = ${r.toFixed(2)}).`,
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      kind: 'quality',
      tone: 'neutral',
      title: 'Dataset ready',
      text: `${rows.length.toLocaleString()} rows are loaded. Add a categorical field or a date column to unlock cohort and trend findings.`,
    });
  }

  return findings.slice(0, 5);
}

export function narrativeFromFindings(findings: Finding[], intent?: string): { headline: string; body: string } {
  const lead = findings[0];
  return {
    headline: lead?.title || intent || 'Operating picture',
    body: findings.slice(0, 3).map((f) => f.text).join(' '),
  };
}
