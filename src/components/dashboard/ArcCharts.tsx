import React from 'react';
import { BarChart } from '../arc/bar-chart/bar-chart';
import { BrushChart } from '../arc/brush-chart/brush-chart';
import { DonutChart } from '../arc/donut-chart/donut-chart';
import { Gauge } from '../arc/gauge/gauge';
import { LineChart } from '../arc/line-chart/line-chart';
import { SlopeChart } from '../arc/slope-chart/slope-chart';
import { Sparkline } from '../arc/sparkline/sparkline';
import { Treemap } from '../arc/treemap/treemap';
import { WaffleChart } from '../arc/waffle-chart/waffle-chart';
import { formatMetric, prepareChartSeries } from '../../lib/dashboard/aggregate';
import { parseLocalDate } from '../../lib/dashboard/dates';
import { metricFormat, prettyField } from '../../lib/dashboard/insights';
import { looksLikeDuration } from '../../lib/dashboard/measures';
import type { DashboardDataset, DashboardSpec, DashboardWidget } from '../../lib/dashboard/types';

type PlotRow = Record<string, string | number | null | undefined>;

function fmtOf(widget: DashboardWidget, yKey: string) {
  return widget.measure?.format || (looksLikeDuration(yKey) ? 'duration' : metricFormat(yKey));
}

function plotNumber(value: number, fmt: string): number {
  if (fmt === 'percent' && Math.abs(value) <= 1.5) return value * 100;
  return value;
}

function formatter(fmt: string) {
  return (value: number) => formatMetric(fmt === 'percent' && Math.abs(value) > 1.5 ? value / 100 : value, fmt as 'number');
}

export function canUseArcChart(widget: DashboardWidget, data: PlotRow[]): boolean {
  const id = widget.componentId || '';
  const type = widget.chartType || '';
  if (type === 'scatter' || type === 'bubble') return false;
  if (id === 'sbi.small-multiples' || id === 'sbi.bullet-variance') return false;
  if (widget.series?.some((s) => s.style === 'target')) return false;
  if (type === 'horizontal-bar') return false;
  if ((type.includes('line') || type.includes('area') || id === 'arc.line-chart' || id === 'arc.brush-chart') && data.some((d) => d.__compare == null && d.__compare !== undefined)) {
    const hasNullCompare = data.some((d) => d.__compare == null);
    const hasCompare = data.some((d) => d.__compare != null);
    if (hasNullCompare && hasCompare) return false;
  }
  if (id === 'arc.gauge' || id === 'arc.sparkline') return true;
  if (id === 'arc.treemap' || type === 'treemap') return true;
  if (id === 'arc.waffle-chart') return true;
  if (id === 'arc.slope-chart' || data.some((d) => d.__start != null)) return true;
  if (id === 'arc.donut-chart' || type === 'donut' || type === 'pie') return true;
  if (id === 'arc.bar-chart' || type === 'bar' || type === 'stacked-bar' || type === 'grouped-bar') return true;
  if (id === 'arc.brush-chart') return true;
  if (id === 'arc.line-chart' || type === 'line' || type === 'stepped-line' || type === 'area' || type === 'stacked-area') return true;
  return false;
}

