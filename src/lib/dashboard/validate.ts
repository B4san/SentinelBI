import { getPalette, FONT_FAMILIES, RADIUS_TOKENS, pickPaletteForMode } from './palettes';
import { sanitizePolarity } from './metrics';
import {
  AGGREGATIONS,
  CHART_TYPES,
  DASHBOARD_SPEC_VERSION,
  FILTER_OPS,
  LAYOUT_ARCHETYPES,
  MEASURE_FORMATS,
  WIDGET_TYPES,
  type Aggregation,
  type ChartType,
  type DashboardSpec,
  type DashboardWidget,
  type DerivedMeasure,
  type FilterOp,
  type GridPosition,
  type LayoutArchetype,
  type LegacyDashboardLayout,
  type MeasureFormat,
  type Palette,
  type TableQuery,
  type WidgetMeasure,
  type WidgetSeries,
  type WidgetType,
} from './types';
import { isDerivedMeasure, looksLikeCountTitle } from './ids';
import { isDegenerateRatio } from './measures';

const FONT_SET = new Set<string>(FONT_FAMILIES);
const RADIUS_SET = new Set<string>(RADIUS_TOKENS);
const ARCHETYPE_SET = new Set<string>(LAYOUT_ARCHETYPES);
const CHART_SET = new Set<string>(CHART_TYPES);
const WIDGET_SET = new Set<string>(WIDGET_TYPES);
const FILTER_SET = new Set<string>(FILTER_OPS);
const AGG_SET = new Set<string>(AGGREGATIONS);

function asString(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  return String(value);
}

function asNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function isHexColor(value: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value);
}

export function sanitizeGrid(raw: unknown, fallback: GridPosition): GridPosition {
  const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const w = clamp(Math.round(asNumber(rec.w, fallback.w)), 2, 12);
  const h = clamp(Math.round(asNumber(rec.h, fallback.h)), 2, 16);
  const x = clamp(Math.round(asNumber(rec.x, fallback.x)), 0, 12 - w);
  const y = clamp(Math.round(asNumber(rec.y, fallback.y)), 0, 80);
  return { x, y, w, h };
}

export function sanitizePalette(raw: unknown, fallbackId?: string): Palette {
  const base = getPalette(fallbackId);
  if (!raw || typeof raw !== 'object') return base;
  const rec = raw as Record<string, unknown>;
  const chart = Array.isArray(rec.chart)
    ? rec.chart.filter((c): c is string => typeof c === 'string' && isHexColor(c))
    : [];
  return {
    id: asString(rec.id, base.id),
    label: asString(rec.label, base.label),
    mode: rec.mode === 'dark' ? 'dark' : 'light',
    background: asString(rec.background) === 'transparent' || isHexColor(asString(rec.background))
      ? asString(rec.background)
      : base.background,
    surface: isHexColor(asString(rec.surface)) ? asString(rec.surface) : base.surface,
    text: isHexColor(asString(rec.text)) ? asString(rec.text) : base.text,
    muted: isHexColor(asString(rec.muted)) ? asString(rec.muted) : base.muted,
    accent: isHexColor(asString(rec.accent)) ? asString(rec.accent) : base.accent,
    accentSoft: isHexColor(asString(rec.accentSoft)) ? asString(rec.accentSoft) : base.accentSoft,
    border: isHexColor(asString(rec.border)) ? asString(rec.border) : base.border,
    chart: chart.length >= 3 ? chart.slice(0, 8) : base.chart,
  };
}

function sanitizeFilter(raw: unknown): DashboardWidget['filter'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const rec = raw as Record<string, unknown>;
  const field = asString(rec.field || rec.filterField);
  const value = asString(rec.value || rec.filterValue);
  const op = asString(rec.op || rec.filterOp, 'contains');
  if (!field || !value) return undefined;
  return {
    field,
    op: (FILTER_SET.has(op) ? op : 'contains') as FilterOp,
    value,
  };
}

