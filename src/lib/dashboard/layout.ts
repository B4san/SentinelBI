import { prepareTableModel } from './table';
import type { DashboardDataset, DashboardSpec, DashboardWidget, GridPosition, WidgetFilter } from './types';

export function rectsOverlap(a: GridPosition, b: GridPosition): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function collidingPairs(widgets: DashboardWidget[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < widgets.length; i += 1) {
    for (let j = i + 1; j < widgets.length; j += 1) {
      if (rectsOverlap(widgets[i].layout, widgets[j].layout)) {
        pairs.push([widgets[i].id, widgets[j].id]);
      }
    }
  }
  return pairs;
}

function clampLayout(layout: GridPosition): GridPosition {
  const w = Math.min(12, Math.max(1, Math.round(layout.w) || 1));
  const h = Math.min(16, Math.max(1, Math.round(layout.h) || 1));
  const x = Math.min(12 - w, Math.max(0, Math.round(layout.x) || 0));
  const y = Math.max(0, Math.round(layout.y) || 0);
  return { x, y, w, h };
}

function fits(placed: DashboardWidget[], x: number, y: number, w: number, h: number): boolean {
  const next = { x, y, w, h };
  return placed.every((widget) => !rectsOverlap(widget.layout, next));
}

function firstFit(placed: DashboardWidget[], layout: GridPosition): GridPosition {
  const { w, h } = layout;
  if (fits(placed, layout.x, layout.y, w, h)) return layout;
  for (let y = layout.y; y < layout.y + 80; y += 1) {
    if (fits(placed, layout.x, y, w, h)) return { x: layout.x, y, w, h };
  }
  for (let y = 0; y < 80; y += 1) {
    for (let x = 0; x <= 12 - w; x += 1) {
      if (fits(placed, x, y, w, h)) return { x, y, w, h };
    }
  }
  return { x: 0, y: Math.max(0, ...placed.map((widget) => widget.layout.y + widget.layout.h)), w, h };
}

export function resolveLayoutCollisions(spec: DashboardSpec): DashboardSpec {
  const source = spec.widgets.map((widget, index) => ({
    widget: { ...widget, layout: clampLayout(widget.layout) },
    index,
  }));
  source.sort((a, b) => (
    a.widget.layout.y - b.widget.layout.y
    || a.widget.layout.x - b.widget.layout.x
    || a.index - b.index
  ));
  const placed: DashboardWidget[] = [];
  const byIndex: DashboardWidget[] = new Array(source.length);
  for (const item of source) {
    const layout = firstFit(placed, item.widget.layout);
    const next = { ...item.widget, layout };
    placed.push(next);
    byIndex[item.index] = next;
  }
  return { ...spec, widgets: byIndex.filter(Boolean) };
}

function occupies(widget: DashboardWidget, x: number, y: number): boolean {
  const { layout } = widget;
  return x >= layout.x && x < layout.x + layout.w && y >= layout.y && y < layout.y + layout.h;
}

function regionFree(
  widgets: DashboardWidget[],
  skip: DashboardWidget,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      if (widgets.some((widget) => widget !== skip && occupies(widget, xx, yy))) return false;
    }
  }
  return true;
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
      const widget = row[0];
      if (regionFree(widgets, widget, 0, widget.layout.y, 12, widget.layout.h)) {
        widget.layout.x = 0;
        widget.layout.w = 12;
      }
      continue;
    }
    const last = row[row.length - 1];
    const extra = 12 - (last.layout.x + last.layout.w);
    if (extra > 0 && regionFree(widgets, last, last.layout.x + last.layout.w, last.layout.y, extra, last.layout.h)) {
      last.layout.w += extra;
    }
    if (row[0].layout.x > 0) {
      const lead = row[0].layout.x;
      if (regionFree(widgets, row[0], 0, row[0].layout.y, lead, row[0].layout.h)) {
        row[0].layout.x = 0;
        row[0].layout.w += lead;
      }
    }
  }
  return { ...spec, widgets };
}

export function suggestedTableSpan(
  widget: DashboardWidget,
  datasets: DashboardDataset[],
  extra: WidgetFilter[] = [],
  rowHeight = 56,
  gap = 14,
): number {
  const model = prepareTableModel(datasets, widget, extra);
  const px = 52 + Math.max(1, model.rows.length) * 32;
  const unit = rowHeight + gap;
  return Math.max(widget.layout.h || 3, Math.min(16, Math.ceil(px / unit)));
}

export function sizeTableWidgets(spec: DashboardSpec, datasets: DashboardDataset[]): DashboardSpec {
  return {
    ...spec,
    widgets: spec.widgets.map((widget) => {
      if (widget.type !== 'table') return widget;
      return { ...widget, layout: { ...widget.layout, h: suggestedTableSpan(widget, datasets) } };
    }),
  };
}

export function packDashboardLayout(spec: DashboardSpec, datasets: DashboardDataset[] = []): DashboardSpec {
  const sized = datasets.length ? sizeTableWidgets(spec, datasets) : spec;
  return fillGridGaps(closeEmptyBands(resolveLayoutCollisions(sized)));
}
