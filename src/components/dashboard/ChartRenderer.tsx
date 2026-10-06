import React from 'react';
import type { DashboardDataset, DashboardSpec, DashboardWidget } from '../../lib/dashboard/types';
import { formatMetric, prepareChartSeries } from '../../lib/dashboard/aggregate';
import { formatLocalDate } from '../../lib/dashboard/dates';
import { metricFormat, prettyField } from '../../lib/dashboard/insights';

const VB_W = 800;
const VB_H = 320;
const PAD = { top: 16, right: 16, bottom: 36, left: 56 };

export function ChartRenderer({
  spec,
  widget,
  datasets,
  filters = [],
  onPointClick,
}: {
  spec: DashboardSpec;
  widget: DashboardWidget;
  datasets: DashboardDataset[];
  filters?: DashboardSpec['filters'];
  height?: number;
  onPointClick?: (field: string, value: string) => void;
}) {
  const palette = spec.theme.palette;
  const data = prepareChartSeries(datasets, widget, filters);
  const type = widget.chartType || 'bar';
  const color = widget.color || palette.chart[0];
  const xKey = widget.xField || 'name';
  const yKey = widget.series?.[0]?.field || widget.yField || 'value';

  if (data.length === 0) {
    return (
      <div className="h-full min-h-[140px] flex items-center justify-center text-sm" style={{ color: palette.muted }}>
        No points for this encoding. Pick other fields or clear the filter.
      </div>
    );
  }

  const seriesFields = widget.series?.length
    ? widget.series.map((s) => s.field)
    : widget.compare
      ? [yKey, '__compare']
      : [yKey];
  const innerW = VB_W - PAD.left - PAD.right;
  const innerH = VB_H - PAD.top - PAD.bottom;

  if (type === 'pie' || type === 'donut') {
    return <DonutSvg data={data} xKey={xKey} yKey={yKey} colors={widget.colors || palette.chart} donut={type === 'donut'} />;
  }

  if (type === 'scatter' || type === 'bubble') {
    const xs = data.map((d) => Number(d[xKey]));
    const ys = data.map((d) => Number(d[yKey]));
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    return (
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" className="dash-plot" role="img">
        <Axes xMin={xMin} xMax={xMax} yMin={yMin} yMax={yMax} palette={palette} numericX formatY={yKey} />
        {data.map((d, i) => {
          const x = PAD.left + ((Number(d[xKey]) - xMin) / (xMax - xMin || 1)) * innerW;
          const y = PAD.top + innerH - ((Number(d[yKey]) - yMin) / (yMax - yMin || 1)) * innerH;
          return <circle key={i} cx={x} cy={y} r={3.2} fill={color} />;
        })}
      </svg>
    );
  }

  const numeric = data.map((d) => Number(d[yKey] ?? d.value));
  const yMax = Math.max(...numeric, 0) * 1.08 || 1;
  const yMin = Math.min(0, ...numeric);
  const n = data.length;
  const step = innerW / Math.max(n, 1);

  if (type === 'line' || type === 'stepped-line' || type === 'area' || type === 'stacked-area') {
    const paths = seriesFields.map((field, s) => {
      const pts = data.map((d, i) => {
        const x = PAD.left + step * i + step / 2;
        const y = PAD.top + innerH - ((Number(d[field] ?? 0) - yMin) / (yMax - yMin || 1)) * innerH;
        return `${x},${y}`;
      });
      return { field, color: widget.series?.[s]?.color || palette.chart[s % palette.chart.length], d: pts.join(' '), dashed: widget.series?.[s]?.style === 'dashed' };
    });
    const first = paths[0];
    const area = first
      ? `M ${first.d.split(' ')[0]} L ${first.d.replace(/ /g, ' L ')} L ${PAD.left + step * (n - 1) + step / 2},${PAD.top + innerH} L ${PAD.left + step / 2},${PAD.top + innerH} Z`
      : '';
    return (
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" height="100%" preserveAspectRatio="none" className="dash-plot" role="img">
        <Axes labels={data.map((d) => String(d.label || d.name || d[xKey]))} yMin={yMin} yMax={yMax} palette={palette} formatY={yKey} />
        {type.includes('area') && <path d={area} fill={color} opacity={palette.mode === 'dark' ? 0.28 : 0.16} />}
        {paths.map((p) => (
          <polyline key={p.field} fill="none" stroke={p.color} strokeWidth={2.4} strokeDasharray={p.field === '__compare' || p.dashed ? '6 5' : undefined} points={p.d} />
        ))}
        <Annotations data={data} yKey={yKey} yMin={yMin} yMax={yMax} palette={palette} />
      </svg>
    );
  }

  const horizontal = type === 'horizontal-bar';
  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" height="100%" preserveAspectRatio="none" className="dash-plot" role="img">
      <Axes
        labels={data.map((d) => String(d.name || d[xKey]))}
        yMin={yMin}
        yMax={yMax}
        palette={palette}
        formatY={yKey}
        horizontal={horizontal}
      />
      {data.map((d, i) => {
        const value = Number(d[yKey] ?? d.value);
        if (horizontal) {
          const barH = Math.min(22, innerH / n - 4);
          const y = PAD.top + (innerH / n) * i + (innerH / n - barH) / 2;
          const w = ((value - yMin) / (yMax - yMin || 1)) * innerW;
          return (
            <rect
              key={i}
              x={PAD.left}
              y={y}
              width={Math.max(1, w)}
              height={barH}
              rx={4}
              fill={color}
              onClick={() => onPointClick?.(xKey, String(d.name || d[xKey]))}
            />
          );
        }
        const barW = Math.min(36, step * 0.62);
        const x = PAD.left + step * i + (step - barW) / 2;
        const h = ((value - yMin) / (yMax - yMin || 1)) * innerH;
        return (
          <rect
            key={i}
            x={x}
            y={PAD.top + innerH - h}
            width={barW}
            height={Math.max(1, h)}
            rx={4}
            fill={widget.series?.[0]?.color || palette.chart[i % palette.chart.length] && seriesFields.length === 1 ? color : color}
            onClick={() => onPointClick?.(xKey, String(d.name || d[xKey]))}
          />
        );
      })}
      <Annotations data={data} yKey={yKey} yMin={yMin} yMax={yMax} palette={palette} />
    </svg>
  );
}

