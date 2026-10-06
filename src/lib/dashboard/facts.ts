import { applyFilter, resolveDataset } from './aggregate';
import { parseLocalDate } from './dates';
import { aggregateNumber, formatMetric } from './format';
import { isDerivedMeasure, looksLikeCountTitle } from './ids';
import { classifyFields, metricFormat, periodChange, prettyField, rankedGroups, sparklineValues, analyzeDataset, narrativeFromFindings } from './insights';
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

function shouldForceSnap(title: string): boolean {
  return /\baov\b|average order|gross margin|discount rate|avg(?:erage)? discount|bounce rate|opex vs budget/i.test(title);
}

function applySnap(dataset: DashboardDataset | undefined, widget: DashboardWidget): DashboardWidget {
  if (!dataset) return widget;
  const snapped = snapCandidate(widget.title, dataset);
  if (!snapped) return widget;
  if (snapped.measure && (!widget.measure || (isDerivedMeasure(widget.measure) && isDegenerateRatio(widget.measure)) || shouldForceSnap(widget.title))) {
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
      trend: pretty ? `${pretty.label} ${compareTrendLabel(snapped.compare)}` : undefined,
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
    trend: pretty ? `${pretty.label} ${compareTrendLabel(snapped.compare)}` : undefined,
    sparkline,
    format,
    polarity,
  };
}

function compareTrendLabel(compare?: DashboardWidget['compare']): string {
  if (compare === 'previous-year' || compare === 'prior-year') return 'vs last year';
  if (compare === 'previous-period' || compare === 'prior-period') return 'vs previous period';
  return 'vs first half';
}

