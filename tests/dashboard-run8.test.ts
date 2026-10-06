import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ChartRenderer } from '../src/components/dashboard/ChartRenderer';
import { mapProviderError } from '../src/lib/ai/errors';
import { openaiGenerate } from '../src/lib/ai/openaiCompatible';
import { isDailyFreeQuotaError, isNonGenerativeModel } from '../src/lib/ai/providers';
import { prepareChartSeries } from '../src/lib/dashboard/aggregate';
import { rewriteUnverifiedCopy } from '../src/lib/dashboard/facts';
import { finalizeDashboardSpec } from '../src/lib/dashboard/finalize';
import { generateDashboardOnServer } from '../src/lib/dashboard/generate';
import { collidingPairs } from '../src/lib/dashboard/layout';
import { EXAMPLE_SPECS } from '../src/lib/dashboard/prompt';
import { prepareTableModel } from '../src/lib/dashboard/table';
import { validateDashboardSpec } from '../src/lib/dashboard/validate';
import { SAMPLE_FINANCE_ROWS, SAMPLE_SALES_ROWS, SAMPLE_WEB_ROWS } from '../src/lib/sampleData';
import salesALive from './fixtures/sales-a-light.json';
import salesBLive from './fixtures/sales-b-light.json';
import webLive from './fixtures/web-light.json';
import financeLive from './fixtures/finance-light.json';

const sales = {
  id: 'ds-sales',
  name: 'Sales',
  data: SAMPLE_SALES_ROWS,
  columns: Object.keys(SAMPLE_SALES_ROWS[0] || {}).map((name) => ({ name })),
};

const web = {
  id: 'ds-web',
  name: 'Web',
  data: SAMPLE_WEB_ROWS,
  columns: Object.keys(SAMPLE_WEB_ROWS[0] || {}).map((name) => ({ name })),
};

const finance = {
  id: 'ds-finance',
  name: 'Finance',
  data: SAMPLE_FINANCE_ROWS,
  columns: Object.keys(SAMPLE_FINANCE_ROWS[0] || {}).map((name) => ({ name })),
};

describe('prior-period compare gaps', () => {
  it('emits null, not 0, for months without prior-period data', () => {
    const series = prepareChartSeries([sales], {
      id: 'trend',
      type: 'chart',
      title: 'Revenue trend with prior-period compare',
      layout: { x: 0, y: 0, w: 12, h: 6 },
      xField: 'order_date',
      yField: 'revenue',
      compare: 'previous-period',
      measure: { field: 'revenue', agg: 'sum', format: 'currency' },
    });
    expect(series.length).toBeGreaterThan(4);
    const half = Math.floor(series.length / 2);
    expect(series.slice(0, half).every((row) => row.__compare == null)).toBe(true);
    expect(series.slice(half).some((row) => row.__compare != null && Number(row.__compare) > 0)).toBe(true);
    expect(series.slice(0, half).every((row) => Number(row.__compare) !== 0 || row.__compare == null)).toBe(true);
  });
});

describe('scatter and conversion-rate encodings', () => {
  it('draws scatter ticks from the same domain as the points', () => {
    const spec = validateDashboardSpec(salesBLive);
    const widget = spec.widgets.find((w) => w.chartType === 'scatter')!;
    const points = prepareChartSeries([sales], widget);
    const ys = points.map((row) => Number(row[widget.yField || 'gross_margin']));
    expect(Math.max(...ys)).toBeLessThan(0.7);
    const html = renderToStaticMarkup(createElement(ChartRenderer, { spec, widget, datasets: [sales] }));
    expect(html).not.toMatch(/>100\.0%</);
    expect(html).toMatch(/%/);
    expect(html).toMatch(/Discount rate|discount_rate/i);
    expect(html).toMatch(/Gross margin|gross_margin/i);
  });

  it('keeps conversion-rate bars as percents instead of rounding to 0', () => {
    const spec = validateDashboardSpec(webLive);
    const widget = spec.widgets.find((w) => /conversion rate by device/i.test(w.title))!;
    const series = prepareChartSeries([web], widget);
    expect(series.every((row) => Number(row.value) > 0 && Number(row.value) < 1)).toBe(true);
    const html = renderToStaticMarkup(createElement(ChartRenderer, { spec, widget, datasets: [web] }));
    expect(html).not.toMatch(/>0<\/text>/);
    expect(html).toMatch(/%/);
  });
});

