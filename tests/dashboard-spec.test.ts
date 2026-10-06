import { describe, expect, it } from 'vitest';
import { applyFilter, formatMetric, prepareChartSeries, computeKpiValue } from '../src/lib/dashboard/aggregate';
import { ARCHETYPE_SLOTS, slotsForArchetype } from '../src/lib/dashboard/archetypes';
import { buildBusinessKpis, buildFallbackDashboard, varyWidget } from '../src/lib/dashboard/fallback';
import { deltaColor, inferMetricPolarity, isDeltaFavorable, isFillerKpi, isFillerMetricName } from '../src/lib/dashboard/metrics';
import { PALETTES } from '../src/lib/dashboard/palettes';
import { createRng, hashString, makeSeed } from '../src/lib/dashboard/seed';
import { LAYOUT_ARCHETYPES } from '../src/lib/dashboard/types';
import { extractJsonObject, fromLegacyLayout, sanitizeGrid, validateDashboardSpec } from '../src/lib/dashboard/validate';
import { analyzeDataset, classifyFields } from '../src/lib/dashboard/insights';
import { SAMPLE_SALES_ROWS, SAMPLE_WEB_ROWS } from '../src/lib/sampleData';

const salesDataset = {
  id: 'ds-sales',
  name: 'Sales',
  data: SAMPLE_SALES_ROWS as unknown as Record<string, unknown>[],
  columns: [
    { name: 'date', type: 'date' },
    { name: 'region', type: 'categorical' },
    { name: 'revenue', type: 'numeric' },
  ],
};

describe('dashboard spec validation', () => {
  it('fills missing fields and clamps grid positions', () => {
    const spec = validateDashboardSpec({
      title: 'Ops',
      archetype: 'not-real',
      theme: { palette: { id: 'ocean', background: 'red', chart: ['#111111', '#222222', '#333333'] } },
      widgets: [
        {
          type: 'chart',
          title: 'Revenue',
          xAxisField: 'region',
          yAxisField: 'revenue',
          layout: { x: 99, y: -4, w: 40, h: 1 },
        },
      ],
    });

    expect(spec.version).toBe(1);
    expect(spec.archetype).toBe('command-center');
    expect(spec.theme.palette.background).toBe(PALETTES[0].background);
    expect(spec.theme.palette.chart[0]).toBe('#111111');
    expect(spec.widgets[0].layout.w).toBeLessThanOrEqual(12);
    expect(spec.widgets[0].layout.x + spec.widgets[0].layout.w).toBeLessThanOrEqual(12);
    expect(spec.widgets[0].layout.h).toBeGreaterThanOrEqual(2);
    expect(spec.widgets[0].xField).toBe('region');
  });

  it('upgrades legacy KPI/chart templates', () => {
    const spec = fromLegacyLayout({
      title: 'Legacy',
      fontFamily: 'font-mono',
      kpis: [{ label: 'Revenue', value: '$1', trend: '+2%' }],
      charts: [{ title: 'By region', type: 'bar', xAxisField: 'region', yAxisField: 'revenue', color: '#2563eb' }],
    });
    expect(spec.widgets.some((w) => w.type === 'kpi')).toBe(true);
    expect(spec.widgets.some((w) => w.type === 'chart' && w.chartType === 'bar')).toBe(true);
    expect(spec.theme.fontFamily).toBe('font-mono');
  });

  it('extracts JSON from fenced model output', () => {
    const parsed = extractJsonObject('```json\n{"title":"A","widgets":[]}\n```') as { title: string };
    expect(parsed.title).toBe('A');
  });

  it('sanitizes impossible grid values', () => {
    const grid = sanitizeGrid({ x: -2, y: 3, w: 20, h: 0 }, { x: 0, y: 0, w: 6, h: 4 });
    expect(grid.x).toBeGreaterThanOrEqual(0);
    expect(grid.w).toBe(12);
    expect(grid.h).toBeGreaterThanOrEqual(2);
  });
});

describe('fallback generation variety', () => {
  it('emits a different archetype and palette for different seeds', () => {
    const a = buildFallbackDashboard({ datasets: [salesDataset], seed: 11, title: 'A' });
    const b = buildFallbackDashboard({ datasets: [salesDataset], seed: 99, title: 'B' });
    expect(LAYOUT_ARCHETYPES).toContain(a.archetype);
    expect(a.widgets.length).toBeGreaterThan(3);
    expect(a.widgets[0].layout.w).toBeGreaterThan(0);
    const sameLook = a.archetype === b.archetype && a.theme.palette.id === b.theme.palette.id && a.theme.fontFamily === b.theme.fontFamily;
    expect(sameLook).toBe(false);
  });

  it('has a slot map for every archetype', () => {
    for (const archetype of LAYOUT_ARCHETYPES) {
      expect(ARCHETYPE_SLOTS[archetype].length).toBeGreaterThan(3);
    }
  });

  it('varies a single widget without dropping its id', () => {
    const spec = buildFallbackDashboard({ datasets: [salesDataset], seed: 5, archetype: 'command-center' });
    const chart = spec.widgets.find((w) => w.type === 'chart');
    expect(chart).toBeTruthy();
    const next = varyWidget(chart!, [salesDataset], 42);
    expect(next.id).toBe(chart!.id);
  });
});

