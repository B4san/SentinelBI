import React from 'react';
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
import { formatMetric, prepareChartSeries } from '../../lib/dashboard/aggregate';
import { looksLikeTime, metricFormat, prettyField, prettyValue } from '../../lib/dashboard/insights';

const D3_TYPES = new Set([
  'force', 'network', 'chord', 'arc', 'radial', 'spider', 'pack', 'circle-pack',
  'treemap', 'tree', 'dendrogram', 'sankey', 'hierarchy', 'heatmap', 'calendar',
  'matrix', 'dot-plot', 'swarm', 'distribution',
]);

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

  if (['pie', 'donut'].includes(type)) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
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
      </ResponsiveContainer>
    );
  }

  if (['scatter', 'bubble'].includes(type)) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
          {grid}
          <XAxis dataKey={xKey} stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatTick(v, xKey)} />
          <YAxis dataKey={yKey} stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => formatAxisNumber(Number(v), widget.yField)} />
          {tooltip}
          <Scatter data={data} fill={color} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (['line', 'stepped-line'].includes(type)) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
          {grid}
          <XAxis dataKey={xKey} stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatTick(v, xKey)} minTickGap={16} />
          <YAxis stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => formatAxisNumber(Number(v), widget.yField)} />
          {tooltip}
          <Line type={type === 'stepped-line' ? 'stepAfter' : 'monotone'} dataKey={yKey} name={prettyField(yKey)} stroke={color} strokeWidth={2.25} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (['area', 'stacked-area'].includes(type)) {
    const gradId = `fill-${widget.id}`;
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.28} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {grid}
          <XAxis dataKey={xKey} stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatTick(v, xKey)} minTickGap={16} />
          <YAxis stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => formatAxisNumber(Number(v), widget.yField)} />
          {tooltip}
          <Area type="monotone" dataKey={yKey} name={prettyField(yKey)} stroke={color} fill={`url(#${gradId})`} strokeWidth={2.25} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout={type === 'horizontal-bar' ? 'vertical' : 'horizontal'}
        margin={{ top: 8, right: 12, left: type === 'horizontal-bar' ? 8 : 4, bottom: 4 }}
      >
        {grid}
        {type === 'horizontal-bar' ? (
          <>
            <XAxis type="number" stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatAxisNumber(Number(v), widget.yField)} />
            <YAxis type="category" dataKey={xKey} stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} width={78} tickFormatter={(v) => formatTick(v, xKey)} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatTick(v, xKey)} interval={0} minTickGap={8} />
            <YAxis stroke={palette.muted} fontSize={11} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => formatAxisNumber(Number(v), widget.yField)} />
          </>
        )}
        {tooltip}
        <Bar dataKey={yKey} name={prettyField(yKey)} fill={color} radius={type === 'horizontal-bar' ? [0, 6, 6, 0] : [6, 6, 0, 0]} isAnimationActive={false} maxBarSize={42} />
      </BarChart>
    </ResponsiveContainer>
  );
}
