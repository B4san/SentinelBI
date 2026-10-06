import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFallbackDashboard } from '../src/lib/dashboard/fallback';
import { buildNativePdf, countPdfPages, extractPdfText } from '../src/lib/export/pdfNative';
import { buildNativePptx } from '../src/lib/export/pptxNative';
import { SAMPLE_SALES_ROWS } from '../src/lib/sampleData';

const sales = {
  id: 'ds-sales',
  name: 'Sales',
  data: SAMPLE_SALES_ROWS,
  columns: Object.keys(SAMPLE_SALES_ROWS[0] || {}).map((name) => ({ name })),
};

const artifacts = process.env.OUT_DIR || '/opt/cursor/artifacts';

describe('native PPTX and PDF exports', () => {
  const spec = buildFallbackDashboard({
    title: 'Northstar Revenue',
    intent: 'Regional revenue',
    datasets: [sales],
    seed: 17,
    archetype: 'command-center',
    mode: 'light',
  });
  const report = {
    summary: 'Executive summary: revenue is concentrated. Completeness is computed on loaded rows.',
    source: 'fallback' as const,
    fallbackReason: 'No API key',
    markdown: '# Executive Intelligence Report\n\n## 1. Executive Summary\nRevenue concentration is computed from loaded rows.',
  };

  it('embeds native chart XML in the pptx, not a dashboard screenshot', async () => {
    const buffer = await buildNativePptx({ spec, datasets: [sales], report });
    const latin = Buffer.from(buffer).toString('latin1');
    expect(latin).toMatch(/ppt\/charts\/chart\d+\.xml/);
    expect(latin).not.toMatch(/html-to-image/);
    mkdirSync(artifacts, { recursive: true });
    writeFileSync(path.join(artifacts, 'northstar-native.pptx'), Buffer.from(buffer));
  });

  it('writes a paginated PDF with selectable text and more than one page', () => {
    const buffer = buildNativePdf({
      spec,
      datasets: [sales],
      reportText: report.markdown,
    });
    const pages = countPdfPages(buffer);
    expect(pages).toBeGreaterThan(1);
    const text = extractPdfText(buffer);
    expect(text).toMatch(/Northstar Revenue|Executive report/i);
    expect(text).toMatch(/Page 1 of/);
    mkdirSync(artifacts, { recursive: true });
    writeFileSync(path.join(artifacts, 'northstar-native.pdf'), Buffer.from(buffer));
  });
});
