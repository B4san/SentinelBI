import React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { D3Visual } from '../D3Visual';
import type { DashboardSpec, DashboardWidget } from '../../lib/dashboard/types';
import type { DashboardDataset } from '../../lib/dashboard/types';
import { prepareChartSeries } from '../../lib/dashboard/aggregate';

const D3_TYPES = new Set([
  'force', 'network', 'chord', 'arc', 'radial', 'spider', 'pack', 'circle-pack',
  'treemap', 'tree', 'dendrogram', 'sankey', 'hierarchy', 'heatmap', 'calendar',
  'matrix', 'dot-plot', 'swarm', 'distribution',
]);

export function ChartRenderer({
  spec,
  widget,
  datasets,
}: {
  spec: DashboardSpec;
  widget: DashboardWidget;
  datasets: DashboardDataset[];
}) {
  const palette = spec.theme.palette;
  const data = prepareChartSeries(datasets, widget, spec.filters);
  const type = widget.chartType || 'bar';
  const color = widget.color || palette.chart[0];
  const xKey = widget.xField || 'name';
  const yKey = widget.yField || 'value';

  if (data.length === 0) {
    return (
      <div className="h-full min-h-[160px] flex items-center justify-center text-sm" style={{ color: palette.muted }}>
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
    borderRadius: '12px',
    color: palette.text,
  };

  if (['pie', 'donut'].includes(type)) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey={yKey}
            nameKey={xKey}
            cx="50%"
            cy="50%"
            innerRadius={type === 'donut' ? 58 : 0}
            outerRadius={88}
            paddingAngle={2}
            isAnimationActive={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={(widget.colors || palette.chart)[i % (widget.colors || palette.chart).length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (['scatter', 'bubble'].includes(type)) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <XAxis dataKey={xKey} stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} />
          <YAxis dataKey={yKey} stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} width={36} />
          <Tooltip contentStyle={tooltipStyle} />
          <Scatter data={data} fill={color} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (['line', 'stepped-line'].includes(type)) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <XAxis dataKey={xKey} stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} />
          <YAxis hide />
          <Tooltip contentStyle={tooltipStyle} />
          <Line type={type === 'stepped-line' ? 'stepAfter' : 'monotone'} dataKey={yKey} stroke={color} strokeWidth={3} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (['area', 'stacked-area'].includes(type)) {
    const gradId = `fill-${widget.id}`;
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey={xKey} stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} />
          <YAxis hide />
          <Tooltip contentStyle={tooltipStyle} />
          <Area type="monotone" dataKey={yKey} stroke={color} fill={`url(#${gradId})`} strokeWidth={2.5} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout={type === 'horizontal-bar' ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        {type === 'horizontal-bar' ? (
          <>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey={xKey} stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} width={72} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} />
            <YAxis hide />
          </>
        )}
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey={yKey} fill={color} radius={[8, 8, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