export function ArcChart({
  spec,
  widget,
  datasets,
  filters = [],
  data,
  height,
  onPointClick,
}: {
  spec: DashboardSpec;
  widget: DashboardWidget;
  datasets: DashboardDataset[];
  filters?: DashboardSpec['filters'];
  data: PlotRow[];
  height: number;
  onPointClick?: (field: string, value: string) => void;
}) {
  const palette = spec.theme.palette;
  const xKey = widget.xField || 'name';
  const yKey = widget.series?.[0]?.field || widget.yField || 'value';
  const fmt = fmtOf(widget, yKey);
  const formatValue = formatter(fmt);
  const plotH = Math.max(140, height - 8);
  const seriesVars = {
    ['--series-1' as string]: widget.color || palette.chart[0],
    ['--series-2' as string]: palette.chart[1] || palette.accent,
    ['--series-3' as string]: palette.chart[2] || palette.muted,
    ['--series-4' as string]: palette.chart[3] || palette.accent,
    ['--accent' as string]: palette.accent,
  } as React.CSSProperties;

  if (widget.componentId === 'arc.waffle-chart') {
    return (
      <div className="h-full w-full min-h-0" style={seriesVars}>
        <WaffleChart
          data={data.map((row) => ({
            key: String(row.label || row.name || row[xKey]),
            label: String(row.label || row.name || row[xKey]),
            value: Math.max(0, Number(row[yKey] ?? row.value ?? 0)),
          }))}
          label={widget.title}
          formatValue={(value) => formatMetric(value, fmt as 'number')}
          legend
        />
      </div>
    );
  }

  if (widget.componentId === 'arc.slope-chart' || data.some((d) => d.__start != null)) {
    return (
      <div className="h-full w-full min-h-0" style={seriesVars}>
        <SlopeChart
          data={data.map((row) => ({
            key: String(row.label || row.name || row[xKey]),
            label: String(row.label || row.name || row[xKey]),
            start: Number(row.__start ?? 0),
            end: Number(row.__end ?? row.value ?? 0),
          }))}
          label={widget.title}
          startLabel="Start"
          endLabel="End"
          formatValue={formatValue}
          height={plotH}
          ranks
        />
      </div>
    );
  }

  if (widget.componentId === 'arc.treemap' || widget.chartType === 'treemap') {
    return (
      <div className="h-full w-full min-h-0" style={seriesVars}>
        <Treemap
          data={{
            id: widget.id,
            label: widget.title,
            children: data.map((row) => ({
              id: String(row.label || row.name || row[xKey]),
              label: String(row.label || row.name || row[xKey]),
              value: Math.max(0, Number(row[yKey] ?? row.value ?? 0)),
            })),
          }}
          label={widget.title}
          formatValue={(value) => formatMetric(value, fmt as 'number')}
          height={plotH}
        />
      </div>
    );
  }

  if (widget.chartType === 'pie' || widget.chartType === 'donut' || widget.componentId === 'arc.donut-chart') {
    return (
      <div className="h-full w-full min-h-0 flex items-center" style={seriesVars}>
        <DonutChart
          data={data.map((row, i) => ({
            key: String(row.label || row.name || row[xKey]),
            label: String(row.label || row.name || row[xKey]),
            value: Math.max(0, Number(row[yKey] ?? row.value ?? 0)),
            color: (widget.colors || palette.chart)[i % (widget.colors || palette.chart).length],
          }))}
          label={widget.title}
          formatValue={(value) => formatMetric(value, fmt as 'number')}
          size={Math.min(240, Math.max(160, plotH))}
          legend
          legendAction="select"
          onActiveChange={(key) => key && onPointClick?.(xKey, key)}
        />
      </div>
    );
  }

  if (widget.componentId === 'arc.brush-chart') {
    const points = data
      .map((row) => {
        const date = parseLocalDate(row[xKey] || row.label);
        return date
          ? { date, value: plotNumber(Number(row[yKey] ?? row.value ?? 0), fmt) }
          : null;
      })
      .filter((row): row is { date: Date; value: number } => Boolean(row));
    if (points.length >= 3) {
      return (
        <div className="h-full w-full min-h-0" style={seriesVars}>
          <BrushChart
            data={points}
            label={widget.title}
            formatValue={formatValue}
            height={Math.max(120, plotH - 48)}
            overviewHeight={36}
          />
        </div>
      );
    }
  }

  if (
    widget.componentId === 'arc.line-chart'
    || widget.chartType === 'line'
    || widget.chartType === 'stepped-line'
    || widget.chartType === 'area'
    || widget.chartType === 'stacked-area'
  ) {
    const seriesFields = widget.series?.length
      ? widget.series.map((s) => s.field)
      : [yKey];
    return (
      <div className="h-full w-full min-h-0" style={seriesVars}>
        <LineChart
          data={data.map((row) => ({
            key: String(row[xKey] || row.label || row.name),
            label: String(row.label || row.name || row[xKey]),
            axisLabel: String(row.label || row.name || '').slice(0, 10),
            values: Object.fromEntries(seriesFields.map((field) => [field, plotNumber(Number(row[field] ?? row.value ?? 0), fmt)])),
          }))}
          series={seriesFields.map((field, i) => ({
            key: field,
            label: prettyField(field),
            color: widget.series?.[i]?.color || palette.chart[i % palette.chart.length],
            dashed: widget.series?.[i]?.style === 'dashed',
            area: i === 0 && (widget.chartType || '').includes('area'),
          }))}
          label={widget.title}
          height={plotH}
          formatValue={formatValue}
          curve={widget.chartType === 'stepped-line' ? 'linear' : 'smooth'}
          categoryLabel={prettyField(xKey)}
        />
      </div>
    );
  }

  return (
    <div className="h-full w-full min-h-0" style={seriesVars}>
      <BarChart
        data={data.map((row) => ({
          key: String(row.label || row.name || row[xKey]),
          label: String(row.label || row.name || row[xKey]),
          axisLabel: String(row.label || row.name || '').slice(0, 8),
          value: plotNumber(Number(row[yKey] ?? row.value ?? 0), fmt),
        }))}
        label={widget.title}
        period={widget.subtitle || 'Current scope'}
        averageLabel="Average"
        valueLabel={prettyField(yKey)}
        categoryLabel={prettyField(xKey)}
        height={Math.max(132, plotH - 28)}
        showAverage
        formatValue={formatValue}
      />
    </div>
  );
}

export function ArcGaugeCard({
  value,
  label,
  detail,
  tone,
}: {
  value: number;
  label: string;
  detail?: string;
  tone?: 'accent' | 'success' | 'warning' | 'danger';
}) {
  const pct = Math.abs(value) <= 1.5 ? value * 100 : value;
  return (
    <div className="h-full w-full flex items-center justify-center p-2">
      <Gauge
        value={pct}
        min={0}
        max={100}
        label={label}
        detail={detail}
        tone={tone || (pct >= 80 ? 'success' : pct >= 50 ? 'accent' : 'warning')}
      />
    </div>
  );
}

export function ArcSparklineStat({
  values,
  label,
  display,
  change,
  tone,
}: {
  values: number[];
  label: string;
  display: string;
  change?: string;
  tone?: 'accent' | 'success' | 'warning' | 'danger';
}) {
  return (
    <Sparkline
      data={values}
      label={label}
      value={display}
      change={change}
      tone={tone || 'accent'}
      area
      interactive
      height={48}
    />
  );
}

export function seriesFromWidget(datasets: DashboardDataset[], widget: DashboardWidget, filters: DashboardSpec['filters'] = []) {
  return prepareChartSeries(datasets, widget, filters);
}
