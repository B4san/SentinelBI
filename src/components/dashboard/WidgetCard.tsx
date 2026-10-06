import React from 'react';
import { ArrowDownRight, ArrowUpRight, Filter, GripVertical, RefreshCw } from 'lucide-react';
import type { DashboardDataset, DashboardSpec, DashboardWidget } from '../../lib/dashboard/types';
import { computeKpiStats, formatMetric } from '../../lib/dashboard/aggregate';
import { metricFormat, prettyField } from '../../lib/dashboard/insights';
import { ChartRenderer } from './ChartRenderer';

export function WidgetCard({
  spec,
  widget,
  datasets,
  editing,
  onSelect,
  onRegenerate,
  selected,
}: {
  spec: DashboardSpec;
  widget: DashboardWidget;
  datasets: DashboardDataset[];
  editing?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onRegenerate?: (id: string) => void;
}) {
  const palette = spec.theme.palette;
  const radius = spec.theme.radius || 'rounded-2xl';
  const isKpi = widget.type === 'kpi';
  const isSection = widget.type === 'section';

  return (
    <article
      onClick={() => onSelect?.(widget.id)}
      className={`dash-card h-full w-full min-w-0 min-h-0 flex flex-col overflow-hidden border ${radius} ${selected ? 'ring-2 ring-offset-2' : ''} ${isSection ? 'dash-card-flush' : ''}`}
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
      {!isKpi && !isSection && (
        <header className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-1 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {editing && <GripVertical className="w-3.5 h-3.5 shrink-0 opacity-40 cursor-grab" data-drag-handle="true" />}
              {(widget.role === 'compare-a' || widget.role === 'compare-b') && (
                <span
                  className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{ background: palette.accentSoft, color: palette.accent }}
                >
                  {widget.role === 'compare-a' ? 'A' : 'B'}
                </span>
              )}
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
      <div className={`min-h-0 flex-1 ${isKpi || isSection ? '' : 'px-3 pb-3'}`}>
        <WidgetBody spec={spec} widget={widget} datasets={datasets} editing={editing} />
      </div>
    </article>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const w = 72;
  const h = 28;
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
  editing,
}: {
  spec: DashboardSpec;
  widget: DashboardWidget;
  datasets: DashboardDataset[];
  editing?: boolean;
}) {
  const palette = spec.theme.palette;

  if (widget.type === 'kpi') {
    const stats = computeKpiStats(datasets, widget, spec.filters);
    const delta = stats.delta;
    const down = (delta ?? 0) < 0;
    return (
      <div className="h-full flex flex-col justify-between px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {editing && <GripVertical className="w-3 h-3 shrink-0 opacity-40 cursor-grab" data-drag-handle="true" />}
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] truncate" style={{ color: palette.muted }}>
                {widget.title}
              </p>
            </div>
          </div>
          {delta != null && (
            <span
              className="inline-flex items-center gap-0.5 text-[11px] font-semibold shrink-0"
              style={{ color: down ? '#e11d48' : '#059669' }}
            >
              {down ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
              {`${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`}
            </span>
          )}
        </div>
        <div className="flex items-end justify-between gap-3 mt-1">
          <div className="dash-kpi-value leading-none">{stats.value}</div>
          <Sparkline values={stats.sparkline} color={widget.color || palette.accent} />
        </div>
      </div>
    );
  }

  if (widget.type === 'insight') {
    const featured = widget.role === 'featured';
    const strip = widget.role === 'strip';
    const tone = widget.insight?.tone || 'neutral';
    const bar = tone === 'warning' ? '#e11d48' : tone === 'positive' ? palette.accent : palette.muted;
    return (
      <div
        className={`h-full flex ${strip ? 'flex-row items-center gap-4 px-4 py-3' : 'flex-col justify-center px-5 py-4'}`}
        style={{ borderLeft: featured ? `3px solid ${bar}` : undefined }}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] shrink-0" style={{ color: palette.accent }}>
          {widget.insight?.title || widget.title || 'Finding'}
        </p>
        <p className={`${featured ? 'text-[17px] leading-relaxed mt-3' : strip ? 'text-[13px] leading-snug' : 'text-[13px] leading-relaxed mt-2'}`} style={{ color: palette.text }}>
          {widget.insight?.text || widget.subtitle}
        </p>
      </div>
    );
  }

  if (widget.type === 'section') {
    return (
      <div className="h-full flex flex-col justify-center px-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: palette.accent }}>
          {spec.archetype.replace(/-/g, ' ')}
        </p>
        <h3 className={`${spec.theme.headingFont || spec.theme.fontFamily} text-2xl font-semibold tracking-tight mt-1`}>
          {widget.title}
        </h3>
        {widget.subtitle && (
          <p className="text-sm mt-1.5 max-w-3xl leading-relaxed" style={{ color: palette.muted }}>{widget.subtitle}</p>
        )}
      </div>
    );
  }

  if (widget.type === 'table') {
    const dataset = datasets.find((d) => d.id === widget.datasetId) || datasets[0];
    const cols = widget.columns?.length ? widget.columns : Object.keys(dataset?.data?.[0] || {}).slice(0, 5);
    const rows = (dataset?.data || []).slice(0, 8);
    return (
      <div className="overflow-auto h-full text-[12px]">
        <table className="w-full">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c} className="text-left font-semibold pb-2 pr-3 sticky top-0" style={{ color: palette.muted, background: palette.surface }}>
                  {prettyField(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t" style={{ borderColor: palette.border }}>
                {cols.map((c) => {
                  const raw = row[c];
                  const num = Number(raw);
                  const shown = raw !== '' && raw != null && !Number.isNaN(num) && typeof raw !== 'boolean'
                    ? formatMetric(num, metricFormat(c))
                    : String(raw ?? '');
                  return <td key={c} className="py-1.5 pr-3 tabular-nums">{shown}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="h-full w-full min-h-0">
      <ChartRenderer spec={spec} widget={widget} datasets={datasets} />
    </div>
  );
}