const MEASURE_HINT = /rev|sales|amount|units|session|conversion|spend|cost|bounce|margin|opex|ebitda|headcount|cogs|discount/i;
const DIM_HINT = /region|channel|device|product|segment|unit|center|dept|queue|landing|category|name/i;

export function shouldSwapAxes(xField?: string, yField?: string, chartType?: ChartType): boolean {
  if (!xField || !yField) return false;
  if (chartType === 'scatter' || chartType === 'bubble') return false;
  return MEASURE_HINT.test(xField) && DIM_HINT.test(yField) && !MEASURE_HINT.test(yField);
}

function sanitizeAgg(value: unknown, fallback: Aggregation = 'sum'): Aggregation {
  const raw = asString(value);
  return AGG_SET.has(raw) ? raw as Aggregation : fallback;
}

export function sanitizeMeasure(raw: unknown): WidgetMeasure | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const rec = raw as Record<string, unknown>;
  const kind = asString(rec.kind);
  if (kind === 'ratio' || kind === 'difference' || kind === 'margin' || kind === 'weighted') {
    const num = rec.numerator && typeof rec.numerator === 'object' ? rec.numerator as Record<string, unknown> : null;
    const den = rec.denominator && typeof rec.denominator === 'object' ? rec.denominator as Record<string, unknown> : null;
    if (!num || !den || !asString(num.field) || !asString(den.field)) return undefined;
    const measure: DerivedMeasure = {
      kind,
      numerator: { field: asString(num.field), agg: sanitizeAgg(num.agg) },
      denominator: { field: asString(den.field), agg: sanitizeAgg(den.agg) },
      format: MEASURE_FORMATS.includes(asString(rec.format) as MeasureFormat) ? asString(rec.format) as MeasureFormat : undefined,
    };
    if (isDegenerateRatio(measure)) return undefined;
    return measure;
  }
  const field = asString(rec.field);
  if (!field) return undefined;
  return {
    kind: 'simple',
    field,
    agg: sanitizeAgg(rec.agg || rec.aggregation),
    format: MEASURE_FORMATS.includes(asString(rec.format) as MeasureFormat) ? asString(rec.format) as MeasureFormat : undefined,
  };
}

function sanitizeSeries(raw: unknown): WidgetSeries[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const series = raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      field: asString(item.field),
      label: asString(item.label) || undefined,
      style: (['line', 'bar', 'area', 'dashed', 'target'] as const).includes(asString(item.style) as 'line')
        ? asString(item.style) as WidgetSeries['style']
        : undefined,
      color: isHexColor(asString(item.color)) ? asString(item.color) : undefined,
      axis: (asString(item.axis) === 'right' ? 'right' : asString(item.axis) === 'left' ? 'left' : undefined) as WidgetSeries['axis'],
    }))
    .filter((item) => item.field);
  return series.length ? series : undefined;
}

function sanitizeTable(raw: unknown, title: string): TableQuery | undefined {
  const rec = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const sortField = asString((rec.sort as { field?: string } | undefined)?.field || rec.sortField);
  const top = title.match(/top\s+(\d+)/i);
  const by = title.match(/by\s+([a-z0-9_ ]+)/i);
  const limit = Number(rec.limit) || (top ? Number(top[1]) : undefined);
  const field = sortField || (by ? by[1].trim().replace(/\s+/g, '_') : '');
  const inferredGroup = inferGroupByFromTitle(title);
  const groupBy = Array.isArray(rec.groupBy) && rec.groupBy.length
    ? rec.groupBy.map((c) => String(c))
    : inferredGroup;
  const measures = Array.isArray(rec.measures)
    ? rec.measures
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        field: asString(item.field),
        agg: AGG_SET.has(asString(item.agg)) ? asString(item.agg) as Aggregation : 'sum' as const,
        format: MEASURE_FORMATS.includes(asString(item.format) as MeasureFormat) ? asString(item.format) as MeasureFormat : undefined,
      }))
      .filter((item) => item.field)
    : undefined;
  const inferredMeasure = title.match(/by\s+(revenue|sales|sessions|conversions|opex|ebitda|units)/i);
  const nextMeasures = measures && measures.length
    ? measures
    : inferredMeasure
      ? [{ field: inferredMeasure[1].toLowerCase(), agg: 'sum' as const }]
      : undefined;
  if (!field && !limit && !groupBy && !nextMeasures) return undefined;
  return {
    sort: field ? { field, dir: asString((rec.sort as { dir?: string } | undefined)?.dir) === 'asc' ? 'asc' : 'desc' } : undefined,
    limit,
    groupBy,
    measures: nextMeasures,
  };
}

