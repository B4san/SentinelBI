import React from 'react';
import { ArrowDownRight, ArrowUpRight, Filter, GripVertical, RefreshCw, Sparkles } from 'lucide-react';
import type { DashboardDataset, DashboardSpec, DashboardWidget } from '../../lib/dashboard/types';
import { computeKpiValue } from '../../lib/dashboard/aggregate';
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
  const radius = spec.theme.radius || 'rounded-3xl';

  return (
    <article
      onClick={() => onSelect?.(widget.id)}
      className={`h-full w-full overflow-hidden border shadow-sm transition-shadow ${radius} ${selected ? 'ring-2 ring-offset-2' : ''}`}
      style={{
        background: palette.surface,
        color: palette.text,
        borderColor: selected ? palette.accent : palette.border,
        boxShadow: selected ? `0 12px 32px -16px ${palette.accent}` : '0 16px 40px -24px rgba(15,23,42,0.25)',
      }}
    >
      <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {editing && <GripVertical className="w-4 h-4 shrink-0 opacity-40 drag-handle cursor-grab" />}
            <h3 className={`truncate ${spec.theme.headingFont || spec.theme.fontFamily} font-semibold`}>
              {widget.title}
            </h3>
          </div>
          {widget.subtitle && (
            <p className="text-xs mt-1 truncate" style={{ color: palette.muted }}>{widget.subtitle}</p>
          )}
          {widget.filter && (
            <p className="inline-flex items-center gap-1 mt-2 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: palette.accentSoft, color: palette.accent }}>
              <Filter className="w-3 h-3" /> {widget.filter.field} {widget.filter.op} {widget.filter.value}
            </p>
          )}
        </div>
        {onRegenerate && (
          <button
            type="button"
            className="shrink-0 h-8 w-8 rounded-full border flex items-center justify-center"
            style={{ borderColor: palette.border, color: palette.accent }}
            onClick={(e) => {
              e.stopPropagation();
              onRegenerate(widget.id);
            }}
            title="Regenerate widget"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
      </header>
      <div className="px-5 pb-5 h-[calc(100%-4.5rem)]">
        <WidgetBody spec={spec} widget={widget} datasets={datasets} />
      </div>
    </article>
  );
}

function WidgetBody({
  spec,
  widget,
  datasets,
}: {
  spec: DashboardSpec;
  widget: DashboardWidget;
  datasets: DashboardDataset[];
}) {
  const palette = spec.theme.palette;

  if (widget.type === 'kpi') {
    const value = computeKpiValue(datasets, widget, spec.filters);
    const trend = widget.kpi?.trend || '';
    const down = trend.includes('-');
    return (
      <div className="h-full flex flex-col justify-end pb-2">
        <div className="text-4xl font-extrabold tracking-tight">{value}</div>
        {trend && (
          <p className="mt-2 text-sm font-semibold flex items-center gap-1" style={{ color: down ? '#e11d48' : '#059669' }}>
            {down ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
            {trend}
          </p>
        )}
      </div>
    );
  }

  if (widget.type === 'insight') {
    return (
      <div className="h-full flex flex-col justify-center">
        <Sparkles className="w-4 h-4 mb-2" style={{ color: palette.accent }} />
        <p className="text-[15px] leading-relaxed" style={{ color: palette.text }}>
          {widget.insight?.text || widget.subtitle}
        </p>
      </div>
    );
  }

  if (widget.type === 'section') {
    return (
      <div className="h-full flex flex-col justify-center">
        <p className="text-sm uppercase tracking-[0.2em]" style={{ color: palette.muted }}>Section</p>
        <p className="text-lg font-semibold mt-1">{widget.subtitle || spec.narrative?.body}</p>
      </div>
    );
  }

  if (widget.type === 'table') {
    const dataset = datasets.find((d) => d.id === widget.datasetId) || datasets[0];
    const cols = widget.columns?.length ? widget.columns : Object.keys(dataset?.data?.[0] || {}).slice(0, 4);
    const rows = (dataset?.data || []).slice(0, 6);
    return (
      <div className="overflow-auto h-full text-sm">
        <table className="w-full">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c} className="text-left font-semibold pb-2 pr-3" style={{ color: palette.muted }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t" style={{ borderColor: palette.border }}>
                {cols.map((c) => (
                  <td key={c} className="py-1.5 pr-3">{String(row[c] ?? '')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="h-full min-h-[180px]">
      <ChartRenderer spec={spec} widget={widget} datasets={datasets} />
    </div>
  );
}