function Axes({
  labels,
  xMin,
  xMax,
  yMin = 0,
  yMax = 1,
  palette,
  formatY,
  numericX,
  horizontal,
}: {
  labels?: string[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  palette: DashboardSpec['theme']['palette'];
  formatY?: string;
  numericX?: boolean;
  horizontal?: boolean;
}) {
  const ticks = 4;
  const innerW = VB_W - PAD.left - PAD.right;
  const innerH = VB_H - PAD.top - PAD.bottom;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / ticks);
  const xLabels = numericX
    ? Array.from({ length: 5 }, (_, i) => formatMetric((xMin || 0) + (((xMax || 1) - (xMin || 0)) * i) / 4, metricFormat(formatY)))
    : pickLabels(labels || [], 8);
  return (
    <g>
      {yTicks.map((tick, i) => {
        const y = PAD.top + innerH - ((tick - yMin) / (yMax - yMin || 1)) * innerH;
        return (
          <g key={i}>
            <line x1={PAD.left} x2={PAD.left + innerW} y1={y} y2={y} stroke={palette.border} strokeDasharray="3 6" />
            <text x={PAD.left - 8} y={y + 3} textAnchor="end" fontSize="11" fill={palette.muted}>
              {formatMetric(tick, metricFormat(formatY))}
            </text>
          </g>
        );
      })}
      {xLabels.map((label, i) => {
        const x = PAD.left + (innerW * i) / Math.max(xLabels.length - 1, 1);
        return (
          <text key={i} x={x} y={VB_H - 10} textAnchor="middle" fontSize="11" fill={palette.muted}>
            {prettyTick(label)}
          </text>
        );
      })}
      {horizontal && (labels || []).slice(0, 8).map((label, i) => (
        <text key={label} x={PAD.left - 8} y={PAD.top + (innerH / Math.max(labels!.length, 1)) * i + 12} textAnchor="end" fontSize="11" fill={palette.muted}>
          {prettyTick(label)}
        </text>
      ))}
    </g>
  );
}