function inferGroupByFromTitle(title: string): string[] | undefined {
  const cross = title.match(/([A-Za-z][A-Za-z0-9_ ]+)\s*[×x]\s*([A-Za-z][A-Za-z0-9_ ]+)/i);
  if (cross) {
    return [slugField(cross[1]), slugField(cross[2])].filter(Boolean);
  }
  const by = title.match(/\bby\s+([a-z0-9_ /&×x]+)/i);
  if (by && !/revenue|sales|amount|session|conversion|opex|ebitda|unit/i.test(by[1])) {
    return by[1].split(/[/,&]| and /i).map(slugField).filter(Boolean);
  }
  return undefined;
}

function slugField(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function defaultLayoutFor(type: WidgetType, index: number): GridPosition {
  if (type === 'kpi') return { x: (index % 4) * 3, y: Math.floor(index / 4) * 3, w: 3, h: 3 };
  if (type === 'insight' || type === 'section') return { x: 0, y: index * 3, w: 12, h: 3 };
  if (type === 'table') return { x: 0, y: index * 6, w: 12, h: 6 };
  return { x: (index % 2) * 6, y: Math.floor(index / 2) * 6 + 3, w: 6, h: 6 };
}

export function sanitizeWidget(raw: unknown, index: number, palette: Palette): DashboardWidget {
  const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const type = (WIDGET_SET.has(asString(rec.type)) ? asString(rec.type) : inferWidgetType(rec)) as WidgetType;
  const chartTypeRaw = asString(rec.chartType || rec.type);
  const chartType = CHART_SET.has(chartTypeRaw) ? (chartTypeRaw as ChartType) : type === 'chart' ? 'bar' : undefined;
  const aggregation = AGG_SET.has(asString(rec.aggregation)) ? (asString(rec.aggregation) as Aggregation) : 'sum';
  const title = asString(rec.title || rec.label, type === 'kpi' ? `Metric ${index + 1}` : `Widget ${index + 1}`);
  let xField = asString(rec.xField || rec.xAxisField) || undefined;
  let yField = asString(rec.yField || rec.yAxisField) || undefined;
  if (shouldSwapAxes(xField, yField, chartType)) {
    const tmp = xField;
    xField = yField;
    yField = tmp;
  }
  const kpiRec = rec.kpi && typeof rec.kpi === 'object' ? (rec.kpi as Record<string, unknown>) : undefined;
  const polarity = sanitizePolarity(rec.polarity || kpiRec?.polarity, asString(kpiRec?.field) || yField, title);
  let measure = sanitizeMeasure(rec.measure);
  if (measure && !isDerivedMeasure(measure)) {
    yField = yField || measure.field;
    if (measure.agg) rec.aggregation = measure.agg;
  }
  if (isDerivedMeasure(measure) && isDegenerateRatio(measure)) measure = undefined;
  const aggregationNext = measure && !isDerivedMeasure(measure) && measure.agg
    ? measure.agg
    : aggregation;
  if (type === 'kpi' && (aggregationNext === 'count' || !yField && !measure && !kpiRec?.field) && !looksLikeCountTitle(title)) {
    const hinted = title.match(/\b(revenue|ebitda|opex|units|sessions|conversions|headcount|dso)\b/i);
    if (hinted) yField = yField || hinted[1].toLowerCase();
  }
  const series = sanitizeSeries(rec.series);
  const table = sanitizeTable(rec.table, title);
  const compareRaw = asString(rec.compare);
  const compare = compareRaw === 'previous-year' || compareRaw === 'prior-year'
    ? 'previous-year' as const
    : compareRaw === 'previous-period' || compareRaw === 'prior-period'
      ? 'previous-period' as const
      : undefined;

  return {
    id: asString(rec.id, `w-${index + 1}`),
    type,
    title,
    subtitle: asString(rec.subtitle) || undefined,
    sectionId: asString(rec.sectionId) || undefined,
    layout: sanitizeGrid(rec.layout, defaultLayoutFor(type, index)),
    chartType,
    datasetId: asString(rec.datasetId) || undefined,
    xField,
    yField,
    componentId: asString(rec.componentId) || undefined,
    measure,
    series,
    table,
    targetField: asString(rec.targetField) || undefined,
    compare,
    polarity,
    groupField: asString(rec.groupField) || undefined,
    sizeField: asString(rec.sizeField) || undefined,
    role: (['hero', 'support', 'compare-a', 'compare-b', 'strip', 'featured'] as const).includes(
      asString(rec.role) as 'hero',
    )
      ? (asString(rec.role) as DashboardWidget['role'])
      : undefined,
    color: isHexColor(asString(rec.color)) ? asString(rec.color) : palette.chart[index % palette.chart.length],
    colors: Array.isArray(rec.colors) ? rec.colors.filter((c): c is string => typeof c === 'string' && isHexColor(c)) : undefined,
    aggregation: aggregationNext,
    filter: sanitizeFilter(rec.filter) || sanitizeFilter({
      field: rec.filterField,
      op: rec.filterOp,
      value: rec.filterValue,
    }),
    kpi: rec.kpi && typeof rec.kpi === 'object'
      ? {
          value: asString((rec.kpi as Record<string, unknown>).value, '—'),
          trend: asString((rec.kpi as Record<string, unknown>).trend) || undefined,
          field: asString((rec.kpi as Record<string, unknown>).field) || (!isDerivedMeasure(measure) ? measure?.field : undefined) || yField,
          aggregation: AGG_SET.has(asString((rec.kpi as Record<string, unknown>).aggregation))
            ? (asString((rec.kpi as Record<string, unknown>).aggregation) as Aggregation)
            : (!isDerivedMeasure(measure) ? measure?.agg : undefined) || aggregationNext,
          format: MEASURE_FORMATS.includes(
            asString((rec.kpi as Record<string, unknown>).format) as MeasureFormat,
          )
            ? (asString((rec.kpi as Record<string, unknown>).format) as MeasureFormat)
            : undefined,
          delta: Number.isFinite(Number((rec.kpi as Record<string, unknown>).delta))
            ? Number((rec.kpi as Record<string, unknown>).delta)
            : undefined,
          sparkline: Array.isArray((rec.kpi as Record<string, unknown>).sparkline)
            ? ((rec.kpi as Record<string, unknown>).sparkline as unknown[])
                .map((n) => Number(n))
                .filter((n) => Number.isFinite(n))
            : undefined,
          polarity,
        }
      : type === 'kpi'
        ? { value: asString(rec.value, '—'), trend: asString(rec.trend) || undefined, polarity }
        : undefined,
    insight: rec.insight && typeof rec.insight === 'object'
      ? {
          title: asString((rec.insight as Record<string, unknown>).title) || undefined,
          text: asString((rec.insight as Record<string, unknown>).text),
          tone: (['neutral', 'positive', 'warning'] as const).includes(
            asString((rec.insight as Record<string, unknown>).tone) as 'neutral',
          )
            ? (asString((rec.insight as Record<string, unknown>).tone) as 'neutral' | 'positive' | 'warning')
            : 'neutral',
        }
      : type === 'insight'
        ? { text: asString(rec.text || rec.description, 'No insight available.'), tone: 'neutral' }
        : undefined,
    columns: Array.isArray(rec.columns) ? rec.columns.map((c) => String(c)) : undefined,
  };
}

function inferWidgetType(rec: Record<string, unknown>): WidgetType {
  if (rec.kpi || rec.value) return 'kpi';
  if (rec.insight || rec.text) return 'insight';
  if (rec.xAxisField || rec.yAxisField || rec.chartType) return 'chart';
  if (WIDGET_SET.has(asString(rec.type))) return asString(rec.type) as WidgetType;
  return 'chart';
}

export function isLegacyLayout(raw: unknown): raw is LegacyDashboardLayout {
  if (!raw || typeof raw !== 'object') return false;
  const rec = raw as Record<string, unknown>;
  if (rec.version === DASHBOARD_SPEC_VERSION && Array.isArray(rec.widgets)) return false;
  return Array.isArray(rec.kpis) || Array.isArray(rec.charts);
}

export function fromLegacyLayout(raw: LegacyDashboardLayout, seed = 1): DashboardSpec {
  const palette = getPalette(raw.globalBg?.includes('0') ? 'midnight' : 'ocean');
  const widgets: DashboardWidget[] = [];
  (raw.kpis || []).forEach((kpi, i) => {
    widgets.push(
      sanitizeWidget(
        {
          id: `legacy-kpi-${i}`,
          type: 'kpi',
          title: kpi.label,
          kpi: { value: String(kpi.value ?? '—'), trend: kpi.trend },
          layout: { x: (i % 4) * 3, y: 0, w: 3, h: 3 },
        },
        i,
        palette,
      ),
    );
  });
  (raw.charts || []).forEach((chart, i) => {
    widgets.push(
      sanitizeWidget(
        {
          id: chart.id || `legacy-chart-${i}`,
          type: 'chart',
          title: chart.title,
          chartType: chart.type,
          datasetId: chart.datasetId,
          xField: chart.xAxisField,
          yField: chart.yAxisField,
          groupField: chart.groupField,
          sizeField: chart.sizeField,
          color: chart.color,
          filter: {
            field: chart.filterField,
            op: chart.filterOp,
            value: chart.filterValue,
          },
          layout: { x: (i % 2) * 6, y: 3 + Math.floor(i / 2) * 6, w: 6, h: 6 },
        },
        (raw.kpis?.length || 0) + i,
        palette,
      ),
    );
  });

  return {
    version: DASHBOARD_SPEC_VERSION,
    id: `legacy-${seed}`,
    title: raw.title || 'Intelligence Dashboard',
    archetype: 'command-center',
    seed,
    theme: {
      palette: { ...palette, background: isHexColor(asString(raw.globalBg)) ? asString(raw.globalBg) : palette.background },
      fontFamily: FONT_SET.has(asString(raw.fontFamily)) ? asString(raw.fontFamily) : 'font-sans',
      radius: RADIUS_SET.has(asString(raw.borderRadius)) ? asString(raw.borderRadius) : 'rounded-3xl',
      density: 'comfortable',
    },
    sections: [],
    widgets,
  };
}

export function validateDashboardSpec(raw: unknown, fallback?: Partial<DashboardSpec>): DashboardSpec {
  if (isLegacyLayout(raw)) {
    return fromLegacyLayout(raw, fallback?.seed ?? 1);
  }

  const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const themeRec = rec.theme && typeof rec.theme === 'object' ? (rec.theme as Record<string, unknown>) : {};
  const palette = sanitizePalette(themeRec.palette || rec.palette, fallback?.theme?.palette?.id);
  const archetype = (ARCHETYPE_SET.has(asString(rec.archetype))
    ? asString(rec.archetype)
    : fallback?.archetype || 'command-center') as LayoutArchetype;

  const widgetsRaw = Array.isArray(rec.widgets) ? rec.widgets : [];
  const widgets = widgetsRaw.map((w, i) => sanitizeWidget(w, i, palette));

  const sections = Array.isArray(rec.sections)
    ? rec.sections
        .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
        .map((s, i) => ({
          id: asString(s.id, `section-${i + 1}`),
          title: asString(s.title) || undefined,
          description: asString(s.description) || undefined,
        }))
    : [];

  const narrative = rec.narrative && typeof rec.narrative === 'object'
    ? {
        headline: asString((rec.narrative as Record<string, unknown>).headline),
        body: asString((rec.narrative as Record<string, unknown>).body),
      }
    : undefined;

  return {
    version: DASHBOARD_SPEC_VERSION,
    id: asString(rec.id, fallback?.id || `dash-${Date.now()}`),
    title: asString(rec.title, fallback?.title || 'Intelligence Dashboard'),
    subtitle: asString(rec.subtitle, fallback?.subtitle) || undefined,
    intent: asString(rec.intent, fallback?.intent) || undefined,
    archetype,
    seed: asNumber(rec.seed, fallback?.seed ?? 1),
    theme: {
      palette,
      fontFamily: FONT_SET.has(asString(themeRec.fontFamily))
        ? asString(themeRec.fontFamily)
        : fallback?.theme?.fontFamily || 'font-sans',
      headingFont: FONT_SET.has(asString(themeRec.headingFont)) ? asString(themeRec.headingFont) : undefined,
      radius: RADIUS_SET.has(asString(themeRec.radius || rec.borderRadius))
        ? asString(themeRec.radius || rec.borderRadius)
        : fallback?.theme?.radius || 'rounded-3xl',
      density: (['compact', 'comfortable', 'airy'] as const).includes(asString(themeRec.density) as 'compact')
        ? (asString(themeRec.density) as 'compact' | 'comfortable' | 'airy')
        : 'comfortable',
    },
    narrative: narrative?.headline || narrative?.body ? narrative : fallback?.narrative,
    sections,
    widgets: widgets.length > 0 ? widgets : fallback?.widgets || [],
    filters: Array.isArray(rec.filters)
      ? rec.filters.map(sanitizeFilter).filter((f): f is NonNullable<typeof f> => Boolean(f))
      : undefined,
  };
}

function scanBalancedObject(text: string, start: number): number {
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function extractJsonObjects(text: string): unknown[] {
  const cleaned = String(text || '')
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();
  const found: unknown[] = [];
  try {
    found.push(JSON.parse(cleaned));
  } catch {
    // scan below
  }
  for (let i = 0; i < cleaned.length; i += 1) {
    if (cleaned[i] !== '{') continue;
    const end = scanBalancedObject(cleaned, i);
    if (end < 0) continue;
    try {
      found.push(JSON.parse(cleaned.slice(i, end + 1)));
    } catch {
      // skip broken candidate
    }
    i = end;
  }
  return found;
}

export function extractJsonObject(text: string): unknown {
  const candidates = extractJsonObjects(text);
  if (candidates.length === 0) throw new Error('Model did not return valid JSON.');
  const withWidgets = candidates.filter((item) => item && typeof item === 'object' && Array.isArray((item as { widgets?: unknown }).widgets));
  const pool = withWidgets.length ? withWidgets : candidates;
  return pool.sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)[0];
}

export function applyThemeOverrides(
  spec: DashboardSpec,
  overrides: Partial<{ paletteId: string; mode: 'light' | 'dark'; fontFamily: string; radius: string }>,
): DashboardSpec {
  const palette = overrides.paletteId
    ? getPalette(overrides.paletteId)
    : overrides.mode
      ? pickPaletteForMode(spec.theme.palette.id, overrides.mode)
      : spec.theme.palette;
  return {
    ...spec,
    theme: {
      ...spec.theme,
      palette,
      fontFamily: overrides.fontFamily || spec.theme.fontFamily,
      radius: overrides.radius || spec.theme.radius,
    },
  };
}
