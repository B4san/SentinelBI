import { applyFilter, resolveDataset } from './aggregate';
import { parseLocalDate } from './dates';
import { aggregateNumber, formatMetric } from './format';
import { classifyFields, metricFormat, periodChange, sparklineValues } from './insights';
import { computeDerivedValue, formatDerived, inferAggregation, looksLikeDuration, proposeDerivedMeasures } from './measures';
import { inferMetricPolarity } from './metrics';
import { bucketTimeSeries } from './timeGrain';
import type {
  DashboardDataset,
  DashboardSpec,
  DashboardWidget,
  DerivedMeasure,
  MeasureFormat,
  WidgetFilter,
} from './types';

export interface ComputedKpi {
  raw: number;
  value: string;
  delta?: number;
  trend?: string;
  sparkline: number[];
  format: MeasureFormat;
  polarity: ReturnType<typeof inferMetricPolarity>;
}

function rowsFor(datasets: DashboardDataset[], widget: DashboardWidget, extra: WidgetFilter[] = []): Record<string, unknown>[] {
  const dataset = resolveDataset(datasets, widget.datasetId);
  if (!dataset) return [];
  let rows = dataset.data || [];
  for (const filter of extra) rows = applyFilter(rows, filter);
  return applyFilter(rows, widget.filter);
}

export function computeWidgetKpi(
  datasets: DashboardDataset[],
  widget: DashboardWidget,
  extraFilters: WidgetFilter[] = [],
): ComputedKpi {
  const dataset = resolveDataset(datasets, widget.datasetId);
  const rows = rowsFor(datasets, widget, extraFilters);
  const field = widget.measure?.numerator.field || widget.kpi?.field || widget.yField;
  const format: MeasureFormat = widget.measure?.format
    || widget.kpi?.format
    || (looksLikeDuration(field) ? 'duration' : metricFormat(field));
  const polarity = widget.kpi?.polarity || widget.polarity || inferMetricPolarity(field || widget.title);
  const fields = dataset ? classifyFields(dataset) : { measures: [], dimensions: [], time: [] };
  const timeField = fields.time[0];

  if (widget.measure) {
    const raw = computeDerivedValue(rows, widget.measure);
    const change = derivedPeriodChange(rows, timeField, widget.measure);
    const sparkline = derivedSparkline(rows, timeField, widget.measure);
    return {
      raw,
      value: formatDerived(raw, format),
      delta: change ?? undefined,
      trend: change != null ? `${change >= 0 ? '+' : ''}${change.toFixed(1)}% vs first half` : undefined,
      sparkline,
      format,
      polarity,
    };
  }

  if (!field) {
    return { raw: rows.length, value: formatMetric(rows.length, 'number'), sparkline: [], format: 'number', polarity };
  }

  const aggregation = widget.kpi?.aggregation || widget.aggregation || inferAggregation(field, format);
  const values = rows.map((row) => Number(row[field])).filter((n) => !Number.isNaN(n));
  const raw = aggregateNumber(values, aggregation);
  const change = timeField ? periodChange(rows, timeField, field) : null;
  const sparkline = timeField
    ? bucketTimeSeries(rows, timeField, field, aggregation).map((b) => b.value)
    : sparklineValues(rows, field, timeField);
  const value = format === 'duration' ? formatDerived(raw, 'duration') : formatMetric(raw, format);
  return {
    raw,
    value,
    delta: change?.deltaPct,
    trend: change ? `${change.deltaPct >= 0 ? '+' : ''}${change.deltaPct.toFixed(1)}% vs first half` : undefined,
    sparkline,
    format,
    polarity,
  };
}

function derivedPeriodChange(rows: Record<string, unknown>[], timeField: string | undefined, measure: DerivedMeasure): number | null {
  if (!timeField) return null;
  const dated = rows
    .map((row) => ({ t: parseLocalDate(row[timeField])?.getTime() ?? NaN, row }))
    .filter((row) => !Number.isNaN(row.t))
    .sort((a, b) => a.t - b.t);
  if (dated.length < 4) return null;
  const mid = Math.floor(dated.length / 2);
  const first = computeDerivedValue(dated.slice(0, mid).map((r) => r.row), measure);
  const second = computeDerivedValue(dated.slice(mid).map((r) => r.row), measure);
  if (first === 0) return null;
  return ((second - first) / Math.abs(first)) * 100;
}

function derivedSparkline(rows: Record<string, unknown>[], timeField: string | undefined, measure: DerivedMeasure): number[] {
  if (!timeField) return [];
  const dated = rows
    .map((row) => ({ t: parseLocalDate(row[timeField])?.getTime() ?? NaN, row }))
    .filter((row) => !Number.isNaN(row.t))
    .sort((a, b) => a.t - b.t);
  const size = Math.max(1, Math.floor(dated.length / 8));
  const points: number[] = [];
  for (let i = 0; i < dated.length; i += size) {
    points.push(computeDerivedValue(dated.slice(i, i + size).map((r) => r.row), measure));
  }
  return points.slice(-10);
}

