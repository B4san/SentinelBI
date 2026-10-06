import { applyFilter, resolveDataset } from './aggregate';
import { parseLocalDate } from './dates';
import { aggregateNumber, formatMetric } from './format';
import { isDerivedMeasure, looksLikeCountTitle } from './ids';
import { classifyFields, metricFormat, periodChange, prettyField, rankedGroups, sparklineValues } from './insights';
import {
  computeDerivedValue,
  computeWidgetMeasure,
  formatDerived,
  inferAggregation,
  isDegenerateRatio,
  looksLikeDuration,
  proposeDerivedMeasures,
  snapCandidate,
} from './measures';
import { formatDeltaLabel, inferMetricPolarity, isRateMetric } from './metrics';
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

function applySnap(dataset: DashboardDataset | undefined, widget: DashboardWidget): DashboardWidget {
  if (!dataset) return widget;
  const snapped = snapCandidate(widget.title, dataset);
  if (!snapped) return widget;
  if (snapped.measure && (!widget.measure || isDegenerateRatio(widget.measure as DerivedMeasure))) {
    return { ...widget, measure: snapped.measure };
  }
  if (snapped.field && !isDerivedMeasure(widget.measure)) {
    return {
      ...widget,
      yField: widget.yField || snapped.field,
      aggregation: snapped.agg || widget.aggregation,
      kpi: widget.kpi ? { ...widget.kpi, field: widget.kpi.field || snapped.field, aggregation: snapped.agg || widget.kpi.aggregation, format: snapped.format || widget.kpi.format } : widget.kpi,
      measure: widget.measure,
    };
  }
  return widget;
}

export function computeWidgetKpi(
  datasets: DashboardDataset[],
  widget: DashboardWidget,
  extraFilters: WidgetFilter[] = [],
): ComputedKpi {
  const dataset = resolveDataset(datasets, widget.datasetId);
  const snapped = applySnap(dataset, widget);
  const rows = rowsFor(datasets, snapped, extraFilters);
  const field = (isDerivedMeasure(snapped.measure) ? snapped.measure.numerator.field : snapped.measure && 'field' in snapped.measure ? snapped.measure.field : undefined)
    || snapped.kpi?.field
    || snapped.yField;
  const format: MeasureFormat = (isDerivedMeasure(snapped.measure) ? snapped.measure.format : snapped.measure && 'format' in snapped.measure ? snapped.measure.format : undefined)
    || snapped.kpi?.format
    || (looksLikeDuration(field) ? 'duration' : metricFormat(field));
  const polarity = snapped.kpi?.polarity || snapped.polarity || inferMetricPolarity(field || snapped.title);
  const fields = dataset ? classifyFields(dataset) : { measures: [], dimensions: [], time: [] };
  const timeField = fields.time[0];

  if (isDerivedMeasure(snapped.measure) && !isDegenerateRatio(snapped.measure)) {
    const raw = computeDerivedValue(rows, snapped.measure, timeField);
    const change = derivedPeriodChange(rows, timeField, snapped.measure, format);
    const sparkline = derivedSparkline(rows, timeField, snapped.measure);
    const rate = format === 'percent' || isRateMetric(snapped.title, format);
    const delta = change ?? undefined;
    const pretty = delta == null ? undefined : formatDeltaLabel(delta, { rate, polarity });
    return {
      raw,
      value: formatDerived(raw, format),
      delta,
      trend: pretty ? `${pretty.label} vs first half` : undefined,
      sparkline,
      format,
      polarity,
    };
  }

  if (!field) {
    if (looksLikeCountTitle(snapped.title)) {
      return { raw: rows.length, value: formatMetric(rows.length, 'number'), sparkline: [], format: 'number', polarity };
    }
    const fallbackField = dataset
      ? (classifyFields(dataset).measures.find((name) => /rev|ebitda|session|unit/i.test(name)) || classifyFields(dataset).measures[0])
      : undefined;
    if (!fallbackField) {
      return { raw: Number.NaN, value: '—', sparkline: [], format: 'number', polarity };
    }
    return computeWidgetKpi(datasets, { ...snapped, yField: fallbackField, kpi: { ...snapped.kpi, field: fallbackField, value: snapped.kpi?.value || '—' } }, extraFilters);
  }

  const aggregation = snapped.kpi?.aggregation || snapped.aggregation || inferAggregation(field, format);
  const raw = computeWidgetMeasure(rows, snapped.measure, { field, agg: aggregation }, timeField);
  const change = timeField
    ? rateAwareChange(rows, timeField, field, format, snapped.title)
    : null;
  const sparkline = timeField
    ? bucketTimeSeries(rows, timeField, field, aggregation).map((b) => b.value)
    : sparklineValues(rows, field, timeField);
  const rate = format === 'percent' || isRateMetric(snapped.title, format);
  const pretty = change ? formatDeltaLabel(change.deltaPct, { rate, polarity }) : undefined;
  const value = format === 'duration' ? formatDerived(raw, 'duration') : formatMetric(raw, format);
  return {
    raw,
    value,
    delta: change?.deltaPct,
    trend: pretty ? `${pretty.label} vs first half` : undefined,
    sparkline,
    format,
    polarity,
  };
}

