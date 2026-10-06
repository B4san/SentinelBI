import PptxGenJS from 'pptxgenjs';
import { computeKpiStats, prepareChartSeries } from '../dashboard/aggregate';
import { prepareTableModel } from '../dashboard/table';
import type { DashboardDataset, DashboardSpec, DashboardWidget } from '../dashboard/types';
import type { ExecutiveReportDoc } from '../report/types';

function chartKind(widget: DashboardWidget): 'bar' | 'line' | 'pie' | 'doughnut' | 'area' {
  const t = widget.chartType || '';
  if (t.includes('line')) return 'line';
  if (t.includes('area')) return 'area';
  if (t === 'donut') return 'doughnut';
  if (t === 'pie') return 'pie';
  return 'bar';
}

function seriesFor(widget: DashboardWidget, datasets: DashboardDataset[]) {
  const rows = prepareChartSeries(datasets, widget).slice(0, 12);
  const labels = rows.map((row) => String(row.label || row.name || ''));
  const yKey = widget.series?.[0]?.field || widget.yField || 'value';
  const values = rows.map((row) => Number(row[yKey] ?? row.value ?? 0));
  return { labels, values, name: widget.title };
}

export async function buildNativePptx(opts: {
  spec: DashboardSpec;
  datasets: DashboardDataset[];
  report?: { summary?: string; source?: string; fallbackReason?: string } | ExecutiveReportDoc | null;
}): Promise<ArrayBuffer> {
  const { spec, datasets, report } = opts;
  const pres = new PptxGenJS();
  pres.defineLayout({ name: 'SBI', width: 13.333, height: 7.5 });
  pres.layout = 'SBI';
  const accent = spec.theme.palette.accent || '1E40AF';
  const text = spec.theme.palette.text || '0F172A';
  const muted = spec.theme.palette.muted || '475569';
  const hex = (value: string) => value.replace('#', '');

  const title = pres.addSlide();
  title.addShape('rect', { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: hex(accent) } });
  title.addText(spec.title, { x: 0.7, y: 2.2, w: 12, fontSize: 32, bold: true, color: hex(text), fontFace: 'Calibri' });
  title.addText(spec.subtitle || spec.narrative?.headline || 'Operations review', {
    x: 0.7, y: 3.1, w: 12, fontSize: 16, color: hex(muted), fontFace: 'Calibri',
  });
  title.addText(new Date().toLocaleDateString(), { x: 0.7, y: 6.7, w: 12, fontSize: 12, color: hex(muted) });

  if (report && ('markdown' in report ? report.markdown : report.summary)) {
    const summary = pres.addSlide();
    summary.addText('Executive summary', { x: 0.6, y: 0.35, w: 12, fontSize: 22, bold: true, color: hex(text) });
    const body = String(('markdown' in report ? report.markdown : report.summary) || '')
      .replace(/[#>*`]/g, '')
      .slice(0, 1800);
    summary.addText(body, { x: 0.6, y: 1.0, w: 12.1, h: 5.8, fontSize: 14, color: hex(text), valign: 'top' });
    if ('source' in report && report.source === 'fallback') {
      summary.addText(`Template fallback: ${'fallbackReason' in report ? report.fallbackReason : ''}`, {
        x: 0.6, y: 6.9, w: 12, fontSize: 11, color: hex(accent),
      });
    }
  }

  for (const widget of spec.widgets) {
    if (widget.type === 'section') continue;
    const slide = pres.addSlide();
    slide.addText(widget.title, { x: 0.5, y: 0.3, w: 12.3, fontSize: 20, bold: true, color: hex(text) });
    if (widget.subtitle) {
      slide.addText(widget.subtitle, { x: 0.5, y: 0.75, w: 12.3, fontSize: 12, color: hex(muted) });
    }

    if (widget.type === 'kpi') {
      const stats = computeKpiStats(datasets, widget);
      slide.addText(stats.value, { x: 0.5, y: 2.2, w: 12, fontSize: 54, bold: true, color: hex(accent) });
      if (stats.trend) slide.addText(stats.trend, { x: 0.5, y: 4.2, w: 12, fontSize: 16, color: hex(muted) });
      continue;
    }

    if (widget.type === 'insight') {
      slide.addText(widget.insight?.text || widget.subtitle || '', {
        x: 0.5, y: 1.4, w: 12.2, h: 5, fontSize: 18, color: hex(text), valign: 'top',
      });
      continue;
    }

    if (widget.type === 'table') {
      const model = prepareTableModel(datasets, widget);
      const rows = [
        model.columns.map((c) => ({ text: c, options: { bold: true } })),
        ...model.rows.slice(0, 12).map((row) => model.columns.map((c) => ({ text: String(row[c] ?? '') }))),
      ];
      if (rows[0]?.length) {
        slide.addTable(rows, {
          x: 0.5, y: 1.2, w: 12.3, h: 5.6,
          border: { pt: 0.5, color: hex(spec.theme.palette.border || 'D7E0EA') },
          fontFace: 'Calibri',
          fontSize: 11,
          color: hex(text),
          align: 'left',
        });
      }
      continue;
    }

    const series = seriesFor(widget, datasets);
    if (series.labels.length >= 1 && series.values.some((n) => Number.isFinite(n))) {
      const kind = chartKind(widget);
      slide.addChart(kind, [
        { name: series.name, labels: series.labels, values: series.values },
      ], {
        x: 0.5,
        y: 1.15,
        w: 12.3,
        h: 5.7,
        showLegend: false,
        chartColors: spec.theme.palette.chart.map(hex),
        chartArea: { fill: { color: hex(spec.theme.palette.surface || 'FFFFFF') } },
      });
    } else {
      slide.addText('No points for this encoding.', { x: 0.5, y: 3, w: 12, fontSize: 14, color: hex(muted) });
    }
  }

  const out = await pres.write({ outputType: 'arraybuffer' });
  return out as ArrayBuffer;
}
