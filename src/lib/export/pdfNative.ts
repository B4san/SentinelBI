import { jsPDF } from 'jspdf';
import { computeKpiStats, prepareChartSeries } from '../dashboard/aggregate';
import { prepareTableModel } from '../dashboard/table';
import type { DashboardDataset, DashboardSpec, DashboardWidget } from '../dashboard/types';

function wrap(pdf: jsPDF, text: string, x: number, y: number, maxW: number, lineH: number): number {
  const lines = pdf.splitTextToSize(text, maxW);
  pdf.text(lines, x, y);
  return y + lines.length * lineH;
}

function wrapPaged(pdf: jsPDF, spec: DashboardSpec, text: string, x: number, y: number, maxW: number, lineH: number): number {
  const lines = pdf.splitTextToSize(text, maxW) as string[];
  let cursor = y;
  for (const line of lines) {
    cursor = ensureSpace(pdf, spec, cursor, lineH + 2);
    pdf.text(line, x, cursor);
    cursor += lineH;
  }
  return cursor;
}

function pageDecor(pdf: jsPDF, spec: DashboardSpec, page: number, total: number) {
  const w = pdf.internal.pageSize.getWidth();
  const h = pdf.internal.pageSize.getHeight();
  pdf.setFillColor(30, 64, 175);
  pdf.rect(0, 0, w, 8, 'F');
  pdf.setFontSize(8);
  pdf.setTextColor(255, 255, 255);
  pdf.text(spec.title, 12, 5.5);
  pdf.setFillColor(15, 23, 42);
  pdf.rect(0, h - 8, w, 8, 'F');
  pdf.setTextColor(226, 232, 240);
  pdf.text(`Page ${page} of ${total}`, w - 12, h - 3, { align: 'right' });
}

function ensureSpace(pdf: jsPDF, spec: DashboardSpec, y: number, need: number): number {
  const h = pdf.internal.pageSize.getHeight();
  if (y + need < h - 14) return y;
  pdf.addPage();
  return 16;
}

function drawBars(pdf: jsPDF, x: number, y: number, w: number, h: number, labels: string[], values: number[]) {
  const max = Math.max(...values, 1);
  const gap = 4;
  const barW = Math.min(18, (w - gap * labels.length) / Math.max(labels.length, 1));
  pdf.setDrawColor(215, 224, 234);
  pdf.setFillColor(30, 64, 175);
  values.forEach((value, i) => {
    const bh = (value / max) * (h - 14);
    const bx = x + i * (barW + gap);
    pdf.rect(bx, y + (h - 14) - bh, barW, Math.max(1, bh), 'F');
    pdf.setFontSize(6);
    pdf.setTextColor(71, 85, 105);
    pdf.text(String(labels[i]).slice(0, 8), bx, y + h - 2, { angle: 40 });
  });
}

function drawLine(pdf: jsPDF, x: number, y: number, w: number, h: number, values: number[]) {
  const max = Math.max(...values, 1);
  const min = Math.min(0, ...values);
  pdf.setDrawColor(30, 64, 175);
  pdf.setLineWidth(0.6);
  values.forEach((value, i) => {
    if (i === 0) return;
    const x1 = x + ((i - 1) / Math.max(values.length - 1, 1)) * w;
    const x2 = x + (i / Math.max(values.length - 1, 1)) * w;
    const y1 = y + h - ((values[i - 1] - min) / (max - min || 1)) * h;
    const y2 = y + h - ((value - min) / (max - min || 1)) * h;
    pdf.line(x1, y1, x2, y2);
  });
}

export function buildNativePdf(opts: {
  spec: DashboardSpec;
  datasets: DashboardDataset[];
  reportText?: string;
}): ArrayBuffer {
  const { spec, datasets, reportText } = opts;
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageW = pdf.internal.pageSize.getWidth();
  let y = 16;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.setTextColor(15, 23, 42);
  y = wrap(pdf, spec.title, 12, y, pageW - 24, 8);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(71, 85, 105);
  y = wrap(pdf, spec.subtitle || spec.narrative?.headline || '', 12, y + 2, pageW - 24, 5.5) + 4;

  if (reportText) {
    y = ensureSpace(pdf, spec, y, 40);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(15, 23, 42);
    y = wrap(pdf, 'Executive report', 12, y, pageW - 24, 6) + 2;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    const clean = reportText.replace(/[#>*`]/g, '');
    y = wrapPaged(pdf, spec, clean.slice(0, 6000), 12, y, pageW - 24, 5) + 6;
  }

  const widgets = spec.widgets.filter((w) => w.type !== 'section');
  for (const widget of widgets) {
    const blockH = widget.type === 'kpi' ? 28 : widget.type === 'table' ? 50 : 62;
    y = ensureSpace(pdf, spec, y, blockH);
    pdf.setDrawColor(215, 224, 234);
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(10, y, pageW - 20, blockH - 4, 3, 3, 'S');
    const innerY = y + 8;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(15, 23, 42);
    pdf.text(widget.title, 14, innerY);

    if (widget.type === 'kpi') {
      const stats = computeKpiStats(datasets, widget);
      pdf.setFontSize(22);
      pdf.setTextColor(30, 64, 175);
      pdf.text(stats.value, 14, innerY + 12);
      if (stats.trend) {
        pdf.setFontSize(9);
        pdf.setTextColor(71, 85, 105);
        pdf.text(stats.trend, 14, innerY + 18);
      }
    } else if (widget.type === 'table') {
      const model = prepareTableModel(datasets, widget);
      pdf.setFontSize(8);
      pdf.setTextColor(15, 23, 42);
      const cols = model.columns.slice(0, 5);
      const colW = (pageW - 28) / Math.max(cols.length, 1);
      cols.forEach((c, i) => pdf.text(c, 14 + i * colW, innerY + 8));
      model.rows.slice(0, 6).forEach((row, r) => {
        cols.forEach((c, i) => pdf.text(String(row[c] ?? '').slice(0, 18), 14 + i * colW, innerY + 14 + r * 5));
      });
    } else if (widget.type === 'chart') {
      const rows = prepareChartSeries(datasets, widget).slice(0, 10);
      const labels = rows.map((row) => String(row.label || row.name || ''));
      const yKey = widget.yField || 'value';
      const values = rows.map((row) => Number(row[yKey] ?? row.value ?? 0));
      if (widget.chartType?.includes('line') || widget.chartType?.includes('area')) {
        drawLine(pdf, 16, innerY + 6, pageW - 36, 40, values);
      } else {
        drawBars(pdf, 16, innerY + 6, pageW - 36, 40, labels, values);
      }
    } else {
      pdf.setFontSize(10);
      pdf.setTextColor(51, 65, 85);
      wrap(pdf, widget.insight?.text || widget.subtitle || '', 14, innerY + 8, pageW - 32, 5);
    }
    y += blockH;
  }

  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    pdf.setPage(i);
    pageDecor(pdf, spec, i, total);
  }
  return pdf.output('arraybuffer');
}

export function extractPdfText(buffer: ArrayBuffer): string {
  const raw = Buffer.from(buffer).toString('latin1');
  const matches = [...raw.matchAll(/\((\\.|[^\\)])*\)\s*Tj/g)].map((m) => m[0]
    .replace(/\)\s*Tj$/, '')
    .replace(/^\(/, '')
    .replace(/\\n/g, '\n')
    .replace(/\\(.)/g, '$1'));
  return matches.join(' ');
}

export function countPdfPages(buffer: ArrayBuffer): number {
  const raw = Buffer.from(buffer).toString('latin1');
  return (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
}