function isPlaceholderCopy(text?: string): boolean {
  return /server will replace this with a computed fact/i.test(text || '');
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
const NAMED = /\b(APAC|LATAM|EMEA|North|South|Web|Partner|Direct|Enterprise|SMB|Helios(?:\s+ERP)?|Atlas(?:\s+CRM)?|Nimbus(?:\s+Analytics)?|Orbit(?:\s+Support)?|Cloud|Hardware|Apps|Services|Paid|Organic|Email|Social|Referral|Desktop|Mobile|Tablet)\b/g;

export interface BoardFacts {
  tokens: string[];
  sentences: string[];
  entityRanks: Record<string, { key: string; value: number; share: number; delta?: number }[]>;
  directions: Record<string, number>;
}

export function extractClaimedNumbers(text: string): string[] {
  return (text.match(NUMBERISH) || []).map((n) => n.replace(/,/g, ''));
}

export function extractNamedEntities(text: string): string[] {
  return (text.match(NAMED) || []).map((n) => n.replace(/\s+/g, ' '));
}

export function numbersMatchFacts(text: string, facts: string[]): boolean {
  const claimed = extractClaimedNumbers(text);
  if (claimed.length === 0) return true;
  const normalizedFacts = facts.map(normalizeNumberToken);
  return claimed.every((token) => normalizedFacts.some((fact) => roughlyEqual(normalizeNumberToken(token), fact, /%/.test(token) ? 2 : undefined)));
}

function normalizeNumberToken(token: string): number | null {
  const raw = token.replace(/[$,×%]/g, '').replace(/,/g, '').trim();
  const mult = /m$/i.test(raw) ? 1_000_000 : /k$/i.test(raw) ? 1_000 : /b$/i.test(raw) ? 1_000_000_000 : 1;
  const n = Number(raw.replace(/[kmb]$/i, ''));
  return Number.isFinite(n) ? n * mult : null;
}

function roughlyEqual(a: number | null, b: number | null, absTol?: number): boolean {
  if (a == null || b == null) return false;
  const scale = Math.max(1, Math.abs(b));
  if (absTol != null) {
    const tol = Math.abs(b) >= 8 ? absTol : 0.55;
    return Math.abs(a - b) <= tol;
  }
  return Math.abs(a - b) / scale < 0.15 || Math.abs(a - b) < 0.6;
}

export function factStrings(datasets: DashboardDataset[], spec: DashboardSpec): string[] {
  return collectBoardFacts(datasets, spec).tokens;
}

export function collectBoardFacts(datasets: DashboardDataset[], spec: DashboardSpec): BoardFacts {
  const tokens: string[] = [];
  const entityRanks: BoardFacts['entityRanks'] = {};
  const directions: Record<string, number> = {};
  for (const widget of spec.widgets) {
    if (widget.type === 'kpi') {
      const stats = computeWidgetKpi(datasets, widget);
      tokens.push(stats.value);
      if (stats.delta != null) tokens.push(`${stats.delta.toFixed(1)}%`);
    }
  }
  const dataset = datasets[0];
  if (dataset) {
    const fields = classifyFields(dataset);
    const measure = fields.measures.find((name) => /rev|session/i.test(name)) || fields.measures[0];
    const timeField = fields.time[0];
    for (const dim of fields.dimensions) {
      if (!measure) continue;
      const ranked = rankedGroups(dataset.data || [], dim, measure);
      entityRanks[dim] = ranked;
      if (ranked[0]) tokens.push(`${(ranked[0].share * 100).toFixed(0)}%`);
      if (timeField) {
        const datedAll = (dataset.data || [])
          .map((row) => parseLocalDate(row[timeField])?.getTime() ?? NaN)
          .filter((t) => !Number.isNaN(t))
          .sort((a, b) => a - b);
        const midT = datedAll[Math.floor(datedAll.length / 2)] || 0;
        entityRanks[`${dim}:delta`] = ranked.map((row) => {
          const subset = (dataset.data || []).filter((r) => String(r[dim]) === row.key);
          const first = subset.filter((r) => (parseLocalDate(r[timeField])?.getTime() ?? 0) < midT);
          const second = subset.filter((r) => (parseLocalDate(r[timeField])?.getTime() ?? 0) >= midT);
          const a = first.reduce((acc, r) => acc + Number(r[measure] || 0), 0);
          const b = second.reduce((acc, r) => acc + Number(r[measure] || 0), 0);
          const deltaPct = a === 0 ? null : ((b - a) / Math.abs(a)) * 100;
          if (deltaPct != null) directions[row.key] = deltaPct;
          return { ...row, delta: deltaPct ?? undefined };
        });
      }
    }
    if (measure && timeField) {
      const change = periodChange(dataset.data || [], timeField, measure);
      if (change) {
        tokens.push(`${change.deltaPct.toFixed(1)}%`);
        directions.__overall = change.deltaPct;
      }
    }
    const gmField = fields.measures.find((name) => /gross_margin|gross margin/i.test(name));
    const revenueField = fields.measures.find((name) => /revenue|rev/i.test(name));
    if (gmField && revenueField && timeField) {
      const dated = (dataset.data || [])
        .map((row) => ({ t: parseLocalDate(row[timeField])?.getTime() ?? NaN, row }))
        .filter((row) => !Number.isNaN(row.t))
        .sort((a, b) => a.t - b.t);
      if (dated.length >= 4) {
        const mid = Math.floor(dated.length / 2);
        const first = computeDerivedValue(dated.slice(0, mid).map((r) => r.row), {
          kind: 'weighted',
          numerator: { field: gmField, agg: 'avg' },
          denominator: { field: revenueField, agg: 'sum' },
          format: 'percent',
        });
        const second = computeDerivedValue(dated.slice(mid).map((r) => r.row), {
          kind: 'weighted',
          numerator: { field: gmField, agg: 'avg' },
          denominator: { field: revenueField, agg: 'sum' },
          format: 'percent',
        });
        const scale = Math.abs(first) <= 1.5 && Math.abs(second) <= 1.5 ? 100 : 1;
        directions.__gm = (second - first) * scale;
        tokens.push(`${directions.__gm.toFixed(1)}%`);
        tokens.push(`${(second * (Math.abs(second) <= 1.5 ? 100 : 1)).toFixed(1)}%`);
      }
    }
    if (fields.dimensions.length >= 2 && measure) {
      const combos = comboShare(dataset.data || [], fields.dimensions[0], fields.dimensions[1], measure);
      if (combos.topShare != null) tokens.push(`${(combos.topShare * 100).toFixed(0)}%`);
    }
  }
  return { tokens, sentences: buildFactSentences(datasets, spec), entityRanks, directions };
}

function comboShare(
  rows: Record<string, unknown>[],
  a: string,
  b: string,
  measure: string,
): { topShare: number; count: number } {
  const map = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    const key = `${row[a]}|${row[b]}`;
    const n = Number(row[measure]);
    if (Number.isNaN(n)) continue;
    map.set(key, (map.get(key) || 0) + n);
    total += n;
  }
  const ranked = [...map.values()].sort((x, y) => y - x);
  const top = ranked.slice(0, 10).reduce((acc, n) => acc + n, 0);
  return { topShare: total ? top / total : 0, count: ranked.length };
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
  const cut = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('; '), slice.lastIndexOf(', '), slice.lastIndexOf(' '));
  return `${(cut > 24 ? slice.slice(0, cut) : slice).replace(/[,\s—–-]+$/, '')}.`;
}

