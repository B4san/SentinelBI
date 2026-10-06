import React, { useMemo, useRef, useState } from 'react';
import type { DashboardDataset, DashboardSpec, DashboardWidget, WidgetFilter } from '../../lib/dashboard/types';
import { CHART_TYPES } from '../../lib/dashboard/types';
import { classifyFields, prettyField } from '../../lib/dashboard/insights';
import { parseLocalDate } from '../../lib/dashboard/dates';
import { applyLiveCopy } from '../../lib/dashboard/facts';
import { prepareTableModel } from '../../lib/dashboard/table';
import { harmonizePalette } from '../../lib/dashboard/palettes';
import { DateRangePicker, type DateRangeValue } from '../arc/date-range-picker/date-range-picker';
import { WidgetCard } from './WidgetCard';

const COLS = 12;

function rowHeightFor(density: DashboardSpec['theme']['density']): number {
  if (density === 'compact') return 52;
  if (density === 'airy') return 60;
  return 56;
}

export function DashboardCanvas({
  spec,
  datasets,
  editing = false,
  selectedId,
  onSelect,
  onChange,
  onRegenerateWidget,
  ssr = false,
}: {
  spec: DashboardSpec;
  datasets: DashboardDataset[];
  editing?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onChange?: (spec: DashboardSpec) => void;
  onRegenerateWidget?: (id: string) => void;
  ssr?: boolean;
}) {
  const gap = spec.theme.density === 'compact' ? 12 : 14;
  const rowHeight = rowHeightFor(spec.theme.density);
  const pageMode = (typeof document !== 'undefined'
    ? (document.documentElement.getAttribute('data-theme') as 'light' | 'dark' | null)
    : null) || spec.theme.palette.mode;
  const palette = useMemo(
    () => harmonizePalette(spec.theme.palette, pageMode === 'dark' || pageMode === 'light' ? pageMode : spec.theme.palette.mode),
    [spec.theme.palette, pageMode],
  );
  const themedSpec = useMemo(() => ({ ...spec, theme: { ...spec.theme, palette } }), [spec, palette]);
  const fields = datasets[0] ? classifyFields(datasets[0]) : { measures: [], dimensions: [], time: [] };

  const [filters, setFilters] = useState<WidgetFilter[]>(spec.filters || []);
  const [compare, setCompare] = useState<'none' | 'previous-period' | 'previous-year'>('none');
  const [slicer, setSlicer] = useState('');
  const [slicerField, setSlicerField] = useState(fields.dimensions[0] || '');
  const [range, setRange] = useState<DateRangeValue>({ from: '', to: '', preset: 'custom' });
  const [drill, setDrill] = useState<string[]>([]);
  const [highlight, setHighlight] = useState<{ field: string; value: string } | null>(null);

  const timeField = fields.time[0];
  const dateBounds = useMemo(() => {
    if (!timeField || !datasets[0]) return { min: undefined as Date | undefined, max: undefined as Date | undefined };
    const dates = datasets[0].data
      .map((row) => parseLocalDate(row[timeField]))
      .filter((d): d is Date => Boolean(d))
      .sort((a, b) => a.getTime() - b.getTime());
    return { min: dates[0], max: dates[dates.length - 1] };
  }, [datasets, timeField]);

  const extraFilters = useMemo(() => {
    const next = [...filters];
    if (slicerField && slicer) next.push({ field: slicerField, op: 'equals', value: slicer });
    if (timeField && range.from) next.push({ field: timeField, op: 'gte', value: range.from });
    if (timeField && range.to) next.push({ field: timeField, op: 'lte', value: range.to });
    return next;
  }, [filters, slicer, slicerField, range, timeField]);

  const specWithCompare = useMemo(() => {
    const next = {
      ...themedSpec,
      widgets: themedSpec.widgets.map((widget) => (
        compare !== 'none' && widget.type === 'chart'
          ? { ...widget, compare }
          : widget
      )),
      filters: extraFilters,
    };
    return applyLiveCopy(next, datasets, extraFilters);
  }, [themedSpec, compare, extraFilters, datasets]);

  const addFilter = (field: string, value: string) => {
    setFilters((current) => {
      const existing = current.find((f) => f.field === field && f.value === value);
      if (existing) return current.filter((f) => f !== existing);
      return [...current.filter((f) => f.field !== field), { field, op: 'equals', value }];
    });
    setHighlight({ field, value });
  };

  const slicerValues = useMemo(() => {
    if (!slicerField || !datasets[0]) return [];
    return [...new Set(datasets[0].data.map((row) => String(row[slicerField] ?? '')).filter(Boolean))].slice(0, 12);
  }, [datasets, slicerField]);

  return (
    <div
      className={`${spec.theme.fontFamily} dash-board dash-page w-full`}
      style={{ color: palette.text }}
      data-ssr={ssr ? '1' : undefined}
    >
      <header className="mb-4 w-full">
        <h2 className={`${spec.theme.headingFont || spec.theme.fontFamily} text-[28px] font-semibold tracking-tight`}>
          {spec.title}
        </h2>
        {(specWithCompare.narrative?.headline || specWithCompare.subtitle) && (
          <p className="mt-1.5 text-[15px] leading-relaxed max-w-4xl" style={{ color: palette.muted }}>
            {specWithCompare.narrative?.headline || specWithCompare.subtitle}
          </p>
        )}
      </header>

      <div className="dash-toolbar mb-4 flex flex-wrap items-center gap-2 overflow-visible relative z-20">
        {timeField && (
          <DateRangePicker
            value={range}
            onChange={setRange}
            accent={palette.accent}
            muted={palette.muted}
            minDate={dateBounds.min}
            maxDate={dateBounds.max}
            hasDate={(iso) => {
              if (!datasets[0] || !timeField) return true;
              return datasets[0].data.some((row) => {
                const raw = String(row[timeField] ?? '');
                return raw.slice(0, 10) === iso || raw.startsWith(iso.slice(0, 7));
              });
            }}
          />
        )}
        {fields.dimensions[0] && (
          <select
            className="rounded-lg border px-2 py-1 text-[12px] bg-transparent"
            style={{ borderColor: palette.border }}
            value={slicerField}
            onChange={(e) => { setSlicerField(e.target.value); setSlicer(''); }}
          >
            {fields.dimensions.map((d) => <option key={d} value={d}>{prettyField(d)}</option>)}
          </select>
        )}
        {slicerValues.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {slicerValues.map((value) => (
              <button
                key={value}
                type="button"
                className="rounded-full border px-2 py-0.5 text-[11px]"
                style={{
                  borderColor: slicer === value ? palette.accent : palette.border,
                  background: slicer === value ? palette.accentSoft : 'transparent',
                  color: slicer === value ? palette.accent : palette.muted,
                }}
                onClick={() => setSlicer((current) => current === value ? '' : value)}
              >
                {value}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className="rounded-full border px-3 py-1 text-[11px]"
          style={{ borderColor: palette.border, color: compare === 'none' ? palette.muted : palette.accent }}
          onClick={() => setCompare((c) => c === 'none' ? 'previous-period' : c === 'previous-period' ? 'previous-year' : 'none')}
        >
          {compare === 'none' ? 'Compare period' : compare === 'previous-period' ? 'Vs previous period' : 'Vs last year'}
        </button>
        {filters.map((filter) => (
          <button
            key={`${filter.field}:${filter.value}`}
            type="button"
            className="rounded-full px-2 py-0.5 text-[11px]"
            style={{ background: palette.accentSoft, color: palette.accent }}
            onClick={() => setFilters((current) => current.filter((f) => f !== filter))}
          >
            {filter.field} = {filter.value} ×
          </button>
        ))}
        {drill.length > 0 && (
          <nav className="text-[11px]" style={{ color: palette.muted }}>
            {['All', ...drill].map((crumb, i) => (
              <button
                key={`${crumb}-${i}`}
                type="button"
                className="mr-1"
                onClick={() => {
                  setDrill(drill.slice(0, i));
                  setFilters((current) => current.slice(0, i));
                }}
              >
                {crumb}{i < drill.length ? ' /' : ''}
              </button>
            ))}
          </nav>
        )}
      </div>

      <div
        className="dash-grid w-full"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
          gridAutoRows: `${rowHeight}px`,
          gap,
        }}
      >
        {specWithCompare.widgets.map((widget) => {
          const liveWidget = widget.type === 'table'
            ? { ...widget, layout: { ...widget.layout, h: tableSpan(widget, datasets, extraFilters, rowHeight, gap) } }
            : widget;
          return (
          <GridItem
            key={widget.id}
            widget={liveWidget}
            gap={gap}
            rowHeight={rowHeight}
            editing={editing}
            selected={selectedId === widget.id}
            onSelect={() => onSelect?.(widget.id)}
            onMove={(layout) => {
              onChange?.({
                ...spec,
                widgets: spec.widgets.map((w) => (w.id === widget.id ? { ...w, layout } : w)),
              });
            }}
          >
            <WidgetCard
              spec={specWithCompare}
              widget={liveWidget}
              datasets={datasets}
              filters={filtersForWidget(widget, extraFilters, highlight)}
              highlight={highlight && highlight.field === widget.xField ? highlight.value : undefined}
              editing={editing}
              selected={selectedId === widget.id}
              onSelect={onSelect}
              onRegenerate={onRegenerateWidget}
              onPointClick={(field, value) => addFilter(field, value)}
            />
          </GridItem>
          );
        })}
      </div>
      {spec.generatedBy && (
        <p className="mt-4 text-[11px]" style={{ color: palette.muted }} data-generated-by={spec.generatedBy}>
          Generated by {spec.generatedBy}
        </p>
      )}
    </div>
  );
}

function tableSpan(
  widget: DashboardWidget,
  datasets: DashboardDataset[],
  extra: WidgetFilter[],
  rowHeight: number,
  gap: number,
): number {
  const model = prepareTableModel(datasets, widget, extra);
  const px = 56 + Math.max(1, model.rows.length) * 30;
  const unit = rowHeight + gap;
  return Math.max(3, Math.min(widget.layout.h, Math.ceil(px / unit)));
}

function filtersForWidget(widget: DashboardWidget, extra: WidgetFilter[], highlight?: { field: string; value: string } | null): WidgetFilter[] {
  if (!highlight || highlight.field !== widget.xField) return extra;
  return extra.filter((f) => !(f.field === widget.xField && f.op === 'equals' && String(f.value) === highlight.value));
}

function GridItem({
  widget,
  gap,
  rowHeight,
  editing,
  selected,
  onSelect,
  onMove,
  children,
}: {
  widget: DashboardWidget;
  gap: number;
  rowHeight: number;
  editing: boolean;
  selected: boolean;
  onSelect?: () => void;
  onMove: (layout: DashboardWidget['layout']) => void;
  children: React.ReactNode;
}) {
  const { x, y, w, h } = widget.layout;
  const start = useRef<{ px: number; py: number; layout: DashboardWidget['layout']; mode: 'move' | 'resize' } | null>(null);
  const host = useRef<HTMLDivElement>(null);

  const cellHeight = h * rowHeight + Math.max(0, h - 1) * gap;
  const isTable = widget.type === 'table';
  const style = {
    gridColumn: `${x + 1} / span ${Math.max(1, w)}`,
    gridRow: `${y + 1} / span ${Math.max(1, h)}`,
    minWidth: 0,
    height: widget.type === 'section' || isTable ? 'auto' : cellHeight,
    minHeight: widget.type === 'section' ? 36 : isTable ? 120 : cellHeight,
    maxHeight: isTable ? cellHeight : undefined,
    alignSelf: isTable ? 'start' : undefined,
    zIndex: widget.type === 'section' ? 2 : selected ? 4 : 1,
    position: 'relative' as const,
    overflow: widget.type === 'section' ? 'visible' : 'hidden',
    ['--dash-cell-h' as string]: `${cellHeight}px`,
  };

  const snapFromDelta = (dx: number, dy: number, mode: 'move' | 'resize', origin: DashboardWidget['layout']) => {
    const parent = host.current?.parentElement;
    if (!parent) return origin;
    const unit = parent.clientWidth / COLS;
    const dCol = Math.round(dx / unit);
    const dRow = Math.round(dy / (rowHeight + gap));
    if (mode === 'resize') {
      return {
        ...origin,
        w: Math.max(2, Math.min(12 - origin.x, origin.w + dCol)),
        h: Math.max(2, Math.min(16, origin.h + dRow)),
      };
    }
    return {
      ...origin,
      x: Math.max(0, Math.min(12 - origin.w, origin.x + dCol)),
      y: Math.max(0, origin.y + dRow),
    };
  };

  const onPointerDown = (e: React.PointerEvent, mode: 'move' | 'resize') => {
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { px: e.clientX, py: e.clientY, layout: widget.layout, mode };
  };

  const onCardPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-drag-handle="true"]')) {
      onPointerDown(e, 'move');
      return;
    }
    onSelect?.();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const next = snapFromDelta(e.clientX - start.current.px, e.clientY - start.current.py, start.current.mode, start.current.layout);
    onMove(next);
  };

  const onPointerUp = () => {
    start.current = null;
  };

  return (
    <div
      ref={host}
      style={style}
      onPointerDown={onCardPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {children}
      {editing && (
        <button
          type="button"
          aria-label="Resize widget"
          className="absolute bottom-1.5 right-1.5 h-4 w-4 rounded-sm border bg-white/80"
          onPointerDown={(e) => onPointerDown(e, 'resize')}
        />
      )}
    </div>
  );
}

