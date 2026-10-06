import React, { useMemo, useRef } from 'react';
import type { DashboardDataset, DashboardSpec, DashboardWidget } from '../../lib/dashboard/types';
import { CHART_TYPES } from '../../lib/dashboard/types';
import { ARCHETYPE_META } from '../../lib/dashboard/archetypes';
import { harmonizePalette } from '../../lib/dashboard/palettes';
import { WidgetCard } from './WidgetCard';
import { useStore } from '../../store';

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
}: {
  spec: DashboardSpec;
  datasets: DashboardDataset[];
  editing?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onChange?: (spec: DashboardSpec) => void;
  onRegenerateWidget?: (id: string) => void;
}) {
  const appMode = useStore((s) => s.appearance.mode);
  const gap = spec.theme.density === 'compact' ? 12 : 14;
  const rowHeight = rowHeightFor(spec.theme.density);
  const palette = useMemo(() => harmonizePalette(spec.theme.palette, appMode), [spec.theme.palette, appMode]);
  const themedSpec = useMemo(() => ({ ...spec, theme: { ...spec.theme, palette } }), [spec, palette]);
  const meta = ARCHETYPE_META[spec.archetype];

  return (
    <div
      className={`${spec.theme.fontFamily} dash-board w-full`}
      style={{ color: palette.text }}
    >
      <header className="mb-5 w-full">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] mb-1.5" style={{ color: palette.muted }}>
          {meta?.label || spec.archetype.replace(/-/g, ' ')}
          {meta?.brief ? ` · ${meta.brief}` : ''}
        </p>
        <h2 className={`${spec.theme.headingFont || spec.theme.fontFamily} text-[28px] font-semibold tracking-tight`}>
          {spec.title}
        </h2>
        {(spec.narrative?.headline || spec.subtitle) && (
          <p className="mt-1.5 text-[15px] leading-relaxed max-w-4xl" style={{ color: palette.muted }}>
            {spec.narrative?.headline || spec.subtitle}
          </p>
        )}
      </header>

      <div
        className="dash-grid w-full"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
          gridAutoRows: `${rowHeight}px`,
          gap,
        }}
      >
        {spec.widgets.map((widget) => (
          <GridItem
            key={widget.id}
            widget={widget}
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
              spec={themedSpec}
              widget={widget}
              datasets={datasets}
              editing={editing}
              selected={selectedId === widget.id}
              onSelect={onSelect}
              onRegenerate={onRegenerateWidget}
            />
          </GridItem>
        ))}
      </div>
    </div>
  );
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

  const style = {
    gridColumn: `${x + 1} / span ${Math.max(1, w)}`,
    gridRow: `${y + 1} / span ${Math.max(1, h)}`,
    minWidth: 0,
    minHeight: 0,
    zIndex: selected ? 4 : 1,
    position: 'relative' as const,
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
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Title</span>
        <input
          className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2"
          value={widget.title}
          onChange={(e) => onChange({ ...widget, title: e.target.value })}
        />
      </label>
      {widget.type === 'chart' && (
        <>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Chart type</span>
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
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">X field</span>
              <select className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2" value={widget.xField || ''} onChange={(e) => onChange({ ...widget, xField: e.target.value })}>
                {fields.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Y field</span>
              <select className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2" value={widget.yField || ''} onChange={(e) => onChange({ ...widget, yField: e.target.value })}>
                {fields.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
          </div>
        </>
      )}
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Color</span>
        <input
          type="color"
          className="mt-1 h-10 w-full rounded-xl border border-[var(--border)]"
          value={widget.color || spec.theme.palette.accent}
          onChange={(e) => onChange({ ...widget, color: e.target.value })}
        />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="block col-span-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Field</span>
          <select className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-2 py-2" value={widget.filter?.field || ''} onChange={(e) => onChange({ ...widget, filter: { field: e.target.value, op: widget.filter?.op || 'contains', value: widget.filter?.value || '' } })}>
            <option value="">No filter</option>
            {fields.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Op</span>
          <select className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-2 py-2" value={widget.filter?.op || 'contains'} onChange={(e) => onChange({ ...widget, filter: { field: widget.filter?.field || fields[0], op: e.target.value as NonNullable<DashboardWidget['filter']>['op'], value: widget.filter?.value || '' } })}>
            <option value="contains">contains</option>
            <option value="equals">equals</option>
            <option value="gt">&gt;</option>
            <option value="lt">&lt;</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Value</span>
          <input className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-2 py-2" value={widget.filter?.value || ''} onChange={(e) => onChange({ ...widget, filter: { field: widget.filter?.field || fields[0], op: widget.filter?.op || 'contains', value: e.target.value } })} />
        </label>
      </div>
    </div>
  );
}