function DonutSvg({
  data,
  xKey,
  yKey,
  colors,
  donut,
}: {
  data: Array<Record<string, string | number>>;
  xKey: string;
  yKey: string;
  colors: string[];
  donut: boolean;
}) {
  const total = data.reduce((acc, d) => acc + Number(d[yKey] ?? d.value), 0) || 1;
  let angle = -Math.PI / 2;
  const cx = VB_W / 2;
  const cy = VB_H / 2 - 8;
  const r = 92;
  const ir = donut ? 52 : 0;
  const arcs = data.map((d, i) => {
    const value = Number(d[yKey] ?? d.value);
    const sweep = (value / total) * Math.PI * 2;
    const a1 = angle;
    const a2 = angle + sweep;
    angle = a2;
    const large = sweep > Math.PI ? 1 : 0;
    const p1 = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r];
    const p2 = [cx + Math.cos(a2) * r, cy + Math.sin(a2) * r];
    const p3 = [cx + Math.cos(a2) * ir, cy + Math.sin(a2) * ir];
    const p4 = [cx + Math.cos(a1) * ir, cy + Math.sin(a1) * ir];
    const dPath = ir
      ? `M ${p1[0]} ${p1[1]} A ${r} ${r} 0 ${large} 1 ${p2[0]} ${p2[1]} L ${p3[0]} ${p3[1]} A ${ir} ${ir} 0 ${large} 0 ${p4[0]} ${p4[1]} Z`
      : `M ${cx} ${cy} L ${p1[0]} ${p1[1]} A ${r} ${r} 0 ${large} 1 ${p2[0]} ${p2[1]} Z`;
    return { dPath, color: colors[i % colors.length], label: String(d[xKey] || d.name) };
  });
  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" className="dash-plot" role="img">
      {arcs.map((a, i) => <path key={i} d={a.dPath} fill={a.color} />)}
      {arcs.slice(0, 5).map((a, i) => (
        <text key={a.label} x={20} y={VB_H - 16 - i * 14} fontSize="11" fill="currentColor">{a.label}</text>
      ))}
    </svg>
  );
}

function Annotations({
  data,
  yKey,
  yMin,
  yMax,
  palette,
}: {
  data: Array<Record<string, string | number>>;
  yKey: string;
  yMin: number;
  yMax: number;
  palette: DashboardSpec['theme']['palette'];
}) {
  if (data.length < 2) return null;
  const innerW = VB_W - PAD.left - PAD.right;
  const innerH = VB_H - PAD.top - PAD.bottom;
  const step = innerW / Math.max(data.length, 1);
  let maxI = 0;
  let minI = 0;
  data.forEach((d, i) => {
    const v = Number(d[yKey] ?? d.value);
    if (v > Number(data[maxI][yKey] ?? data[maxI].value)) maxI = i;
    if (v < Number(data[minI][yKey] ?? data[minI].value)) minI = i;
  });
  const point = (i: number) => {
    const v = Number(data[i][yKey] ?? data[i].value);
    return {
      x: PAD.left + step * i + step / 2,
      y: PAD.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH,
    };
  };
  const maxP = point(maxI);
  const minP = point(minI);
  return (
    <g>
      <circle cx={maxP.x} cy={maxP.y} r={4} fill={palette.accent} />
      <circle cx={minP.x} cy={minP.y} r={4} fill={palette.muted} />
    </g>
  );
}

function pickLabels(labels: string[], max: number): string[] {
  if (labels.length <= max) return labels.map((l) => prettyTick(l));
  const step = (labels.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => prettyTick(labels[Math.round(i * step)]));
}

function prettyTick(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return formatLocalDate(value);
  return value.length > 14 ? `${value.slice(0, 13)}…` : value;
}
