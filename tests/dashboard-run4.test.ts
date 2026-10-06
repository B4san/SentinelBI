import { describe, expect, it } from 'vitest';
import { prepareChartSeries } from '../src/lib/dashboard/aggregate';
import { nearestComponent, repairCatalogWidgets } from '../src/lib/dashboard/catalog';
import { parseLocalDate, formatLocalDate } from '../src/lib/dashboard/dates';
import { attachComputedFacts, dedupeHeadlines, numbersMatchFacts, rewriteUnverifiedCopy } from '../src/lib/dashboard/facts';
import { computeDerivedValue, formatDuration, proposeDerivedMeasures } from '../src/lib/dashboard/measures';
import { autoTimeGrain, bucketTimeSeries } from '../src/lib/dashboard/timeGrain';
import { shouldSwapAxes, validateDashboardSpec } from '../src/lib/dashboard/validate';
import { renderDashboard } from '../src/entry-server';
import { mockedAiSpec } from '../src/lib/dashboard/mockedAiSpec';
import { SAMPLE_SALES_ROWS, SAMPLE_WEB_ROWS, toDashboardDatasets, createSampleSpace } from '../src/lib/sampleData';
import { buildChatBody } from '../src/lib/ai/openaiCompatible';

const sales = {
  id: 'ds-sales',
  name: 'Sales',
  data: SAMPLE_SALES_ROWS,
  columns: Object.keys(SAMPLE_SALES_ROWS[0] || {}).map((name) => ({ name })),
};

describe('time bucketing', () => {
  it('never truncates a 12-month series to 16 days', () => {
    const buckets = bucketTimeSeries(SAMPLE_SALES_ROWS, 'order_date', 'revenue', 'sum');
    expect(buckets.length).toBeGreaterThan(8);
    expect(buckets.length).toBeLessThanOrEqual(36);
    expect(autoTimeGrain(SAMPLE_SALES_ROWS.map((row) => row.order_date))).toBe('month');
    const series = prepareChartSeries([sales], {
      id: 'c',
      type: 'chart',
      title: 'Monthly revenue trend',
      layout: { x: 0, y: 0, w: 12, h: 6 },
      chartType: 'line',
      xField: 'order_date',
      yField: 'revenue',
    });
    expect(series.length).toBe(buckets.length);
    expect(series.length).not.toBe(16);
  });
});

describe('local dates', () => {
  it('parses YYYY-MM-DD as a calendar date, not UTC', () => {
    const date = parseLocalDate('2025-10-01');
    expect(date?.getDate()).toBe(1);
    expect(date?.getMonth()).toBe(9);
    expect(formatLocalDate('2025-10-01')).not.toMatch(/Sep 30/);
  });
});

describe('derived measures', () => {
  it('proposes ROAS / CVR from web columns and computes a ratio', () => {
    const web = {
      id: 'web',
      name: 'Web',
      data: SAMPLE_WEB_ROWS,
      columns: Object.keys(SAMPLE_WEB_ROWS[0] || {}).map((name) => ({ name })),
    };
    const proposed = proposeDerivedMeasures(web);
    expect(proposed.some((p) => p.id === 'roas')).toBe(true);
    expect(proposed.some((p) => p.id === 'cvr')).toBe(true);
    const cvr = proposed.find((p) => p.id === 'cvr')!;
    const value = computeDerivedValue(SAMPLE_WEB_ROWS, cvr.measure);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(1);
    expect(formatDuration(121.6)).toBe('2m 02s');
  });
});

describe('axis swap', () => {
  it('swaps a measure-on-x encoding', () => {
    expect(shouldSwapAxes('revenue', 'region', 'horizontal-bar')).toBe(true);
    const spec = validateDashboardSpec({
      title: 'Swap',
      widgets: [{ type: 'chart', chartType: 'horizontal-bar', xField: 'revenue', yField: 'region', title: 'By region' }],
    });
    expect(spec.widgets[0].xField).toBe('region');
    expect(spec.widgets[0].yField).toBe('revenue');
  });
});