function rateAwareChange(
  rows: Record<string, unknown>[],
  timeField: string,
  field: string,
  format: MeasureFormat,
  title?: string,
): { deltaPct: number; first: number; second: number } | null {
  const rate = format === 'percent' || isRateMetric(title, format);
  const agg = inferAggregation(field, format);
  const dated = rows
    .map((row) => ({ t: parseLocalDate(row[timeField])?.getTime() ?? NaN, v: Number(row[field]) }))
    .filter((row) => !Number.isNaN(row.t) && !Number.isNaN(row.v))
    .sort((a, b) => a.t - b.t);
  if (dated.length < 4) return periodChange(rows, timeField, field);
  const mid = Math.floor(dated.length / 2);
  const first = aggregateNumber(dated.slice(0, mid).map((r) => r.v), agg);
  const second = aggregateNumber(dated.slice(mid).map((r) => r.v), agg);
  if (first === 0 && !rate) return null;
  if (rate) {
    const scale = Math.abs(first) <= 1.5 && Math.abs(second) <= 1.5 ? 100 : 1;
    return { first, second, deltaPct: (second - first) * scale };
  }
  return { first, second, deltaPct: ((second - first) / Math.abs(first)) * 100 };
}

function derivedPeriodChange(rows: Record<string, unknown>[], timeField: string | undefined, measure: DerivedMeasure, format: MeasureFormat): number | null {
  if (!timeField) return null;
  const dated = rows
    .map((row) => ({ t: parseLocalDate(row[timeField])?.getTime() ?? NaN, row }))
    .filter((row) => !Number.isNaN(row.t))
    .sort((a, b) => a.t - b.t);
  if (dated.length < 4) return null;
  const mid = Math.floor(dated.length / 2);
  const first = computeDerivedValue(dated.slice(0, mid).map((r) => r.row), measure, timeField);
  const second = computeDerivedValue(dated.slice(mid).map((r) => r.row), measure, timeField);
  const rate = format === 'percent' || measure.format === 'percent';
  if (rate) {
    const scale = Math.abs(first) <= 1.5 && Math.abs(second) <= 1.5 ? 100 : 1;
    return (second - first) * scale;
  }
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
    points.push(computeDerivedValue(dated.slice(i, i + size).map((r) => r.row), measure, timeField));
  }
  return points.slice(-10);
}

