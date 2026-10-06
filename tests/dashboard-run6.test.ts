import { describe, expect, it, vi } from 'vitest';
import { generateDashboardHandler } from '../api/dashboards';
import { clearStructuredOutputCache, openaiGenerate } from '../src/lib/ai/openaiCompatible';
import { prepareChartSeries } from '../src/lib/dashboard/aggregate';
import { rangeForPreset } from '../src/components/arc/date-range-picker/date-range-picker';
import { attachComputedFacts, collectBoardFacts, computeWidgetKpi, rewriteUnverifiedCopy, shortInsightTitle } from '../src/lib/dashboard/facts';
import { generateDashboardOnServer } from '../src/lib/dashboard/generate';
import { prettyField } from '../src/lib/dashboard/insights';
import { computeDerivedValue, proposeDerivedMeasures, snapCandidate } from '../src/lib/dashboard/measures';
import { SAMPLE_FINANCE_ROWS, SAMPLE_SALES_ROWS } from '../src/lib/sampleData';
import { validateDashboardSpec } from '../src/lib/dashboard/validate';

const sales = {
  id: 'ds-sales',
  name: 'Sales',
  data: SAMPLE_SALES_ROWS,
  columns: Object.keys(SAMPLE_SALES_ROWS[0] || {}).map((name) => ({ name })),
};

function cfg() {
  return {
    provider: 'openrouter' as const,
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'x',
    apiKey: 'k',
    stream: false,
    compatible: 'openai' as const,
    extraHeaders: {},
    source: { baseUrl: 'provider' as const, model: 'provider' as const, apiKey: 'user' as const },
  };
}

function chatCalls(fetchImpl: { mock: { calls: unknown[][] } }) {
  return fetchImpl.mock.calls.filter((call) => String(call[0]).includes('/chat/completions'));
}