describe('aggregation and filters', () => {
  it('groups chart series and formats KPIs from real rows', () => {
    const series = prepareChartSeries([salesDataset], {
      id: 'c1',
      type: 'chart',
      title: 'Rev',
      layout: { x: 0, y: 0, w: 6, h: 4 },
      xField: 'region',
      yField: 'revenue',
      aggregation: 'sum',
    });
    expect(series.length).toBeGreaterThan(1);
    expect(series.every((row) => typeof row.value === 'number')).toBe(true);

    const kpi = computeKpiValue([salesDataset], {
      id: 'k1',
      type: 'kpi',
      title: 'Revenue',
      layout: { x: 0, y: 0, w: 3, h: 3 },
      kpi: { value: '', field: 'revenue', aggregation: 'sum', format: 'currency' },
    });
    expect(kpi.startsWith('$')).toBe(true);
  });

  it('applies widget filters', () => {
    const filtered = applyFilter(SAMPLE_SALES_ROWS as unknown as Record<string, unknown>[], {
      field: 'region',
      op: 'equals',
      value: 'North',
    });
    expect(filtered.every((row) => row.region === 'North')).toBe(true);
  });

  it('formats compact metrics', () => {
    expect(formatMetric(12500, 'number')).toBe('12.5K');
    expect(formatMetric(2_400_000, 'currency')).toBe('$2.4M');
  });
});

describe('insight engine', () => {
  it('does not treat dates as winning categories', () => {
    const findings = analyzeDataset(salesDataset);
    const blob = findings.map((f) => `${f.title} ${f.text}`).join(' ');
    expect(blob).not.toMatch(/leads Date/i);
    expect(blob).not.toMatch(/1 observations/i);
    expect(findings[0].text.length).toBeGreaterThan(24);
    expect(classifyFields(salesDataset).time).toContain('date');
    expect(classifyFields(salesDataset).dimensions).not.toContain('date');
  });

  it('surfaces trend and cohort findings for sales data', () => {
    const findings = analyzeDataset(salesDataset);
    const kinds = findings.map((f) => f.kind);
    expect(kinds.some((k) => k === 'top' || k === 'trend' || k === 'share')).toBe(true);
    expect(findings.every((f) => /[.!]$/.test(f.text.trim()) || f.text.includes('%'))).toBe(true);
  });
});

