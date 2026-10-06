import { repairCatalogWidgets } from './catalog';
import { attachComputedFacts, dedupeHeadlines, rewriteUnverifiedCopy } from './facts';
import { isDerivedMeasure } from './ids';
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
  const unique = fillGridGaps(closeEmptyBands(dropDuplicateEncodings(repaired, datasets)));
  const computed = attachComputedFacts(unique, datasets);
  const verified = opts.verifyCopy === false ? computed : rewriteUnverifiedCopy(computed, datasets);
  return dedupeHeadlines(verified);
}

export function closeEmptyBands(spec: DashboardSpec): DashboardSpec {
  const widgets = spec.widgets.map((widget) => ({ ...widget, layout: { ...widget.layout } }));
  let maxY = Math.max(0, ...widgets.map((w) => w.layout.y + w.layout.h));
  let y = 0;
  while (y < maxY) {
    const covered = widgets.some((w) => w.layout.y <= y && y < w.layout.y + w.layout.h);
    if (covered) {
      y += 1;
      continue;
    }
    let end = y + 1;
    while (end < maxY && !widgets.some((w) => w.layout.y <= end && end < w.layout.y + w.layout.h)) {
      end += 1;
    }
    const gap = end - y;
    for (const widget of widgets) {
      if (widget.layout.y >= end) widget.layout.y -= gap;
    }
    maxY -= gap;
  }
  return { ...spec, widgets };
}

export function fillGridGaps(spec: DashboardSpec): DashboardSpec {
  const widgets = spec.widgets.map((widget) => ({ ...widget, layout: { ...widget.layout } }));
  const maxY = Math.max(0, ...widgets.map((w) => w.layout.y + w.layout.h));
  for (let y = 0; y < maxY; y += 1) {
    const row = widgets
      .filter((w) => w.layout.y <= y && y < w.layout.y + w.layout.h)
      .sort((a, b) => a.layout.x - b.layout.x);
    const covered = row.reduce((sum, w) => sum + w.layout.w, 0);
    if (covered >= 12 || row.length === 0) continue;
    if (row.length === 1) {
      row[0].layout.x = 0;
      row[0].layout.w = 12;
      continue;
    }
    const last = row[row.length - 1];
    last.layout.w = Math.max(2, 12 - last.layout.x);
    if (row[0].layout.x > 0) {
      const extra = row[0].layout.x;
      row[0].layout.x = 0;
      row[0].layout.w += extra;
    }
  }
  return { ...spec, widgets };
}