describe('generation route robustness', () => {
  it('retries a 429 at most once and reports 429 in the fallback reason', async () => {
    clearStructuredOutputCache();
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes('/models')) {
        return { status: 200, text: async () => JSON.stringify({ data: [{ id: 'x' }] }) };
      }
      return { status: 429, headers: { get: () => '1' }, text: async () => JSON.stringify({ error: { message: 'Rate limited' } }) };
    });
    const result = await generateDashboardOnServer({
      title: 'Northstar Revenue Command',
      intent: 'revenue',
      datasets: [sales],
      seed: 3,
      apiKey: 'k',
      provider: 'openrouter',
      model: 'x',
      baseUrl: 'https://openrouter.ai/api/v1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      rateLimitWaitMs: 10,
    }, { AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'k', AI_RATE_LIMIT_WAIT_MS: '10' });
    expect(chatCalls(fetchImpl).length).toBeLessThanOrEqual(2);
    expect(result.source).toBe('fallback');
    expect(result.fallbackReason).toMatch(/429/);
    expect(result.spec.title).toBe('Northstar Revenue Command');
    expect(result.spec.widgets.length).toBeGreaterThan(0);
  });

  it('steps down from a 400 json_schema with exactly one schema call', async () => {
    clearStructuredOutputCache();
    let schemaCalls = 0;
    const fetchImpl = vi.fn(async (url: string, init?: { body?: string }) => {
      if (String(url).includes('/models')) {
        return { status: 200, text: async () => JSON.stringify({ data: [{ id: 'x', supported_parameters: ['structured_outputs'] }] }) };
      }
      const body = JSON.parse(init?.body || '{}');
      if (body.response_format?.type === 'json_schema') {
        schemaCalls += 1;
        return { status: 400, text: async () => JSON.stringify({ error: { message: 'response_format not supported' } }) };
      }
      return {
        status: 200,
        text: async () => JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ title: 'Hijacked', widgets: [{ type: 'kpi', title: 'Total revenue', measure: { field: 'revenue', agg: 'sum', format: 'currency' } }] }) } }],
        }),
      };
    });
    const result = await generateDashboardOnServer({
      title: 'Northstar Pricing & Margin Lab',
      datasets: [sales],
      seed: 4,
      apiKey: 'k',
      provider: 'openai',
      model: 'x',
      baseUrl: 'https://api.openai.com/v1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }, { AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k' });
    expect(schemaCalls).toBe(1);
    expect(result.source).toBe('ai');
    expect(result.spec.title).toBe('Northstar Pricing & Margin Lab');
    expect(result.attempts?.some((a) => a.step === 'json_schema' && a.status === 400)).toBe(true);
  });

  it('returns a fallback spec with a timeout reason instead of 504', async () => {
    clearStructuredOutputCache();
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes('/models')) {
        return { status: 200, text: async () => JSON.stringify({ data: [{ id: 'x' }] }) };
      }
      await new Promise((resolve) => setTimeout(resolve, 80));
      return { status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: '{}' } }] }) };
    });
    const req = {
      headers: {},
      body: { datasets: [sales], title: 'Timed', provider: 'openai', model: 'x', baseUrl: 'https://api.openai.com/v1', apiKey: 'k' },
    } as never;
    let status = 200;
    let payload: Record<string, unknown> = {};
    const res = {
      json(body: Record<string, unknown>) { payload = body; return this; },
      status(code: number) { status = code; return this; },
    } as never;
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    try {
      const result = await generateDashboardOnServer({
        title: 'Timed',
        datasets: [sales],
        seed: 1,
        apiKey: 'k',
        provider: 'openai',
        model: 'x',
        baseUrl: 'https://api.openai.com/v1',
        fetchImpl: fetchImpl as unknown as typeof fetch,
        deadlineMs: 30,
      }, { AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k', GENERATE_DEADLINE_MS: '30' });
      expect(result.source).toBe('fallback');
      expect(result.fallbackReason).toMatch(/timed out/i);
      expect(result.spec.widgets.length).toBeGreaterThan(0);
      await generateDashboardHandler(req, res);
    } finally {
      globalThis.fetch = original;
    }
    expect(status).toBe(200);
    expect(payload.spec).toBeTruthy();
  });

  it('does not treat a 429 as a retryable 503 loop', async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 429,
      headers: { get: () => '1' },
      text: async () => JSON.stringify({ error: { message: 'rate' } }),
    }));
    await expect(openaiGenerate(cfg(), [{ role: 'user', content: 'hi' }], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retries: 2,
      rateLimitWaitMs: 5,
    })).rejects.toMatchObject({ status: 429 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('sales numbers', () => {
  it('snaps AOV to revenue / order count near $68.5K', () => {
    const aov = proposeDerivedMeasures(sales).find((p) => p.id === 'aov')!;
    expect(aov.measure?.denominator.agg).toBe('count');
    const raw = computeDerivedValue(SAMPLE_SALES_ROWS, aov.measure!);
    expect(raw).toBeGreaterThan(60000);
    expect(raw).toBeLessThan(75000);
    const spec = attachComputedFacts(validateDashboardSpec({
      title: 'Sales',
      widgets: [{ type: 'kpi', title: 'Average Order Value', measure: { field: 'revenue', agg: 'sum', format: 'currency' } }],
    }), [sales]);
    const kpi = computeWidgetKpi([sales], spec.widgets[0]);
    expect(kpi.raw).toBeGreaterThan(60000);
    expect(kpi.raw).toBeLessThan(75000);
    expect(snapCandidate('AOV', sales)?.id).toBe('aov');
  });

  it('weights gross margin by revenue at 27.7% with +1.6pp H2 vs H1', () => {
    const gm = proposeDerivedMeasures(sales).find((p) => p.id === 'gm')!;
    expect(gm.measure?.kind).toBe('weighted');
    const value = computeDerivedValue(SAMPLE_SALES_ROWS, gm.measure!);
    expect(value).toBeGreaterThan(0.26);
    expect(value).toBeLessThan(0.29);
    const spec = attachComputedFacts(validateDashboardSpec({
      title: 'Sales',
      widgets: [{ type: 'kpi', title: 'Gross margin', yField: 'gross_margin', aggregation: 'avg' }],
    }), [sales]);
    const kpi = computeWidgetKpi([sales], spec.widgets[0]);
    expect(kpi.raw).toBeGreaterThan(0.26);
    expect(kpi.raw).toBeLessThan(0.29);
    expect(kpi.delta).toBeGreaterThan(1);
    expect(kpi.delta).toBeLessThan(2.2);
  });

  it('rewrites false model claims in titles and subtitles', () => {
    const spec = rewriteUnverifiedCopy(validateDashboardSpec({
      title: 'Pricing',
      subtitle: 'Discounts are compressing margins — but not evenly',
      widgets: [
        { type: 'chart', title: 'Monthly Revenue by Region', subtitle: 'APAC and LATAM accelerating fastest', xField: 'region', yField: 'revenue' },
        { type: 'table', title: 'Top 10 combos drive 42% of revenue' },
        { type: 'insight', title: 'Revenue holding steady', insight: { title: 'Revenue holding steady', text: 'Revenue holding steady' } },
      ],
    }), [sales]);
    const blob = `${spec.subtitle || ''} ${spec.widgets.map((w) => `${w.title} ${w.subtitle || ''} ${w.insight?.text || ''}`).join(' ')}`;
    expect(blob).not.toMatch(/LATAM accelerating/i);
    expect(blob).not.toMatch(/42%/);
    expect(blob).not.toMatch(/holding steady/i);
    expect(blob).not.toMatch(/compressing margins/i);
  });

  it('keeps insight titles short and complete', () => {
    const title = shortInsightTitle('Paid generated 214.6K in sessions, 32% of the total — the', 60);
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title).not.toMatch(/ the$/i);
    expect(title).not.toMatch(/—$/);
  });

  it('does not invent AOV on monthly finance grain', () => {
    const finance = {
      id: 'ds-finance',
      name: 'Finance',
      data: SAMPLE_FINANCE_ROWS,
      columns: Object.keys(SAMPLE_FINANCE_ROWS[0] || {}).map((name) => ({ name })),
    };
    expect(proposeDerivedMeasures(finance).some((p) => p.id === 'aov')).toBe(false);
  });

  it('keeps insight titles distinct from the body', () => {
    const spec = rewriteUnverifiedCopy(validateDashboardSpec({
      title: 'Sales',
      widgets: [{
        type: 'insight',
        title: 'North generated $91.0M in revenue, 25% of the total',
        insight: {
          title: 'North generated $91.0M in revenue, 25% of the total',
          text: 'North generated $91.0M in revenue, 25% of the total.',
        },
      }],
    }), [sales]);
    const insight = spec.widgets.find((w) => w.type === 'insight');
    const heading = insight?.insight?.title || insight?.title || '';
    const body = insight?.insight?.text || '';
    expect(heading.length).toBeLessThanOrEqual(48);
    expect(body.toLowerCase()).not.toBe(heading.toLowerCase());
  });
});

describe('interactions and encodings', () => {
  it('cross-filters on the clicked field only', () => {
    const series = prepareChartSeries([sales], {
      id: 'c',
      type: 'chart',
      title: 'Revenue Share by Channel',
      layout: { x: 0, y: 0, w: 6, h: 5 },
      xField: 'channel',
      yField: 'revenue',
    });
    const web = series.find((row) => String(row.name) === 'Web');
    expect(web).toBeTruthy();
    const filtered = prepareChartSeries([sales], {
      id: 'c2',
      type: 'chart',
      title: 'Monthly revenue',
      layout: { x: 0, y: 0, w: 6, h: 5 },
      xField: 'order_date',
      yField: 'revenue',
    }, [{ field: 'channel', op: 'equals', value: 'Web' }]);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((row) => Number(row.value) > 0)).toBe(true);
    const emptyWrong = prepareChartSeries([sales], {
      id: 'c3',
      type: 'chart',
      title: 'Revenue',
      layout: { x: 0, y: 0, w: 6, h: 5 },
      xField: 'order_date',
      yField: 'revenue',
    }, [{ field: 'region', op: 'equals', value: 'Web' }]);
    expect(emptyWrong.every((row) => Number(row.value) === 0) || emptyWrong.length === 0).toBe(true);
  });

  it('anchors Last 30d to the dataset max date', () => {
    const dates = SAMPLE_SALES_ROWS.map((row) => String(row.order_date)).sort();
    const max = new Date(`${dates[dates.length - 1]}T00:00:00`);
    const range = rangeForPreset('last-30d', new Date('2026-10-06T00:00:00'), { max });
    expect(range.to).toBe(dates[dates.length - 1]);
    expect(range.from < range.to).toBe(true);
    expect(range.from.startsWith('2025')).toBe(true);
  });

  it('draws a compare series and falls back to H1 when the prior year is empty', () => {
    const series = prepareChartSeries([sales], {
      id: 'trend',
      type: 'chart',
      title: 'Revenue Trend with Period Comparison',
      layout: { x: 0, y: 0, w: 12, h: 5 },
      xField: 'order_date',
      yField: 'revenue',
      compare: 'previous-year',
    });
    expect(series.some((row) => Number(row.__compare) > 0)).toBe(true);
  });

  it('keeps a second measure for combo titles and converts share charts to percents', () => {
    const combo = prepareChartSeries([sales], {
      id: 'combo',
      type: 'chart',
      title: 'Revenue & Discount Rate Trend — with discount overlay',
      layout: { x: 0, y: 0, w: 12, h: 5 },
      xField: 'order_date',
      yField: 'revenue',
      series: [
        { field: 'revenue', style: 'bar' },
        { field: 'discount_rate', style: 'line', axis: 'right' },
      ],
    });
    expect(combo.some((row) => row.discount_rate != null)).toBe(true);
    const share = prepareChartSeries([sales], {
      id: 'share',
      type: 'chart',
      title: 'Revenue Share by Channel',
      layout: { x: 0, y: 0, w: 6, h: 5 },
      xField: 'channel',
      yField: 'revenue',
    });
    const total = share.reduce((acc, row) => acc + Number(row.value), 0);
    expect(total).toBeGreaterThan(0.99);
    expect(total).toBeLessThan(1.01);
  });

  it('uses pretty labels for EBITDA and COGS', () => {
    expect(prettyField('ebitda')).toBe('EBITDA');
    expect(prettyField('cogs')).toBe('COGS');
    expect(prettyField('avg_session_seconds')).toBe('Avg session duration');
  });

  it('keeps segment independent from channel', () => {
    const pairs = new Set(SAMPLE_SALES_ROWS.map((row) => `${row.channel}|${row.segment}`));
    expect(pairs.size).toBeGreaterThan(3);
    expect(pairs.has('Direct|Enterprise') && pairs.has('Direct|SMB')).toBe(true);
  });

  it('exposes board facts used by the claim verifier', () => {
    const spec = attachComputedFacts(validateDashboardSpec({
      title: 'Sales',
      widgets: [{ type: 'kpi', title: 'Total revenue', measure: { field: 'revenue', agg: 'sum', format: 'currency' } }],
    }), [sales]);
    const facts = collectBoardFacts([sales], spec);
    expect(facts.directions.__overall).toBeLessThan(-10);
    expect(facts.directions.LATAM).toBeLessThan(0);
    expect(facts.directions.APAC).toBeGreaterThan(50);
  });
});
