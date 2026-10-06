import { nearestComponent, repairCatalogWidgets } from './catalog';
import { attachComputedFacts, dedupeHeadlines, rewriteUnverifiedCopy } from './facts';
import { isDerivedMeasure } from './ids';
import { classifyFields, isLowInformationCut, metricFormat, prettyField } from './insights';
import { packDashboardLayout } from './layout';
import { inferAggregation } from './measures';
import { autoTimeGrain } from './timeGrain';
import type { DashboardDataset, DashboardSpec, DashboardWidget } from './types';

function encodingKey(widget: DashboardWidget, datasets: DashboardDataset[]): string {
  const measure = isDerivedMeasure(widget.measure)
    ? `${widget.measure.kind}:${widget.measure.numerator.field}/${widget.measure.denominator.field}`
    : widget.yField || widget.kpi?.field || '';
  const dataset = datasets.find((d) => d.id === widget.datasetId) || datasets[0];
  const grain = widget.xField && dataset
    ? autoTimeGrain((dataset.data || []).map((row) => row[widget.xField!]))
    : '';
  return `${widget.type}:${measure}:${widget.xField || ''}:${grain}:${widget.aggregation || inferAggregation(widget.yField)}`;
}

export function dropDuplicateEncodings(spec: DashboardSpec, datasets: DashboardDataset[]): DashboardSpec {
  const seen = new Set<string>();
  const widgets: DashboardWidget[] = [];
  for (const widget of spec.widgets) {
    if (widget.type !== 'chart') {
      widgets.push(widget);
      continue;
    }
    const key = encodingKey(widget, datasets);
    if (seen.has(key)) continue;
    seen.add(key);
    widgets.push(widget);
  }
  return { ...spec, widgets };
}

export function finalizeDashboardSpec(
  spec: DashboardSpec,
  datasets: DashboardDataset[],
  opts: { verifyCopy?: boolean } = {},
): DashboardSpec {
  const repaired = repairCatalogWidgets(spec, datasets);
  const unique = dropLowInformationCharts(dropDuplicateEncodings(repaired, datasets), datasets);
  const packed = packDashboardLayout(unique, datasets);
  const computed = attachComputedFacts(packed, datasets);
  const verified = opts.verifyCopy === false ? computed : rewriteUnverifiedCopy(computed, datasets);
  return dedupeHeadlines(verified);
}

export function dropLowInformationCharts(spec: DashboardSpec, datasets: DashboardDataset[]): DashboardSpec {
  const widgets: DashboardWidget[] = [];
  for (const widget of spec.widgets) {
    if (widget.type !== 'chart') {
      widgets.push(widget);
      continue;
    }
    if (widget.chartType === 'line' || widget.chartType === 'area' || widget.chartType === 'stepped-line' || (widget.xField && /date|month|week/i.test(widget.xField))) {
      widgets.push(widget);
      continue;
    }
    const dataset = datasets.find((d) => d.id === widget.datasetId) || datasets[0];
    if (!dataset || !isLowInformationCut(dataset.data || [], widget.xField, widget.yField)) {
      widgets.push(widget);
      continue;
    }
    const fields = classifyFields(dataset);
    const yField = widget.yField;
    const xField = widget.xField;
    const altDim = fields.dimensions.find((c) => c !== xField && yField && !isLowInformationCut(dataset.data || [], c, yField));
    const altMeasure = fields.measures.find((n) => n !== yField && xField && !isLowInformationCut(dataset.data || [], xField, n) && metricFormat(n) !== 'percent');
    if (altDim && yField) {
      widgets.push({
        ...widget,
        xField: altDim,
        title: `${prettyField(yField)} by ${prettyField(altDim)}`,
      });
    } else if (altMeasure && xField) {
      widgets.push({
        ...widget,
        yField: altMeasure,
        title: `${prettyField(altMeasure)} by ${prettyField(xField)}`,
      });
    } else if (fields.time[0] && yField) {
      widgets.push({
        ...widget,
        xField: fields.time[0],
        chartType: 'area',
        componentId: nearestComponent(undefined, 'chart', 'area').id,
        title: `${prettyField(yField)} trend`,
      });
    }
  }
  return { ...spec, widgets };
}

export { closeEmptyBands, fillGridGaps, packDashboardLayout, resolveLayoutCollisions } from './layout';
