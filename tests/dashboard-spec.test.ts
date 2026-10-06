import { describe, expect, it } from 'vitest';
import { applyFilter, formatMetric, prepareChartSeries, computeKpiValue } from '../src/lib/dashboard/aggregate';
import { ARCHETYPE_SLOTS } from '../src/lib/dashboard/archetypes';
import { buildFallbackDashboard, varyWidget } from '../src/lib/dashboard/fallback';
import { PALETTES } from '../src/lib/dashboard/palettes';
import { createRng, hashString, makeSeed } from '../src/lib/dashboard/seed';
import { LAYOUT_ARCHETYPES } from '../src/lib/dashboard/types';
import { extractJsonObject, fromLegacyLayout, sanitizeGrid, validateDashboardSpec } from '../src/lib/dashboard/validate';
import { SAMPLE_SALES_ROWS } from '../src/lib/sampleData';

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

describe('seeded randomness', () => {
  it('is deterministic', () => {
    const a = createRng(hashString('alpha'));
    const b = createRng(hashString('alpha'));
    expect([a(), a()]).toEqual([b(), b()]);
    expect(makeSeed(['x', 1])).toBe(makeSeed(['x', 1]));
  });
});
