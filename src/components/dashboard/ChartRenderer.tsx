import React, { useLayoutEffect, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { D3Visual } from '../D3Visual';
import type { DashboardSpec, DashboardWidget } from '../../lib/dashboard/types';
import type { DashboardDataset } from '../../lib/dashboard/types';
import { formatMetric, prepareChartSeries } from '../../lib/dashboard/aggregate';
import { looksLikeTime, metricFormat, prettyField, prettyValue } from '../../lib/dashboard/insights';

const D3_TYPES = new Set([
  'force', 'network', 'chord', 'arc', 'radial', 'spider', 'pack', 'circle-pack',
  'treemap', 'tree', 'dendrogram', 'sankey', 'hierarchy', 'heatmap', 'calendar',
  'matrix', 'dot-plot', 'swarm', 'distribution',
]);

function widthFromGrid(el: HTMLElement, cols: number): number {
  const item = el.closest('.dash-grid > *') as HTMLElement | null;
  if (item && item.clientWidth > 80) {
    return Math.max(160, Math.round(item.clientWidth - 28));
  }
  const grid = el.closest('.dash-grid') as HTMLElement | null;
  if (grid && cols > 0) {
    const styles = getComputedStyle(grid);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || '14') || 14;
    const inner = grid.clientWidth - gap * 11;
    return Math.max(160, Math.round((inner / 12) * cols + gap * Math.max(0, cols - 1) - 28));
  }
  return Math.round(el.getBoundingClientRect().width);
}

function heightFromCell(el: HTMLElement): number {
  let node: HTMLElement | null = el;
  while (node) {
    const raw = getComputedStyle(node).getPropertyValue('--dash-cell-h');
    if (raw) {
      const cell = Number.parseFloat(raw);
      if (cell > 0) {
        const header = el.parentElement?.previousElementSibling instanceof HTMLElement
          ? el.parentElement.previousElementSibling.getBoundingClientRect().height
          : 44;
        return Math.max(120, Math.round(cell - header - 20));
      }
    }
    node = node.parentElement;
  }
  return 0;
}

function usePlotBox(cols: number): [React.RefObject<HTMLDivElement | null>, { width: number; height: number }] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const measuredW = Math.round(el.getBoundingClientRect().width);
      const measuredH = Math.round(el.getBoundingClientRect().height);
      const parentH = Math.round(el.parentElement?.getBoundingClientRect().height || 0);
      const width = Math.max(measuredW, widthFromGrid(el, cols));
      const height = Math.max(measuredH, parentH, heightFromCell(el));
      if (width > 0 || height > 0) {
        setBox((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
      }
    };
    update();
    const later = window.setTimeout(update, 80);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    const grid = el.closest('.dash-grid');
    if (grid) ro.observe(grid);
    return () => {
      window.clearTimeout(later);
      ro.disconnect();
    };
  }, [cols]);

  return [ref, box];
}

function formatTick(value: unknown, field?: string): string {
  const raw = String(value ?? '');
  if (field && looksLikeTime(field, [raw])) return prettyValue(raw);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return prettyValue(raw);
  return raw.length > 14 ? `${raw.slice(0, 13)}…` : raw;
}

function formatAxisNumber(value: number, field?: string): string {
  return formatMetric(value, metricFormat(field));
}

