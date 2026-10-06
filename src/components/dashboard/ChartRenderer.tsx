import React, { useEffect, useRef, useState } from 'react';
import type { DashboardDataset, DashboardSpec, DashboardWidget } from '../../lib/dashboard/types';
import { formatMetric, prepareChartSeries } from '../../lib/dashboard/aggregate';
import { formatLocalDate } from '../../lib/dashboard/dates';
import { metricFormat, prettyField } from '../../lib/dashboard/insights';
import { looksLikeDuration } from '../../lib/dashboard/measures';

function usePlotSize(fallback = { w: 800, h: 320 }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr && cr.width > 40 && cr.height > 40) setSize({ w: Math.round(cr.width), h: Math.round(cr.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ...size };
}

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
  const { ref, w, h } = usePlotSize();

  if (data.length === 0) {
    return (
      <div className="h-full min-h-[140px] flex items-center justify-center text-sm" style={{ color: palette.muted }}>
        No points for this encoding. Pick other fields or clear the filter.
      </div>
    );
  }

  if (widget.componentId === 'sbi.small-multiples' || /small multiple/i.test(widget.title)) {
    return (
      <div ref={ref} className="h-full w-full min-h-0">
        <SmallMultiples spec={spec} widget={widget} datasets={datasets} filters={filters} width={w} height={h} />
      </div>
    );
  }

  if (widget.componentId === 'sbi.bullet-variance' || widget.series?.some((s) => s.style === 'target')) {
    return (
      <div ref={ref} className="h-full w-full min-h-0">
        <BulletChart data={data} widget={widget} palette={palette} width={w} height={h} />
      </div>
    );
  }

  if (type === 'treemap' || widget.componentId === 'arc.treemap') {
    return (
      <div ref={ref} className="h-full w-full min-h-0">
        <TreemapSvg data={data} xKey={xKey} yKey={yKey} colors={widget.colors || palette.chart} palette={palette} width={w} height={h} />
      </div>
    );
  }

  if (type === 'pie' || type === 'donut') {
    return (
      <div ref={ref} className="h-full w-full min-h-0">
        <DonutSvg data={data} xKey={xKey} yKey={yKey} colors={widget.colors || palette.chart} donut={type === 'donut'} palette={palette} width={w} height={h} />
      </div>
    );
  }

  const seriesFields = widget.series?.length
    ? widget.series.map((s) => s.field)
    : widget.compare
      ? [yKey, '__compare']
      : [yKey];

  return (
    <div ref={ref} className="h-full w-full min-h-0">
      <Cartesian
        data={data}
        type={type}
        palette={palette}
        color={color}
        xKey={xKey}
        yKey={yKey}
        seriesFields={seriesFields}
        widget={widget}
        width={w}
        height={h}
        onPointClick={onPointClick}
      />
    </div>
  );
}