describe('fallback quality', () => {
  it('emits compact KPIs with computed values and no nonsense copy', () => {
    const spec = buildFallbackDashboard({ datasets: [salesDataset], seed: 21, archetype: 'hero-kpi-rail', mode: 'light' });
    const kpis = spec.widgets.filter((w) => w.type === 'kpi');
    expect(kpis.every((w) => w.layout.h >= 2)).toBe(true);
    expect(kpis.every((w) => w.layout.w >= 3)).toBe(true);
    expect(kpis.some((w) => w.role === 'hero' && w.layout.h >= 3)).toBe(true);
    expect(kpis.some((w) => w.kpi?.sparkline && w.kpi.sparkline.length >= 3)).toBe(true);
    const insights = spec.widgets.filter((w) => w.type === 'insight').map((w) => w.insight?.text || '');
    expect(insights.join(' ')).not.toMatch(/leads Date/i);
    expect(insights.join(' ')).not.toMatch(/observations/i);
    const maxY = Math.max(...spec.widgets.map((w) => w.layout.y + w.layout.h));
    for (let y = 0; y < maxY; y++) {
      const covered = spec.widgets
        .filter((w) => w.layout.y <= y && y < w.layout.y + w.layout.h)
        .reduce((sum, w) => sum + w.layout.w, 0);
      expect(covered).toBe(12);
    }
  });

  it('keeps archetypes compositionally distinct', () => {
    const sales = buildFallbackDashboard({ datasets: [salesDataset], seed: 3, archetype: 'hero-kpi-rail', mode: 'light' });
    const editorial = buildFallbackDashboard({ datasets: [salesDataset], seed: 3, archetype: 'editorial', mode: 'light' });
    const mosaic = buildFallbackDashboard({ datasets: [salesDataset], seed: 3, archetype: 'metric-mosaic', mode: 'light' });
    const compare = buildFallbackDashboard({ datasets: [salesDataset], seed: 3, archetype: 'comparison', mode: 'light' });
    const analytical = buildFallbackDashboard({ datasets: [salesDataset], seed: 3, archetype: 'command-center', mode: 'light' });
    expect(sales.widgets[0].type).toBe('kpi');
    expect(sales.widgets[0].role).toBe('hero');
    expect(editorial.widgets[0].type).toBe('section');
    expect(editorial.widgets.some((w) => w.type === 'insight' && w.role === 'featured')).toBe(true);
    expect(analytical.widgets[0].type).toBe('chart');
    const mosaicKpis = mosaic.widgets.filter((w) => w.type === 'kpi');
    expect(mosaicKpis.length).toBeGreaterThanOrEqual(3);
    const mosaicSizes = new Set(mosaicKpis.map((w) => `${w.layout.w}x${w.layout.h}`));
    expect(mosaicSizes.size).toBeGreaterThan(1);
    const pair = compare.widgets.filter((w) => w.role === 'compare-a' || w.role === 'compare-b');
    expect(pair.length).toBeGreaterThanOrEqual(2);
    const compareCharts = pair.filter((w) => w.type === 'chart');
    expect(compareCharts[0].xField).not.toBe(compareCharts[1].xField);
  });

  it('builds a usable board for web analytics', () => {
    const webDataset = {
      id: 'ds-web',
      name: 'Web',
      data: SAMPLE_WEB_ROWS as unknown as Record<string, unknown>[],
      columns: [
        { name: 'date', type: 'date' },
        { name: 'channel', type: 'categorical' },
        { name: 'sessions', type: 'numeric' },
      ],
    };
    const spec = buildFallbackDashboard({ datasets: [webDataset], seed: 8, archetype: 'command-center', mode: 'dark' });
    expect(spec.theme.palette.mode).toBe('dark');
    expect(spec.widgets.some((w) => w.type === 'chart' && w.xField === 'date')).toBe(true);
    expect(spec.narrative?.body).not.toMatch(/leads Date/i);
  });
});

describe('metric polarity', () => {
  it('infers lower-is-better from cost, risk, and friction names', () => {
    for (const name of ['bounce', 'Bounce Rate', 'churn', 'CAC', 'customer acquisition cost', 'latency', 'errors', 'refunds', 'attrition', 'ad spend']) {
      expect(inferMetricPolarity(name)).toBe('lower-is-better');
    }
    for (const name of ['revenue', 'sessions', 'conversions', 'profit', 'ROI']) {
      expect(inferMetricPolarity(name)).toBe('higher-is-better');
    }
  });

  it('colors an increase red when lower is better', () => {
    expect(isDeltaFavorable(12, 'lower-is-better')).toBe(false);
    expect(isDeltaFavorable(-8, 'lower-is-better')).toBe(true);
    expect(isDeltaFavorable(12, 'higher-is-better')).toBe(true);
    expect(deltaColor(12, 'lower-is-better')).toBe('#e11d48');
    expect(deltaColor(-8, 'lower-is-better')).toBe('#059669');
    expect(deltaColor(12, 'higher-is-better')).toBe('#059669');
  });

  it('stamps polarity on fallback KPIs, including web bounce', () => {
    const webDataset = {
      id: 'ds-web',
      name: 'Web',
      data: SAMPLE_WEB_ROWS as unknown as Record<string, unknown>[],
      columns: [
        { name: 'date', type: 'date' },
        { name: 'channel', type: 'categorical' },
        { name: 'bounce', type: 'numeric' },
        { name: 'sessions', type: 'numeric' },
      ],
    };
    const spec = buildFallbackDashboard({ datasets: [webDataset], seed: 4, archetype: 'metric-mosaic', mode: 'light' });
    const bounce = spec.widgets.find((w) => w.type === 'kpi' && /bounce/i.test(`${w.title} ${w.yField} ${w.kpi?.field || ''}`));
    expect(bounce).toBeTruthy();
    expect(bounce?.kpi?.polarity || bounce?.polarity).toBe('lower-is-better');
    const revenue = spec.widgets.find((w) => w.type === 'kpi' && /revenue|session/i.test(`${w.title} ${w.yField}`));
    expect(revenue?.kpi?.polarity || revenue?.polarity).toBe('higher-is-better');
    const inferred = validateDashboardSpec({
      title: 'Polarity',
      widgets: [{ type: 'kpi', title: 'Bounce rate', yField: 'bounce', kpi: { value: '41%' } }],
    });
    expect(inferred.widgets[0].polarity).toBe('lower-is-better');
    expect(inferred.widgets[0].kpi?.polarity).toBe('lower-is-better');
  });
});