function editorialInsightTitle(title: string | undefined, body: string, sentences: string[]): string {
  const candidates = [title, sentences[0], body].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    if (/leads|cooled|accelerated|spread|behind|overspent|rose|fell/i.test(candidate) && candidate.length <= 48) {
      return shortInsightTitle(candidate, 48);
    }
  }
  const generated = body.match(/^(.{2,36}?)\s+generated\s+.+\s+in\s+([^,.]+)/i);
  if (generated) return shortInsightTitle(`${generated[1].trim()} leads ${generated[2].trim()}`, 48);
  return shortInsightTitle((candidates[0] || 'Key finding').split(/[,.—]/)[0], 40);
}

export function shortInsightTitle(text: string, max = 60): string {
  const clean = text.replace(/\s+/g, ' ').trim().replace(/^["']|["']$/g, '');
  const clause = clean.split(/\s+[—–-]\s+|:\s+/)[0] || clean;
  let title = clause.replace(/\.$/, '');
  if (title.length > max) {
    const slice = title.slice(0, max);
    const cut = Math.max(slice.lastIndexOf(', '), slice.lastIndexOf(' '));
    title = (cut > 20 ? slice.slice(0, cut) : slice).trim();
  }
  title = title.replace(/\b(the|a|an|and|of|for|with|to|—|–|-)$/i, '').trim();
  if (!title || /^(the|a|an)$/i.test(title)) title = 'Key finding';
  return title;
}

function claimHolds(text: string, board: BoardFacts): boolean {
  if (!text) return true;
  if (!numbersMatchFacts(text, board.tokens)) return false;
  const lower = text.toLowerCase();
  const entities = extractNamedEntities(text);
  if (/holding steady|flat|unchanged/i.test(lower) && board.directions.__overall != null && Math.abs(board.directions.__overall) > 6) {
    return false;
  }
  if (/compressing margins|margin pressure|margins? (are )?down/i.test(lower)) {
    const gm = Object.entries(board.directions).find(([k]) => /margin/i.test(k));
    if (board.directions.__gm != null && board.directions.__gm > 0.4) return false;
    if (gm && gm[1] > 0.4) return false;
  }
  if (/accelerat/i.test(lower) && entities.length) {
    const risers = Object.entries(board.directions)
      .filter(([key, value]) => key !== '__overall' && key !== '__gm' && (value || 0) > 5)
      .sort((a, b) => (b[1] || 0) - (a[1] || 0))
      .map(([key]) => key.toLowerCase());
    const named = entities.map((e) => e.toLowerCase());
    if (named.some((name) => !risers.some((r) => r.includes(name) || name.includes(r)))) return false;
  }
  for (const entity of entities) {
    const delta = board.directions[entity] ?? board.directions[entity.replace(/\s+/g, ' ')];
    if (delta != null && /accelerat|fastest|riser|grew|growth/i.test(lower) && delta < 0) return false;
  }
  return true;
}

export function rewriteUnverifiedCopy(spec: DashboardSpec, datasets: DashboardDataset[]): DashboardSpec {
  const board = collectBoardFacts(datasets, spec);
  const facts = board.tokens;
  const sentences = board.sentences;
  const clean = (text?: string) => {
    if (!text) return text;
    if (isPlaceholderCopy(text) || !claimHolds(text, board)) return undefined;
    return neverMidWord(text);
  };
  const fallbackBody = neverMidWord(sentences.slice(0, 2).join(' ') || (facts[0] ? `${spec.title} is ${facts[0]}.` : 'No verified finding for this slice.'));
  const rawHeadline = spec.narrative ? clean(spec.narrative.headline) : undefined;
  const headline = rawHeadline && normalizePhrase(rawHeadline) !== normalizePhrase(spec.title) ? rawHeadline : undefined;
  const narrative = spec.narrative
    ? {
        headline,
        body: clean(spec.narrative.body) || fallbackBody,
      }
    : spec.narrative;
  return {
    ...spec,
    subtitle: clean(spec.subtitle),
    narrative,
    widgets: spec.widgets.map((widget) => {
      const title = clean(widget.title) || prettyTitleFromWidget(widget, sentences);
      const subtitle = /compared on /i.test(widget.subtitle || '') ? undefined : clean(widget.subtitle);
      if (widget.type !== 'insight') {
        return { ...widget, title, subtitle };
      }
      const sourceTitle = editorialInsightTitle(widget.insight?.title || widget.title, clean(widget.insight?.text) || fallbackBody, sentences);
      const text = clean(widget.insight?.text) || fallbackBody;
      const extras = sentences.filter((s) => {
        const n = normalizePhrase(s);
        const blob = normalizePhrase(text);
        return Boolean(n) && n !== blob && n !== normalizePhrase(sourceTitle || '') && !blob.includes(n);
      }).slice(0, 2);
      const body = [text, extras[0]].filter((s, i, arr) => s && arr.findIndex((x) => normalizePhrase(x) === normalizePhrase(s)) === i).join(' ');
      const insightTitle = shortInsightTitle(claimHolds(sourceTitle || '', board) ? (sourceTitle || sentences[0] || 'Key finding') : (sentences[0] || 'Key finding'), 48);
      const finalTitle = normalizePhrase(insightTitle) === normalizePhrase(body) || body.toLowerCase().includes(insightTitle.toLowerCase())
        ? undefined
        : insightTitle;
      return {
        ...widget,
        title: finalTitle || insightTitle,
        subtitle: undefined,
        insight: { ...widget.insight, text: neverMidWord(body, 280), title: finalTitle },
      };
    }),
  };
}

function prettyTitleFromWidget(widget: DashboardWidget, sentences: string[]): string {
  if (widget.type === 'section') return widget.title && !claimLooksFalse(widget.title) ? widget.title : 'Overview';
  const safe = sentences.find((s) => s.length < 80) || sentences[0];
  if (safe) return shortInsightTitle(safe, 56);
  return widget.xField ? `${prettyField(widget.yField || 'Value')} by ${prettyField(widget.xField)}` : prettyField(widget.yField || widget.title);
}

function claimLooksFalse(text: string): boolean {
  return /accelerat|compressing margins|holding steady|42%/.test(text);
}

export function dedupeHeadlines(spec: DashboardSpec): DashboardSpec {
  const insight = spec.widgets.find((w) => w.type === 'insight');
  const headline = spec.narrative?.headline?.trim();
  const subtitle = spec.subtitle?.trim();
  const insightTitle = insight?.insight?.title?.trim() || insight?.title?.trim();
  const next = { ...spec };
  if (headline && spec.title && normalizePhrase(headline) === normalizePhrase(spec.title)) {
    next.narrative = spec.narrative ? { ...spec.narrative, headline: undefined } : spec.narrative;
  }
  if (headline && subtitle && normalizePhrase(headline) === normalizePhrase(subtitle)) {
    next.subtitle = undefined;
  }
  if (spec.title && subtitle && normalizePhrase(spec.title) === normalizePhrase(subtitle)) {
    next.subtitle = undefined;
  }
  if (insight && headline && insightTitle && normalizePhrase(headline) === normalizePhrase(insightTitle)) {
    next.widgets = spec.widgets.map((w) => (
      w.id === insight.id
        ? { ...w, title: neverMidWord(w.insight?.text || w.title, 64).replace(/\.$/, ''), insight: { ...w.insight, title: undefined, text: w.insight?.text || '' } }
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

export function applyLiveCopy(
  spec: DashboardSpec,
  datasets: DashboardDataset[],
  filters: WidgetFilter[] = [],
): DashboardSpec {
  if (!filters.length) return dedupeHeadlines(rewriteUnverifiedCopy(spec, datasets));
  const filtered = datasets.map((dataset) => {
    let rows = dataset.data || [];
    for (const filter of filters) rows = applyFilter(rows, filter);
    return { ...dataset, data: rows };
  });
  const findings = filtered[0] && filtered[0].data.length
    ? analyzeDataset(filtered[0])
    : [];
  const story = narrativeFromFindings(findings, spec.intent);
  const withStory: DashboardSpec = {
    ...spec,
    subtitle: story.headline,
    narrative: story,
    widgets: spec.widgets.map((widget) => {
      if (widget.type !== 'insight') return widget;
      const finding = findings[0];
      return {
        ...widget,
        title: finding?.title || 'Key finding',
        insight: {
          title: finding?.title,
          text: finding?.text || story.body,
          tone: finding?.tone || 'neutral',
        },
      };
    }),
  };
  return rewriteUnverifiedCopy(withStory, filtered);
}

export { proposeDerivedMeasures };