describe('weighted table rates', () => {
  it('matches the KPI gross margin instead of averaging group avgs', () => {
    const spec = finalizeDashboardSpec(validateDashboardSpec(salesBLive), [sales]);
    const table = spec.widgets.find((w) => w.type === 'table')!;
    const model = prepareTableModel([sales], table);
    const total = model.rawRows.find((row) => String(row[model.columns[0]]).toLowerCase() === 'total');
    expect(Number(total?.gross_margin)).toBeGreaterThan(0.26);
    expect(Number(total?.gross_margin)).toBeLessThan(0.29);
    const kpi = spec.widgets.find((w) => /gross margin/i.test(w.title));
    expect(kpi?.kpi?.value).toMatch(/27\.\d%/);
    expect(String(model.rows[model.rows.length - 1].gross_margin)).toMatch(/27\.\d%/);
  });
});

describe('collision-free layout', () => {
  it('packs example specs and stored live AI specs without overlapping cards', () => {
    const cases: Array<{ spec: unknown; data: typeof sales }> = [
      { spec: EXAMPLE_SPECS.editorial, data: sales },
      { spec: EXAMPLE_SPECS['command-center'], data: finance },
      { spec: salesALive, data: sales },
      { spec: salesBLive, data: sales },
      { spec: webLive, data: web },
      { spec: financeLive, data: finance },
    ];
    for (const item of cases) {
      const packed = finalizeDashboardSpec(validateDashboardSpec(item.spec), [item.data]);
      expect(collidingPairs(packed.widgets), packed.title).toEqual([]);
      expect(packed.widgets.length).toBeGreaterThan(3);
    }
  });
});

describe('copy and model retry polish', () => {
  it('replaces placeholder insight copy at finalize time', () => {
    const spec = finalizeDashboardSpec(validateDashboardSpec(salesBLive), [sales]);
    const insight = spec.widgets.find((w) => w.type === 'insight');
    const blob = `${insight?.title || ''} ${insight?.insight?.text || ''} ${spec.narrative?.headline || ''} ${spec.subtitle || ''}`;
    expect(blob).not.toMatch(/Server will replace this with a computed fact/i);
    expect(spec.narrative?.headline || '').not.toBe(spec.title);
    const sentences = (insight?.insight?.text || '').split(/(?<=\.)\s+/).filter(Boolean);
    expect(sentences.length).toBeGreaterThan(0);
  });

  it('treats placeholder-only copy as unverified even without numbers', () => {
    const spec = rewriteUnverifiedCopy(validateDashboardSpec({
      title: 'Sales',
      narrative: { headline: 'Sales', body: 'Server will replace this with a computed fact.' },
      widgets: [{ type: 'insight', insight: { text: 'Server will replace this with a computed fact.' } }],
    }), [sales]);
    expect(spec.narrative?.headline).toBeFalsy();
    expect(spec.widgets[0].insight?.text).not.toMatch(/Server will replace/i);
  });

  it('does not retry a daily free-models quota 429', async () => {
    expect(isDailyFreeQuotaError('free-models-per-day')).toBe(true);
    const err = mapProviderError({ status: 429, body: 'free-models-per-day', provider: 'openrouter' });
    expect(err.retryable).toBe(false);
    expect(err.message).toMatch(/resets daily/i);
    const fetchImpl = vi.fn(async () => ({
      status: 429,
      headers: { get: () => '1' },
      text: async () => JSON.stringify({ error: { message: 'free-models-per-day' } }),
    }));
    await expect(openaiGenerate({
      provider: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'openrouter/free',
      apiKey: 'k',
      stream: false,
      compatible: 'openai',
      extraHeaders: {},
      source: { baseUrl: 'provider', model: 'provider', apiKey: 'user' },
    }, [{ role: 'user', content: 'hi' }], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retries: 2,
      rateLimitWaitMs: 5,
    })).rejects.toMatchObject({ status: 429 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries after a non-generative content-safety model', async () => {
    expect(isNonGenerativeModel('nvidia/nemotron-3.5-content-safety:free')).toBe(true);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let calls = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes('/models')) {
        return { status: 200, text: async () => JSON.stringify({ data: [{ id: 'x' }] }) };
      }
      calls += 1;
      if (calls === 1) {
        return {
          status: 200,
          text: async () => JSON.stringify({
            model: 'nvidia/nemotron-3.5-content-safety:free',
            choices: [{ message: { content: 'SAFE' } }],
          }),
        };
      }
      return {
        status: 200,
        text: async () => JSON.stringify({
          model: 'google/gemma-2-9b-it:free',
          choices: [{ message: { content: JSON.stringify({ title: 'Hijacked', widgets: [{ type: 'kpi', title: 'Revenue', measure: { field: 'revenue', agg: 'sum', format: 'currency' } }] }) } }],
        }),
      };
    });
    const result = await generateDashboardOnServer({
      title: 'Northstar Revenue',
      datasets: [sales],
      seed: 4,
      apiKey: 'k',
      provider: 'openai',
      model: 'x',
      baseUrl: 'https://api.openai.com/v1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }, { AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k' });
    expect(result.source).toBe('ai');
    expect(result.spec.generatedBy).toBe('google/gemma-2-9b-it:free');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
