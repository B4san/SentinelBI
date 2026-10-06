import React from 'react';
import { Filter, GripVertical, RefreshCw } from 'lucide-react';
import type { DashboardDataset, DashboardSpec, DashboardWidget } from '../../lib/dashboard/types';
import { computeKpiStats, formatMetric } from '../../lib/dashboard/aggregate';
import { prettyField } from '../../lib/dashboard/insights';
import { formatDeltaLabel, inferMetricPolarity, isRateMetric } from '../../lib/dashboard/metrics';
import { prepareTableModel } from '../../lib/dashboard/table';
import type { WidgetFilter } from '../../lib/dashboard/types';
import { Badge } from '../arc/badge/badge';
import { MetricCard } from '../arc/metric-card/metric-card';
import { SortableDataTable } from '../arc/sortable-data-table/sortable-data-table';
import { ArcGaugeCard, ArcSparklineStat } from './ArcCharts';
import { ChartRenderer } from './ChartRenderer';

export function WidgetCard({
  spec,
  widget,
  datasets,
  filters = [],
  editing,
  onSelect,
  onRegenerate,
  onPointClick,
  selected,
  highlight,
}: {
  spec: DashboardSpec;
  widget: DashboardWidget;
  datasets: DashboardDataset[];
  filters?: WidgetFilter[];
  editing?: boolean;
  selected?: boolean;
  highlight?: string;
  onSelect?: (id: string) => void;
  onRegenerate?: (id: string) => void;
  onPointClick?: (field: string, value: string) => void;
}) {
  const palette = spec.theme.palette;
  const radius = spec.theme.radius || 'rounded-2xl';
  const isKpi = widget.type === 'kpi';
  const isSection = widget.type === 'section';
  const isInsight = widget.type === 'insight';
  const hideChrome = isKpi || isSection || isInsight;

  return (
    <article
      onClick={() => onSelect?.(widget.id)}
      className={`dash-card h-full w-full min-w-0 min-h-0 flex flex-col ${isSection || isInsight ? 'overflow-visible' : 'overflow-hidden'} border ${radius} ${selected ? 'ring-2 ring-offset-2' : ''} ${isSection ? 'dash-card-flush' : ''} ${isKpi ? 'dash-kpi-shell' : ''}`}
      style={{
        background: isSection ? 'transparent' : palette.surface,
        color: palette.text,
        borderColor: isSection ? 'transparent' : selected ? palette.accent : palette.border,
        boxShadow: isSection
          ? 'none'
          : selected
            ? `0 10px 28px -18px ${palette.accent}`
            : '0 1px 2px rgba(15,23,42,0.04), 0 10px 24px -18px rgba(15,23,42,0.18)',
      }}
    >
      {!hideChrome && (
        <header className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-1 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {editing && <GripVertical className="w-3.5 h-3.5 shrink-0 opacity-40 cursor-grab" data-drag-handle="true" />}
              <h3 className={`${spec.theme.headingFont || spec.theme.fontFamily} text-[13px] font-semibold leading-snug truncate`}>
                {widget.title}
              </h3>
            </div>
            {widget.subtitle && (
              <p className="text-[11px] mt-0.5 truncate" style={{ color: palette.muted }}>{widget.subtitle}</p>
            )}
            {widget.filter && (
              <Badge tone="info" size="sm" className="mt-1">
                <Filter className="w-3 h-3" /> {widget.filter.field} {widget.filter.op} {widget.filter.value}
              </Badge>
            )}
          </div>
          {onRegenerate && (
            <button
              type="button"
              className="shrink-0 h-7 w-7 rounded-full border flex items-center justify-center"
              style={{ borderColor: palette.border, color: palette.accent }}
              onClick={(e) => {
                e.stopPropagation();
                onRegenerate(widget.id);
              }}
              title="Regenerate widget"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          )}
        </header>
      )}
      <div className={`min-h-0 min-w-0 flex-1 ${hideChrome ? '' : 'px-3 pb-3 relative'}`}>
        <WidgetBody spec={spec} widget={widget} datasets={datasets} filters={filters} editing={editing} onPointClick={onPointClick} highlight={highlight} />
      </div>
    </article>
  );
}