describe('computed facts override the model', () => {
  it('ignores a fabricated -3.2% delta', () => {
    const spec = validateDashboardSpec({
      title: 'Sales',
      widgets: [{
        type: 'kpi',
        title: 'Total revenue',
        datasetId: 'ds-sales',
        kpi: { value: '$1', field: 'revenue', aggregation: 'sum', format: 'currency', delta: -3.2 },
      }],
    });
    const next = attachComputedFacts(spec, [sales]);
    expect(next.widgets[0].kpi?.delta).not.toBe(-3.2);
    expect(next.widgets[0].kpi?.delta).toBeDefined();
    expect(Math.abs(next.widgets[0].kpi?.delta || 0)).toBeGreaterThan(1);
  });

  it('rewrites copy that cites unverified numbers', () => {
    const spec = validateDashboardSpec({
      title: 'Sales',
      subtitle: 'Revenue dipped 3.2% in H2',
      narrative: { headline: 'Enterprise +12% YoY', body: '14.6× ROAS' },
      widgets: [{
        type: 'kpi',
        title: 'Total revenue',
        datasetId: 'ds-sales',
        kpi: { value: '', field: 'revenue', aggregation: 'sum', format: 'currency' },
      }, {
        type: 'insight',
        title: 'North leads on revenue',
        insight: { title: 'North leads on revenue', text: 'Enterprise +12% YoY' },
      }],
    });
    const computed = attachComputedFacts(spec, [sales]);
    const verified = rewriteUnverifiedCopy(computed, [sales]);
    expect(verified.subtitle).toBeUndefined();
    expect(verified.narrative?.headline).toBeFalsy();
    expect(verified.narrative?.headline).not.toBe(verified.title);
    expect(verified.widgets.find((w) => w.type === 'insight')?.insight?.text).not.toMatch(/12%/);
  });

  it('dedupes a repeated editorial headline', () => {
    const spec = validateDashboardSpec({
      title: 'Board',
      subtitle: 'North leads on revenue',
      narrative: { headline: 'North leads on revenue', body: 'Body' },
      widgets: [{ type: 'insight', title: 'North leads on revenue', insight: { title: 'North leads on revenue', text: 'A longer finding about mix.' } }],
    });
    const next = dedupeHeadlines(spec);
    expect(next.subtitle).toBeUndefined();
    expect(next.widgets[0].insight?.title).toBeUndefined();
  });
});

describe('catalog repair', () => {
  it('maps unknown components to the nearest catalog entry', () => {
    expect(nearestComponent('arc.mystery-chart', 'chart').id).toBe('arc.bar-chart');
    const spec = validateDashboardSpec({
      title: 'X',
      widgets: [{ type: 'chart', componentId: 'not-real', xField: 'missing', yField: 'also-missing', title: 'Bad' }],
    });
    const repaired = repairCatalogWidgets(spec, [sales]);
    expect(repaired.widgets[0].componentId).toBe('arc.bar-chart');
    expect(repaired.widgets[0].xField === 'order_date' || repaired.widgets[0].yField === 'revenue').toBe(true);
  });
});

describe('SSR viewBox', () => {
  it('emits an SVG viewBox from renderToString', () => {
    const spec = mockedAiSpec([sales]);
    const page = renderDashboard(spec, [sales]);
    expect(page).toMatch(/viewBox="0 0 \d+ \d+"/);
    expect(page).toMatch(/width="100%"/);
    expect(page).toMatch(/dash-plot/);
  });
});

describe('sample scale', () => {
  it('ships hundreds of rows per sample', () => {
    expect(SAMPLE_SALES_ROWS.length).toBe(640);
    expect(SAMPLE_WEB_ROWS.length).toBe(504);
    const finance = createSampleSpace('finance');
    expect(toDashboardDatasets(finance)[0].data.length).toBe(288);
  });
});

describe('max_tokens', () => {
  it('defaults chat completions to 8000 tokens', () => {
    const body = buildChatBody({ model: 'x', messages: [{ role: 'user', content: 'hi' }], json: true });
    expect(body.max_tokens).toBe(8000);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });
});

describe('number verifier', () => {
  it('accepts compact currency that matches computed facts', () => {
    expect(numbersMatchFacts('Revenue is $15.0M', ['$15.0M', '+22.0%'])).toBe(true);
    expect(numbersMatchFacts('Dipped 3.2%', ['$15.0M', '+22.0%'])).toBe(false);
  });
});