export function attachComputedFacts(spec: DashboardSpec, datasets: DashboardDataset[]): DashboardSpec {
  return {
    ...spec,
    widgets: spec.widgets.map((widget) => {
      if (widget.type !== 'kpi') {
        const dataset = resolveDataset(datasets, widget.datasetId);
        return dataset ? applySnap(dataset, widget) : widget;
      }
      const dataset = resolveDataset(datasets, widget.datasetId);
      const next = dataset ? applySnap(dataset, widget) : widget;
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

export function buildFactSentences(datasets: DashboardDataset[], spec: DashboardSpec): string[] {
  const sentences: string[] = [];
  const dataset = datasets[0];
  if (!dataset) return sentences;
  const fields = classifyFields(dataset);
  const measure = fields.measures.find((name) => /rev|session/i.test(name)) || fields.measures[0];
  if (measure && fields.dimensions[0]) {
    const ranked = rankedGroups(dataset.data || [], fields.dimensions[0], measure);
    if (ranked[0]) {
      sentences.push(`${ranked[0].key} leads ${prettyField(fields.dimensions[0]).toLowerCase()} at ${formatMetric(ranked[0].value, metricFormat(measure))}, ${(ranked[0].share * 100).toFixed(0)}% of the total.`);
    }
    if (ranked.length > 1 && ranked[ranked.length - 1].share < ranked[0].share * 0.55) {
      const last = ranked[ranked.length - 1];
      sentences.push(`${last.key} is the smallest ${prettyField(fields.dimensions[0]).toLowerCase()} at ${(last.share * 100).toFixed(0)}% share.`);
    }
  }
  const kpis = spec.widgets.filter((w) => w.type === 'kpi').slice(0, 3);
  for (const kpi of kpis) {
    const stats = computeWidgetKpi(datasets, kpi);
    if (Number.isFinite(stats.raw) && stats.value !== '—') {
      const delta = stats.delta == null ? '' : ` (${formatDeltaLabel(stats.delta, { rate: stats.format === 'percent', polarity: stats.polarity }).label} vs first half)`;
      sentences.push(`${kpi.title} is ${stats.value}${delta}.`);
    }
  }
  return sentences.filter((s) => s.length > 12 && !/\s$/.test(s) && /[.]$/.test(s));
}

function neverMidWord(text: string, max = 220): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max);
  const cut = slice.lastIndexOf(' ');
  return `${(cut > 40 ? slice.slice(0, cut) : slice).replace(/[,\s]+$/, '')}.`;
}

export function rewriteUnverifiedCopy(spec: DashboardSpec, datasets: DashboardDataset[]): DashboardSpec {
  const facts = factStrings(datasets, spec);
  const sentences = buildFactSentences(datasets, spec);
  const clean = (text?: string) => {
    if (!text) return text;
    if (numbersMatchFacts(text, facts)) return neverMidWord(text);
    return undefined;
  };
  const fallbackBody = neverMidWord(sentences.slice(0, 2).join(' ') || (facts[0] ? `${spec.title} is ${facts[0]}.` : 'No verified finding for this slice.'));
  const narrative = spec.narrative
    ? {
        headline: clean(spec.narrative.headline) || spec.title,
        body: clean(spec.narrative.body) || fallbackBody,
      }
    : spec.narrative;
  return {
    ...spec,
    subtitle: clean(spec.subtitle),
    narrative,
    widgets: spec.widgets.map((widget) => {
      if (widget.type !== 'insight') return widget;
      const text = clean(widget.insight?.text);
      const next = text || fallbackBody;
      const title = widget.insight?.title && normalizePhrase(widget.insight.title) !== normalizePhrase(next)
        ? widget.insight.title
        : undefined;
      return { ...widget, insight: { ...widget.insight, text: next, title } };
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
  if (spec.title && subtitle && normalizePhrase(spec.title) === normalizePhrase(subtitle)) {
    next.subtitle = undefined;
  }
  if (insight && headline && insightTitle && normalizePhrase(headline) === normalizePhrase(insightTitle)) {
    next.widgets = spec.widgets.map((w) => (
      w.id === insight.id
        ? { ...w, title: w.insight?.text?.slice(0, 48) || w.title, insight: { ...w.insight, title: undefined, text: w.insight?.text || '' } }
        : w
    ));
  }
  const used = new Set<string>();
  next.widgets = (next.widgets || spec.widgets).map((widget) => {
    if (widget.type === 'section' && spec.title && normalizePhrase(widget.title) === normalizePhrase(spec.title)) {
      return { ...widget, title: widget.subtitle || 'Overview' };
    }
    let title = widget.title;
    const key = normalizePhrase(title);
    if (used.has(key) && widget.type !== 'section') {
      const extra = widget.xField ? ` by ${prettyField(widget.xField)}` : ` (${widget.chartType || widget.type})`;
      title = `${title}${extra}`;
    }
    used.add(normalizePhrase(title));
    return { ...widget, title };
  });
  return next;
}

function normalizePhrase(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export { proposeDerivedMeasures };