function kpiDisplay(raw: number, format: string): { value: number; suffix?: string } {
  if (format === 'percent') {
    const pct = Math.abs(raw) <= 1.5 ? raw * 100 : raw;
    return { value: Number(pct.toFixed(1)), suffix: '%' };
  }
  if (format === 'currency') {
    if (Math.abs(raw) >= 1_000_000) return { value: Number((raw / 1_000_000).toFixed(1)), suffix: 'M' };
    if (Math.abs(raw) >= 1_000) return { value: Number((raw / 1_000).toFixed(1)), suffix: 'K' };
    return { value: Math.round(raw) };
  }
  if (format === 'multiple') return { value: Number(raw.toFixed(2)), suffix: '×' };
  if (Math.abs(raw) >= 1_000_000) return { value: Number((raw / 1_000_000).toFixed(1)), suffix: 'M' };
  if (Math.abs(raw) >= 1_000) return { value: Number((raw / 1_000).toFixed(1)), suffix: 'K' };
  return { value: Number(raw.toFixed(Math.abs(raw) < 10 && !Number.isInteger(raw) ? 1 : 0)) };
}

function WidgetBody({
  spec,
  widget,
  datasets,
  filters,
  editing,
  onPointClick,
  highlight,
}: {
  spec: DashboardSpec;
  widget: DashboardWidget;
  datasets: DashboardDataset[];
  filters: WidgetFilter[];
  editing?: boolean;
  highlight?: string;
  onPointClick?: (field: string, value: string) => void;
}) {
  const palette = spec.theme.palette;

  if (widget.type === 'kpi') {
    const stats = computeKpiStats(datasets, widget, filters);
    const delta = stats.delta;
    const polarity = widget.kpi?.polarity || widget.polarity || inferMetricPolarity(widget.kpi?.field || widget.yField || widget.title);
    const hero = widget.role === 'hero' || widget.layout.h >= 4 || (widget.role === 'compare-a' || widget.role === 'compare-b') && widget.layout.h >= 3;
    const pretty = delta == null ? undefined : formatDeltaLabel(delta, {
      rate: stats.format === 'percent' || isRateMetric(widget.title, stats.format),
      polarity,
    });
    const tone = pretty?.flat
      ? 'accent' as const
      : (delta ?? 0) < 0
        ? (polarity === 'lower-is-better' ? 'success' as const : 'warning' as const)
        : 'success' as const;
    const numeric = kpiDisplay(stats.raw, stats.format);
    if (widget.componentId === 'arc.gauge') {
      return <ArcGaugeCard value={stats.raw} label={widget.title} detail={stats.trend || stats.value} tone={tone} />;
    }
    if (widget.componentId === 'arc.sparkline') {
      return (
        <div className="h-full px-3 py-2">
          <ArcSparklineStat
            values={stats.sparkline}
            label={widget.title}
            display={stats.value}
            change={pretty?.label}
            tone={tone}
          />
        </div>
      );
    }
    return (
      <div className={`h-full ${hero ? 'dash-kpi-hero' : ''}`}>
        <MetricCard
          label={widget.title}
          value={numeric.value}
          suffix={numeric.suffix}
          context={stats.trend || stats.value}
          change={pretty?.label}
        />
        {hero && stats.sparkline.length > 1 && (
          <div className="px-3 pb-3">
            <ArcSparklineStat
              values={stats.sparkline}
              label={`${widget.title} trend`}
              display={stats.value}
              change={pretty?.label}
              tone={tone}
            />
          </div>
        )}
      </div>
    );
  }

  if (widget.type === 'insight') {
    const featured = widget.role === 'featured';
    const strip = widget.role === 'strip';
    const tone = widget.insight?.tone || 'neutral';
    const bar = tone === 'warning' ? '#e11d48' : tone === 'positive' ? palette.accent : palette.muted;
    const title = widget.insight?.title || (widget.title.length <= 48 ? widget.title : '');
    const text = widget.insight?.text || widget.subtitle || '';
    const norm = (value: string) => value.replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
    const same = !title
      || norm(title) === norm(text)
      || text.toLowerCase().includes(title.toLowerCase())
      || title.length > 48;
    const chips = text.split(/(?<=\.)\s+/).filter(Boolean).slice(0, 3);
    return (
      <div
        className={`h-auto min-h-0 flex ${strip ? 'flex-row items-start gap-4 px-4 py-3' : 'flex-col justify-start px-5 py-3'}`}
        style={{ borderLeft: featured ? `3px solid ${bar}` : undefined }}
      >
        {!same && (
          <p className="text-[12px] font-semibold shrink-0 leading-snug" style={{ color: palette.accent }}>
            {title}
          </p>
        )}
        <div className={`${strip ? 'flex-1' : 'mt-2'} space-y-2`}>
          {chips.map((chip) => (
            <p key={chip} className="text-[13px] leading-snug" style={{ color: palette.text }}>{chip}</p>
          ))}
        </div>
      </div>
    );
  }

  if (widget.type === 'section') {
    return (
      <div className="h-full flex flex-col justify-end px-1 pb-1 overflow-visible">
        <h3 className={`${spec.theme.headingFont || spec.theme.fontFamily} text-lg font-semibold tracking-tight leading-tight`}>
          {widget.title}
        </h3>
        {widget.subtitle && (
          <p className="text-sm mt-1.5 max-w-3xl leading-relaxed" style={{ color: palette.muted }}>{widget.subtitle}</p>
        )}
      </div>
    );
  }

  if (widget.type === 'table') {
    const model = prepareTableModel(datasets, widget, filters);
    const compareOn = Boolean(widget.compare);
    const columns = [
      ...model.columns.map((c) => ({
        key: c,
        label: prettyField(c),
        sortable: true,
        numeric: model.rawRows.some((row) => typeof row[c] === 'number'),
        render: (_value: unknown, row: Record<string, unknown>) => {
          const idx = Number(row.__i);
          const formatted = model.rows[idx]?.[c];
          const raw = model.rawRows[idx]?.[c];
          const isTotal = String(model.rows[idx]?.[model.columns[0]] || '').toLowerCase() === 'total';
          const bar = model.barField === c && typeof raw === 'number' && !isTotal;
          if (!bar) return String(formatted ?? '');
          const max = Math.max(
            ...model.rawRows
              .filter((_, i) => String(model.rows[i]?.[model.columns[0]] || '').toLowerCase() !== 'total')
              .map((r) => Number(r[c]) || 0),
            1,
          );
          const pct = Math.max(0, Math.min(100, (Number(raw) / max) * 100));
          return (
            <div className="flex items-center gap-2">
              <span className="relative h-2 flex-1 rounded-full overflow-hidden" style={{ background: palette.border }}>
                <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: palette.accent, opacity: 0.7 }} />
              </span>
              <span className="w-[4.5rem] text-right shrink-0 tabular-nums">{String(formatted ?? '')}</span>
            </div>
          );
        },
      })),
      ...(compareOn ? [{
        key: '__delta',
        label: 'Δ',
        sortable: true,
        numeric: true,
        render: (_value: unknown, row: Record<string, unknown>) => (
          typeof row.__delta === 'number' ? formatMetric(Number(row.__delta), 'percent') : '—'
        ),
      }] : []),
    ];
    const rows = model.rawRows.map((raw, i) => ({ ...raw, __i: i, id: `r${i}` }));
    return (
      <div className="h-auto min-h-0 overflow-visible px-1">
        <SortableDataTable
          rows={rows}
          columns={columns}
          rowKey="id"
          caption={widget.title}
          defaultSort={widget.table?.sort ? { key: widget.table.sort.field, direction: widget.table.sort.dir } : undefined}
          emptyMessage="No rows for this cut."
          itemName={{ one: 'row', other: 'rows' }}
        />
      </div>
    );
  }

  return (
    <div className="h-full w-full min-h-0 min-w-0">
      <ChartRenderer spec={spec} widget={widget} datasets={datasets} filters={filters} onPointClick={onPointClick} highlight={highlight} />
    </div>
  );
}