export function attachComputedFacts(spec: DashboardSpec, datasets: DashboardDataset[]): DashboardSpec {
  const proposed = datasets[0] ? proposeDerivedMeasures(datasets[0]) : [];
  return {
    ...spec,
    widgets: spec.widgets.map((widget) => {
      if (widget.type !== 'kpi') return widget;
      const titled = proposed.find((p) => p.title.toLowerCase() === widget.title.toLowerCase());
      const next = titled && !widget.measure ? { ...widget, measure: titled.measure } : widget;
      const stats = computeWidgetKpi(datasets, next);
      return {
        ...next,
        polarity: stats.polarity,
        kpi: {
          ...next.kpi,
          value: stats.value,
          trend: stats.trend,
          delta: stats.delta,
          sparkline: stats.sparkline,
          format: stats.format,
          polarity: stats.polarity,
          field: next.kpi?.field || next.yField,
        },
      };
    }),
  };
}

const NUMBERISH = /[-+]?\d[\d,]*(?:\.\d+)?%?|\$[\d,.]+[KMB]?|\d+(?:\.\d+)?×/g;

export function extractClaimedNumbers(text: string): string[] {
  return (text.match(NUMBERISH) || []).map((n) => n.replace(/,/g, ''));
}

export function numbersMatchFacts(text: string, facts: string[]): boolean {
  const claimed = extractClaimedNumbers(text);
  if (claimed.length === 0) return true;
  const normalizedFacts = facts.map(normalizeNumberToken);
  return claimed.every((token) => normalizedFacts.some((fact) => roughlyEqual(normalizeNumberToken(token), fact)));
}

function normalizeNumberToken(token: string): number | null {
  const raw = token.replace(/[$,×%]/g, '').replace(/,/g, '').trim();
  const mult = /m$/i.test(raw) ? 1_000_000 : /k$/i.test(raw) ? 1_000 : /b$/i.test(raw) ? 1_000_000_000 : 1;
  const n = Number(raw.replace(/[kmb]$/i, ''));
  return Number.isFinite(n) ? n * mult : null;
}

function roughlyEqual(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return false;
  const scale = Math.max(1, Math.abs(b));
  return Math.abs(a - b) / scale < 0.15 || Math.abs(a - b) < 0.6;
}

export function factStrings(datasets: DashboardDataset[], spec: DashboardSpec): string[] {
  const facts: string[] = [];
  for (const widget of spec.widgets) {
    if (widget.type === 'kpi') {
      const stats = computeWidgetKpi(datasets, widget);
      facts.push(stats.value);
      if (stats.delta != null) facts.push(`${stats.delta.toFixed(1)}%`);
    }
  }
  return facts;
}

export function rewriteUnverifiedCopy(spec: DashboardSpec, datasets: DashboardDataset[]): DashboardSpec {
  const facts = factStrings(datasets, spec);
  const clean = (text?: string) => {
    if (!text) return text;
    if (numbersMatchFacts(text, facts)) return text;
    return undefined;
  };
  const narrative = spec.narrative
    ? {
        headline: clean(spec.narrative.headline) || spec.title,
        body: clean(spec.narrative.body) || '',
      }
    : spec.narrative;
  return {
    ...spec,
    subtitle: clean(spec.subtitle),
    narrative,
    widgets: spec.widgets.map((widget) => {
      if (widget.type !== 'insight') return widget;
      const text = clean(widget.insight?.text);
      if (!text) {
        return { ...widget, insight: { ...widget.insight, text: facts[0] ? `Computed from the loaded rows: ${facts.slice(0, 2).join(', ')}.` : 'No verified finding for this slice.', title: widget.insight?.title } };
      }
      return { ...widget, insight: { ...widget.insight, text } };
    }),
  };
}

export function dedupeHeadlines(spec: DashboardSpec): DashboardSpec {
  const insight = spec.widgets.find((w) => w.type === 'insight');
  const headline = spec.narrative?.headline?.trim();
  const subtitle = spec.subtitle?.trim();
  const insightTitle = insight?.insight?.title?.trim() || insight?.title?.trim();
  const next = { ...spec };
  if (headline && subtitle && normalizePhrase(headline) === normalizePhrase(subtitle)) {
    next.subtitle = undefined;
  }
  if (insight && headline && insightTitle && normalizePhrase(headline) === normalizePhrase(insightTitle)) {
    next.widgets = spec.widgets.map((w) => (
      w.id === insight.id
        ? { ...w, title: w.insight?.text?.slice(0, 48) || w.title, insight: { ...w.insight, title: undefined, text: w.insight?.text || '' } }
        : w
    ));
  }
  return next;
}

function normalizePhrase(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
