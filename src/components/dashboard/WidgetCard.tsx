import React from 'react';
import { ArrowDownRight, ArrowUpRight, Filter, GripVertical, RefreshCw } from 'lucide-react';
import type { DashboardDataset, DashboardSpec, DashboardWidget } from '../../lib/dashboard/types';
import { computeKpiStats, formatMetric } from '../../lib/dashboard/aggregate';
import { metricFormat, prettyField } from '../../lib/dashboard/insights';
import { formatDeltaLabel, inferMetricPolarity, isRateMetric } from '../../lib/dashboard/metrics';
import { prepareTableModel } from '../../lib/dashboard/table';
import type { WidgetFilter } from '../../lib/dashboard/types';
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
      className={`dash-card h-full w-full min-w-0 min-h-0 flex flex-col ${isSection || isInsight ? 'overflow-visible' : 'overflow-hidden'} border ${radius} ${selected ? 'ring-2 ring-offset-2' : ''} ${isSection ? 'dash-card-flush' : ''}`}
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
              <p className="inline-flex items-center gap-1 mt-1 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: palette.accentSoft, color: palette.accent }}>
                <Filter className="w-3 h-3" /> {widget.filter.field} {widget.filter.op} {widget.filter.value}
              </p>
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

function Sparkline({ values, color, wide }: { values: number[]; color: string; wide?: boolean }) {
  if (values.length < 2) return null;
  const w = wide ? 128 : 72;
  const h = wide ? 40 : 28;
  const p = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = p + (i / (values.length - 1)) * (w - p * 2);
    const y = h - p - ((v - min) / span) * (h - p * 2);
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} className="shrink-0 overflow-visible" aria-hidden>
      <polyline fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  );
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
    return (
      <div className={`h-full flex flex-col ${hero ? 'justify-between px-5 py-4' : 'justify-center gap-1.5 px-4 py-3'}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {editing && <GripVertical className="w-3 h-3 shrink-0 opacity-40 cursor-grab" data-drag-handle="true" />}
              <p className="text-[12px] font-medium truncate" style={{ color: palette.muted }}>
                {widget.title}
              </p>
            </div>
          </div>
          {pretty && (
            <span
              className="inline-flex items-center gap-0.5 text-[11px] font-semibold shrink-0"
              style={{ color: pretty.color }}
            >
              {!pretty.flat && ((delta ?? 0) < 0 ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />)}
              {pretty.label}
            </span>
          )}
        </div>
        <div className="flex items-end justify-between gap-3 mt-1">
          <div className={`${hero ? 'dash-kpi-value-hero' : 'dash-kpi-value'} leading-none`}>{stats.value}</div>
          <Sparkline values={stats.sparkline} color={widget.color || palette.accent} wide={hero} />
        </div>
        {hero && stats.trend && (
          <p className="text-[11px] mt-2 truncate" style={{ color: palette.muted }}>{stats.trend}</p>
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
    return (
      <div className="h-full text-[12px] overflow-auto">
        <table className="w-full table-fixed">
          <thead>
            <tr>
              {model.columns.map((c) => (
                <th key={c} className="text-left font-semibold pb-2 pr-3 sticky top-0" style={{ color: palette.muted, background: palette.surface }}>
                  {prettyField(c)}
                </th>
              ))}
              {compareOn && (
                <th className="text-right font-semibold pb-2" style={{ color: palette.muted, background: palette.surface }}>Δ</th>
              )}
            </tr>
          </thead>
          <tbody>
            {model.rows.map((row, i) => {
              const isTotal = String(row[model.columns[0]] || '').toLowerCase() === 'total';
              return (
              <tr key={i} className="border-t" style={{ borderColor: palette.border, fontWeight: isTotal ? 600 : 400 }}>
                {model.columns.map((c) => {
                  const raw = model.rawRows[i]?.[c];
                  const bar = model.barField === c && typeof raw === 'number' && !isTotal;
                  const max = bar
                    ? Math.max(...model.rawRows.filter((_, idx) => String(model.rawRows[idx][model.columns[0]] || '').toLowerCase() !== 'total').map((r) => Number(r[c]) || 0), 1)
                    : 1;
                  const pct = bar ? Math.max(0, Math.min(100, (Number(raw) / max) * 100)) : 0;
                  return (
                    <td key={c} className="py-1.5 pr-3 tabular-nums">
                      {bar ? (
                        <div className="flex items-center gap-2">
                          <span className="relative h-2 flex-1 rounded-full overflow-hidden" style={{ background: palette.border }}>
                            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: palette.accent, opacity: 0.7 }} />
                          </span>
                          <span className="w-[4.5rem] text-right shrink-0">{String(row[c] ?? '')}</span>
                        </div>
                      ) : (
                        <span>{String(row[c] ?? '')}</span>
                      )}
                    </td>
                  );
                })}
                {compareOn && (
                  <td className="py-1.5 text-right tabular-nums" style={{ color: palette.muted }}>
                    {typeof model.rawRows[i]?.__delta === 'number' ? formatMetric(Number(model.rawRows[i].__delta), 'percent') : '—'}
                  </td>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="h-full w-full min-h-0 min-w-0">
      <ChartRenderer spec={spec} widget={widget} datasets={datasets} filters={filters} onPointClick={onPointClick} highlight={highlight} />
    </div>
  );
}