export function ChartRenderer({
  spec,
  widget,
  datasets,
  height,
}: {
  spec: DashboardSpec;
  widget: DashboardWidget;
  datasets: DashboardDataset[];
  height?: number;
}) {
  const [boxRef, box] = usePlotBox(widget.layout?.w || 6);
  const plotWidth = box.width;
  const plotHeight = Math.max(140, height || box.height || widget.layout.h * 56);
  const palette = spec.theme.palette;
  const data = prepareChartSeries(datasets, widget, spec.filters);
  const type = widget.chartType || 'bar';
  const color = widget.color || palette.chart[0];
  const xKey = widget.xField || 'name';
  const yKey = widget.yField || 'value';

  if (data.length === 0) {
    return (
      <div className="h-full min-h-[140px] flex items-center justify-center text-sm" style={{ color: palette.muted }}>
        No points for this encoding. Pick other fields or clear the filter.
      </div>
    );
  }

  if (D3_TYPES.has(type)) {
    return (
      <D3Visual
        data={data}
        config={{
          type,
          title: widget.title,
          xAxisField: xKey,
          yAxisField: yKey,
          color,
          groupField: widget.groupField,
          sizeField: widget.sizeField,
        }}
      />
    );
  }

  const tooltipStyle = {
    backgroundColor: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: '10px',
    color: palette.text,
    boxShadow: '0 12px 28px -16px rgba(15,23,42,0.35)',
    fontSize: 12,
  };

  const tooltip = (
    <Tooltip
      contentStyle={tooltipStyle}
      formatter={(value) => [formatAxisNumber(Number(value), widget.yField), prettyField(yKey)]}
      labelFormatter={(label) => formatTick(label, xKey)}
    />
  );

  const grid = <CartesianGrid stroke={palette.border} strokeDasharray="3 6" vertical={false} />;

  let chart: React.ReactNode = null;
  if (plotWidth >= 80) {
    if (['pie', 'donut'].includes(type)) {
      chart = (
        <PieChart width={plotWidth} height={plotHeight}>
          <Pie
            data={data}
            dataKey={yKey}
            nameKey={xKey}
            cx="50%"
            cy="46%"
            innerRadius={type === 'donut' ? '52%' : 0}
            outerRadius="74%"
            paddingAngle={type === 'donut' ? 2 : 1}
            isAnimationActive={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={(widget.colors || palette.chart)[i % (widget.colors || palette.chart).length]} />
            ))}
          </Pie>
          {tooltip}
          <Legend
            verticalAlign="bottom"
            height={28}
            formatter={(value) => formatTick(value, xKey)}
            wrapperStyle={{ fontSize: 11, color: palette.muted }}
          />
        </PieChart>
      );
    } else if (['scatter', 'bubble'].includes(type)) {
      chart = (
        <ScatterChart width={plotWidth} height={plotHeight} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
          {grid}
          <XAxis dataKey={xKey} stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatTick(v, xKey)} />
          <YAxis dataKey={yKey} stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => formatAxisNumber(Number(v), widget.yField)} />
          {tooltip}
          <Scatter data={data} fill={color} isAnimationActive={false} />
        </ScatterChart>
      );
    } else if (['line', 'stepped-line'].includes(type)) {
      chart = (
        <LineChart width={plotWidth} height={plotHeight} data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
          {grid}
          <XAxis dataKey={xKey} stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatTick(v, xKey)} minTickGap={10} />
          <YAxis stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => formatAxisNumber(Number(v), widget.yField)} />
          {tooltip}
          <Line type={type === 'stepped-line' ? 'stepAfter' : 'monotone'} dataKey={yKey} name={prettyField(yKey)} stroke={color} strokeWidth={palette.mode === 'dark' ? 2.6 : 2.25} dot={false} isAnimationActive={false} />
        </LineChart>
      );
    } else if (['area', 'stacked-area'].includes(type)) {
      const gradId = `fill-${widget.id}`;
      chart = (
        <AreaChart width={plotWidth} height={plotHeight} data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={palette.mode === 'dark' ? 0.5 : 0.4} />
              <stop offset="95%" stopColor={color} stopOpacity={palette.mode === 'dark' ? 0.08 : 0.02} />
            </linearGradient>
          </defs>
          {grid}
          <XAxis dataKey={xKey} stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatTick(v, xKey)} minTickGap={10} />
          <YAxis stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => formatAxisNumber(Number(v), widget.yField)} />
          {tooltip}
          <Area type="monotone" dataKey={yKey} name={prettyField(yKey)} stroke={color} fill={`url(#${gradId})`} strokeWidth={palette.mode === 'dark' ? 2.7 : 2.4} isAnimationActive={false} />
        </AreaChart>
      );
    } else {
      chart = (
        <BarChart
          width={plotWidth}
          height={plotHeight}
          data={data}
          layout={type === 'horizontal-bar' ? 'vertical' : 'horizontal'}
          margin={{ top: 8, right: 12, left: type === 'horizontal-bar' ? 8 : 4, bottom: 4 }}
        >
          {grid}
          {type === 'horizontal-bar' ? (
            <>
              <XAxis type="number" stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatAxisNumber(Number(v), widget.yField)} />
              <YAxis type="category" dataKey={xKey} stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} width={88} tickFormatter={(v) => formatTick(v, xKey)} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatTick(v, xKey)} minTickGap={10} />
              <YAxis stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => formatAxisNumber(Number(v), widget.yField)} />
            </>
          )}
          {tooltip}
          <Bar dataKey={yKey} name={prettyField(yKey)} fill={color} radius={type === 'horizontal-bar' ? [0, 6, 6, 0] : [6, 6, 0, 0]} isAnimationActive={false} maxBarSize={data.length <= 4 ? 56 : 40} />
        </BarChart>
      );
    }
  }

  return (
    <div ref={boxRef} className="w-full h-full min-w-0 min-h-0" style={{ width: '100%', height: '100%' }}>
      {chart}
    </div>
  );
}