export function WidgetInspector({
  spec,
  widget,
  datasets,
  onChange,
}: {
  spec: DashboardSpec;
  widget: DashboardWidget;
  datasets: DashboardDataset[];
  onChange: (widget: DashboardWidget) => void;
}) {
  const dataset = datasets.find((d) => d.id === widget.datasetId) || datasets[0];
  const fields = dataset?.columns?.map((c) => c.name) || Object.keys(dataset?.data?.[0] || {});

  return (
    <div className="space-y-3 text-sm">
      <label className="block">
        <span className="text-xs font-semibold text-[var(--text-secondary)]">Title</span>
        <input
          className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2"
          value={widget.title}
          onChange={(e) => onChange({ ...widget, title: e.target.value })}
        />
      </label>
      {widget.type === 'chart' && (
        <>
          <label className="block">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">Chart type</span>
            <select
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2"
              value={widget.chartType}
              onChange={(e) => onChange({ ...widget, chartType: e.target.value as DashboardWidget['chartType'] })}
            >
              {CHART_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">X field</span>
              <select className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2" value={widget.xField || ''} onChange={(e) => onChange({ ...widget, xField: e.target.value })}>
                {fields.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">Y field</span>
              <select className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2" value={widget.yField || ''} onChange={(e) => onChange({ ...widget, yField: e.target.value })}>
                {fields.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
          </div>
        </>
      )}
      <label className="block">
        <span className="text-xs font-semibold text-[var(--text-secondary)]">Color</span>
        <input
          type="color"
          className="mt-1 h-10 w-full rounded-xl border border-[var(--border)]"
          value={widget.color || spec.theme.palette.accent}
          onChange={(e) => onChange({ ...widget, color: e.target.value })}
        />
      </label>
    </div>
  );
}