describe('filler KPI filtering', () => {
  it('treats meta counts as filler', () => {
    expect(isFillerMetricName('Rows loaded')).toBe(true);
    expect(isFillerMetricName('Channels')).toBe(true);
    expect(isFillerMetricName('Devices')).toBe(true);
    expect(isFillerMetricName('number of channels')).toBe(true);
    expect(isFillerMetricName('Active cohorts')).toBe(true);
    expect(isFillerMetricName('revenue')).toBe(false);
    expect(isFillerKpi({ title: 'Rows loaded', aggregation: 'count', kpi: { value: '10' } })).toBe(true);
    expect(isFillerKpi({ title: 'Total revenue', yField: 'revenue', aggregation: 'sum', kpi: { value: '$1', field: 'revenue' } })).toBe(false);
  });

  it('never emits filler KPIs in fallback boards', () => {
    const webDataset = {
      id: 'ds-web',
      name: 'Web',
      data: SAMPLE_WEB_ROWS as unknown as Record<string, unknown>[],
      columns: [
        { name: 'date', type: 'date' },
        { name: 'channel', type: 'categorical' },
        { name: 'device', type: 'categorical' },
        { name: 'sessions', type: 'numeric' },
      ],
    };
    const kpis = buildBusinessKpis(webDataset);
    expect(kpis.every((k) => !isFillerMetricName(k.title))).toBe(true);
    for (const archetype of LAYOUT_ARCHETYPES) {
      const spec = buildFallbackDashboard({ datasets: [webDataset], seed: 8, archetype, mode: 'light' });
      const titles = spec.widgets.filter((w) => w.type === 'kpi').map((w) => w.title);
      expect(titles.join(' | ')).not.toMatch(/rows loaded|number of|active cohorts|^channels$|^devices$/i);
      expect(spec.widgets.filter((w) => w.type === 'kpi').every((w) => !isFillerKpi(w))).toBe(true);
    }
  });

  it('uses fewer larger cards when measures are scarce', () => {
    const thin = {
      id: 'thin',
      name: 'Thin',
      data: [{ date: '2026-01-01', revenue: 10 }, { date: '2026-01-02', revenue: 12 }],
      columns: [{ name: 'date', type: 'date' }, { name: 'revenue', type: 'numeric' }],
    };
    const spec = buildFallbackDashboard({ datasets: [thin], seed: 1, archetype: 'metric-mosaic' });
    const kpis = spec.widgets.filter((w) => w.type === 'kpi');
    expect(kpis.length).toBeLessThanOrEqual(3);
    expect(kpis.some((w) => w.layout.w >= 6)).toBe(true);
    expect(kpis.every((w) => !isFillerKpi(w))).toBe(true);
  });
});

describe('archetype openings', () => {
  it('does not open every layout with four equal KPI tiles', () => {
    const featured: Array<(typeof LAYOUT_ARCHETYPES)[number]> = [
      'hero-kpi-rail',
      'editorial',
      'command-center',
      'metric-mosaic',
      'comparison',
    ];
    const signatures = featured.map((archetype) => {
      const spec = buildFallbackDashboard({ datasets: [salesDataset], seed: 3, archetype, mode: 'light' });
      const first = spec.widgets[0];
      return `${archetype}:${first.type}:${first.role || ''}:${first.layout.w}x${first.layout.h}`;
    });
    expect(new Set(signatures).size).toBe(5);
    expect(signatures.some((s) => s.startsWith('editorial:section'))).toBe(true);
    expect(signatures.some((s) => s.startsWith('command-center:chart'))).toBe(true);
    expect(signatures.some((s) => s.startsWith('hero-kpi-rail:kpi:hero'))).toBe(true);
    expect(signatures.some((s) => s.startsWith('comparison:kpi:compare-a'))).toBe(true);
    const mosaic = slotsForArchetype('metric-mosaic', 8).filter((s) => s.type === 'kpi');
    expect(new Set(mosaic.map((s) => `${s.layout.w}x${s.layout.h}`)).size).toBeGreaterThan(1);
    const editorialInsight = slotsForArchetype('editorial', 4).find((s) => s.type === 'insight');
    expect(editorialInsight?.layout.h).toBeLessThanOrEqual(5);
  });
});

describe('seeded randomness', () => {
  it('is deterministic', () => {
    const a = createRng(hashString('alpha'));
    const b = createRng(hashString('alpha'));
    expect([a(), a()]).toEqual([b(), b()]);
    expect(makeSeed(['x', 1])).toBe(makeSeed(['x', 1]));
  });
});