function Cartesian({
  data,
  type,
  palette,
  color,
  xKey,
  yKey,
  seriesFields,
  widget,
  width,
  height,
  onPointClick,
}: {
  data: Array<Record<string, string | number>>;
  type: string;
  palette: DashboardSpec['theme']['palette'];
  color: string;
  xKey: string;
  yKey: string;
  seriesFields: string[];
  widget: DashboardWidget;
  width: number;
  height: number;
  onPointClick?: (field: string, value: string) => void;
}) {
  const horizontal = type === 'horizontal-bar';
  const labels = data.map((d) => String(d.label || d.name || d[xKey]));
  const longest = labels.reduce((n, l) => Math.max(n, l.length), 0);
  const left = horizontal ? Math.min(160, 12 + longest * 7) : 52;
  const pad = { top: 14, right: 16, bottom: 32, left };
  const innerW = Math.max(40, width - pad.left - pad.right);
  const innerH = Math.max(40, height - pad.top - pad.bottom);
  const numeric = data.map((d) => Number(d[yKey] ?? d.value));
  const yMax = Math.max(...numeric, 0) * 1.12 || 1;
  const yMin = Math.min(0, ...numeric);
  const n = data.length;
  const step = innerW / Math.max(n, 1);
  const fmt = looksLikeDuration(yKey) ? 'duration' : metricFormat(yKey);

  if (type === 'scatter' || type === 'bubble') {
    const xs = data.map((d) => Number(d[xKey]));
    const ys = data.map((d) => Number(d[yKey]));
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    return (
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" className="dash-plot" role="img">
        {gridY(pad, innerW, innerH, yMin, Math.max(...ys, 1), palette, fmt)}
        {data.map((d, i) => {
          const x = pad.left + ((Number(d[xKey]) - xMin) / (xMax - xMin || 1)) * innerW;
          const y = pad.top + innerH - ((Number(d[yKey]) - yMin) / (Math.max(...ys) - yMin || 1)) * innerH;
          return <circle key={i} cx={x} cy={y} r={3.2} fill={color} />;
        })}
      </svg>
    );
  }

  if (type === 'line' || type === 'stepped-line' || type === 'area' || type === 'stacked-area') {
    const paths = seriesFields.map((field, s) => {
      const pts = data.map((d, i) => {
        const x = pad.left + step * i + step / 2;
        const y = pad.top + innerH - ((Number(d[field] ?? 0) - yMin) / (yMax - yMin || 1)) * innerH;
        return { x, y };
      });
      return {
        field,
        color: widget.series?.[s]?.color || palette.chart[s % palette.chart.length],
        pts,
        dashed: widget.series?.[s]?.style === 'dashed' || field === '__compare',
      };
    });
    const first = paths[0];
    const areaId = `area-${widget.id}`;
    const dLine = (pts: Array<{ x: number; y: number }>) => pts.map((p) => `${p.x},${p.y}`).join(' ');
    const area = first
      ? `M ${first.pts[0].x} ${first.pts[0].y} ${first.pts.map((p) => `L ${p.x} ${p.y}`).join(' ')} L ${first.pts[first.pts.length - 1].x} ${pad.top + innerH} L ${first.pts[0].x} ${pad.top + innerH} Z`
      : '';
    return (
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" className="dash-plot" role="img">
        <defs>
          <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {gridY(pad, innerW, innerH, yMin, yMax, palette, fmt)}
        {xTicks(data, pad, innerW, height, palette)}
        {type.includes('area') && <path d={area} fill={`url(#${areaId})`} />}
        {paths.map((p) => (
          <polyline key={p.field} fill="none" stroke={p.color} strokeWidth={2} strokeDasharray={p.dashed ? '6 5' : undefined} points={dLine(p.pts)} />
        ))}
      </svg>
    );
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" className="dash-plot" role="img">
      {horizontal ? null : gridY(pad, innerW, innerH, yMin, yMax, palette, fmt)}
      {data.map((d, i) => {
        const value = Number(d[yKey] ?? d.value);
        if (horizontal) {
          const barH = Math.min(22, innerH / n - 6);
          const y = pad.top + (innerH / n) * i + (innerH / n - barH) / 2;
          const bw = ((value - yMin) / (yMax - yMin || 1)) * innerW;
          return (
            <g key={i} onClick={() => onPointClick?.(xKey, String(d.name || d[xKey]))}>
              <text x={pad.left - 8} y={y + barH / 2 + 4} textAnchor="end" fontSize="12" fill={palette.muted}>{clip(labels[i], 18)}</text>
              <rect x={pad.left} y={y} width={Math.max(1, bw)} height={barH} rx={4} fill={color} />
              <text x={pad.left + bw + 6} y={y + barH / 2 + 4} fontSize="12" fill={palette.text}>{formatMetric(value, fmt)}</text>
            </g>
          );
        }
        const barW = Math.min(36, step * 0.62);
        const x = pad.left + step * i + (step - barW) / 2;
        const bh = ((value - yMin) / (yMax - yMin || 1)) * innerH;
        return (
          <g key={i} onClick={() => onPointClick?.(xKey, String(d.name || d[xKey]))}>
            <rect x={x} y={pad.top + innerH - bh} width={barW} height={Math.max(1, bh)} rx={4} fill={palette.chart[i % palette.chart.length] || color} />
            <text x={x + barW / 2} y={height - 10} textAnchor="middle" fontSize="11" fill={palette.muted}>{clip(labels[i], 12)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function gridY(
  pad: { top: number; left: number },
  innerW: number,
  innerH: number,
  yMin: number,
  yMax: number,
  palette: DashboardSpec['theme']['palette'],
  fmt: string,
) {
  return Array.from({ length: 5 }, (_, i) => {
    const tick = yMin + ((yMax - yMin) * i) / 4;
    const y = pad.top + innerH - ((tick - yMin) / (yMax - yMin || 1)) * innerH;
    return (
      <g key={i}>
        <line x1={pad.left} x2={pad.left + innerW} y1={y} y2={y} stroke={palette.border} strokeDasharray="3 6" />
        <text x={pad.left - 8} y={y + 3} textAnchor="end" fontSize="11" fill={palette.muted}>
          {formatMetric(tick, fmt as 'number')}
        </text>
      </g>
    );
  });
}

function xTicks(
  data: Array<Record<string, string | number>>,
  pad: { left: number; top: number },
  innerW: number,
  height: number,
  palette: DashboardSpec['theme']['palette'],
) {
  const max = Math.min(8, data.length);
  const step = data.length <= max ? 1 : Math.ceil(data.length / max);
  return data.map((d, i) => {
    if (i % step !== 0 && i !== data.length - 1) return null;
    const x = pad.left + (innerW * i) / Math.max(data.length - 1, 1);
    return (
      <text key={i} x={x} y={height - 10} textAnchor="middle" fontSize="11" fill={palette.muted}>
        {prettyTick(String(d.label || d.name || ''))}
      </text>
    );
  });
}

function DonutSvg({
  data,
  xKey,
  yKey,
  colors,
  donut,
  palette,
  width,
  height,
}: {
  data: Array<Record<string, string | number>>;
  xKey: string;
  yKey: string;
  colors: string[];
  donut: boolean;
  palette: DashboardSpec['theme']['palette'];
  width: number;
  height: number;
}) {
  const size = Math.max(160, Math.min(height - 16, width * 0.45));
  const cx = 16 + size / 2;
  const cy = height / 2;
  const r = size / 2 - 8;
  const ir = donut ? r * 0.58 : 0;
  const total = data.reduce((acc, d) => acc + Number(d[yKey] ?? d.value), 0) || 1;
  let angle = -Math.PI / 2;
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
    const mid = (a1 + a2) / 2;
    const labelR = (r + ir) / 2 || r * 0.65;
    return {
      dPath: ir
        ? `M ${p1[0]} ${p1[1]} A ${r} ${r} 0 ${large} 1 ${p2[0]} ${p2[1]} L ${p3[0]} ${p3[1]} A ${ir} ${ir} 0 ${large} 0 ${p4[0]} ${p4[1]} Z`
        : `M ${cx} ${cy} L ${p1[0]} ${p1[1]} A ${r} ${r} 0 ${large} 1 ${p2[0]} ${p2[1]} Z`,
      color: colors[i % colors.length],
      label: String(d[xKey] || d.name),
      value,
      pct: value / total,
      lx: cx + Math.cos(mid) * labelR,
      ly: cy + Math.sin(mid) * labelR,
    };
  });
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" className="dash-plot" role="img">
      {arcs.map((a, i) => <path key={i} d={a.dPath} fill={a.color} />)}
      {donut && (
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="13" fontWeight={600} fill={palette.text}>
          {formatMetric(total, metricFormat(yKey))}
        </text>
      )}
      {arcs.filter((a) => a.pct >= 0.05).map((a) => (
        <text key={a.label} x={a.lx} y={a.ly} textAnchor="middle" fontSize="11" fill={palette.text}>
          {(a.pct * 100).toFixed(0)}%
        </text>
      ))}
      {arcs.map((a, i) => (
        <g key={`leg-${a.label}`} transform={`translate(${size + 36}, ${20 + i * 22})`}>
          <rect width="10" height="10" rx="2" fill={a.color} />
          <text x="16" y="10" fontSize="12" fill={palette.text}>
            {a.label} · {formatMetric(a.value, metricFormat(yKey))} · {(a.pct * 100).toFixed(0)}%
          </text>
        </g>
      ))}
    </svg>
  );
}

function squarify(items: Array<{ name: string; value: number; color: string }>, x: number, y: number, w: number, h: number) {
  const total = items.reduce((acc, i) => acc + i.value, 0) || 1;
  const rects: Array<{ x: number; y: number; w: number; h: number; item: typeof items[0] }> = [];
  let cx = x;
  let cy = y;
  let rw = w;
  let rh = h;
  let vertical = w > h;
  let acc = 0;
  const flush = (slice: typeof items, start: number) => {
    const sliceTotal = slice.reduce((s, i) => s + i.value, 0) || 1;
    if (vertical) {
      const colW = (sliceTotal / (total - start + sliceTotal)) * rw;
      let yy = cy;
      for (const item of slice) {
        const hh = (item.value / sliceTotal) * rh;
        rects.push({ x: cx, y: yy, w: colW, h: hh, item });
        yy += hh;
      }
      cx += colW;
      rw -= colW;
    } else {
      const rowH = (sliceTotal / (total - start + sliceTotal)) * rh;
      let xx = cx;
      for (const item of slice) {
        const ww = (item.value / sliceTotal) * rw;
        rects.push({ x: xx, y: cy, w: ww, h: rowH, item });
        xx += ww;
      }
      cy += rowH;
      rh -= rowH;
    }
    vertical = rw > rh;
    return sliceTotal;
  };
  let row: typeof items = [];
  for (const item of items) {
    row.push(item);
    acc += item.value;
    if (row.length >= 2 && acc / total > 0.28) {
      flush(row, acc);
      row = [];
    }
  }
  if (row.length) flush(row, acc);
  return rects;
}

function TreemapSvg({
  data,
  xKey,
  yKey,
  colors,
  palette,
  width,
  height,
}: {
  data: Array<Record<string, string | number>>;
  xKey: string;
  yKey: string;
  colors: string[];
  palette: DashboardSpec['theme']['palette'];
  width: number;
  height: number;
}) {
  const items = data.map((d, i) => ({
    name: String(d[xKey] || d.name),
    value: Math.max(0, Number(d[yKey] ?? d.value)),
    color: colors[i % colors.length],
  })).filter((i) => i.value > 0);
  const rects = squarify(items, 8, 8, width - 16, height - 16);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" className="dash-plot" role="img">
      {rects.map((r) => (
        <g key={r.item.name}>
          <rect x={r.x} y={r.y} width={Math.max(0, r.w - 2)} height={Math.max(0, r.h - 2)} rx={6} fill={r.item.color} opacity={0.9} />
          {r.w > 56 && r.h > 28 && (
            <>
              <text x={r.x + 8} y={r.y + 18} fontSize="12" fontWeight={600} fill="#fff">{clip(r.item.name, 14)}</text>
              <text x={r.x + 8} y={r.y + 34} fontSize="11" fill="#fff">{formatMetric(r.item.value, metricFormat(yKey))}</text>
            </>
          )}
        </g>
      ))}
      <title>{palette.label}</title>
    </svg>
  );
}

function BulletChart({
  data,
  widget,
  palette,
  width,
  height,
}: {
  data: Array<Record<string, string | number>>;
  widget: DashboardWidget;
  palette: DashboardSpec['theme']['palette'];
  width: number;
  height: number;
}) {
  const actualKey = widget.yField || widget.series?.find((s) => s.style !== 'target')?.field || 'value';
  const targetKey = widget.targetField || widget.series?.find((s) => s.style === 'target')?.field;
  const rows = data.slice(0, 8);
  const max = Math.max(...rows.map((d) => Math.max(Number(d[actualKey] ?? d.value), targetKey ? Number(d[targetKey] ?? 0) : 0)), 1);
  const rowH = height / Math.max(rows.length, 1);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" className="dash-plot" role="img">
      {rows.map((d, i) => {
        const actual = Number(d[actualKey] ?? d.value);
        const target = targetKey ? Number(d[targetKey] ?? 0) : 0;
        const y = i * rowH + 8;
        const bar = (actual / max) * (width - 140);
        const tx = (target / max) * (width - 140);
        const variance = target ? actual - target : 0;
        return (
          <g key={i}>
            <text x={8} y={y + 14} fontSize="12" fill={palette.muted}>{clip(String(d.name || d[widget.xField || 'name']), 14)}</text>
            <rect x={120} y={y + 4} width={Math.max(1, bar)} height={12} rx={3} fill={palette.chart[0]} />
            {targetKey && <line x1={120 + tx} x2={120 + tx} y1={y} y2={y + 20} stroke={palette.text} strokeWidth={2} />}
            <text x={width - 8} y={y + 14} textAnchor="end" fontSize="11" fill={variance < 0 ? '#e11d48' : '#059669'}>
              {formatMetric(variance, metricFormat(actualKey))}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function SmallMultiples({
  spec,
  widget,
  datasets,
  filters,
  width,
  height,
}: {
  spec: DashboardSpec;
  widget: DashboardWidget;
  datasets: DashboardDataset[];
  filters?: DashboardSpec['filters'];
  width: number;
  height: number;
}) {
  const facet = widget.groupField;
  const dataset = datasets.find((d) => d.id === widget.datasetId) || datasets[0];
  const values = facet && dataset
    ? [...new Set(dataset.data.map((row) => String(row[facet] ?? '')).filter(Boolean))].slice(0, 6)
    : [];
  const panels = values.length ? values : ['All'];
  const cols = Math.min(3, panels.length);
  const rows = Math.ceil(panels.length / cols);
  const pw = width / cols;
  const ph = height / rows;
  const series = panels.map((value) => prepareChartSeries(datasets, {
    ...widget,
    componentId: 'arc.line-chart',
    filter: value === 'All' ? widget.filter : { field: facet || '', op: 'equals', value },
  }, filters));
  const yMax = Math.max(...series.flat().map((d) => Number(d.value || 0)), 1);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" className="dash-plot" role="img">
      {panels.map((value, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const x0 = c * pw;
        const y0 = r * ph;
        const pts = series[i];
        const step = (pw - 24) / Math.max(pts.length, 1);
        const line = pts.map((d, p) => {
          const x = x0 + 12 + step * p + step / 2;
          const y = y0 + 22 + (ph - 36) - (Number(d.value || 0) / yMax) * (ph - 36);
          return `${x},${y}`;
        }).join(' ');
        return (
          <g key={value}>
            <text x={x0 + 10} y={y0 + 14} fontSize="11" fill={spec.theme.palette.muted}>{value}</text>
            <polyline fill="none" stroke={spec.theme.palette.chart[i % spec.theme.palette.chart.length]} strokeWidth={1.6} points={line} />
          </g>
        );
      })}
    </svg>
  );
}

function prettyTick(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return formatLocalDate(value);
  return value.length > 12 ? `${value.slice(0, 11)}…` : value;
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

void prettyField;
