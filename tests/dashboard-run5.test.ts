import { describe, expect, it, vi } from 'vitest';
import { chatPayloadError, extractChatText, openaiGenerate } from '../src/lib/ai/openaiCompatible';
import { generateDashboardHandler } from '../src/server/handlers/dashboards';
import { generateDashboardOnServer } from '../src/lib/dashboard/generate';
import { attachComputedFacts, computeWidgetKpi } from '../src/lib/dashboard/facts';
import { buildFallbackDashboard } from '../src/lib/dashboard/fallback';
import { formatDeltaLabel, inferMetricPolarity } from '../src/lib/dashboard/metrics';
import { computeDerivedValue, proposeDerivedMeasures } from '../src/lib/dashboard/measures';
import { prepareTableModel } from '../src/lib/dashboard/table';
import { prepareChartSeries } from '../src/lib/dashboard/aggregate';
import { extractJsonObject, sanitizeMeasure, validateDashboardSpec } from '../src/lib/dashboard/validate';
import { SAMPLE_FINANCE_ROWS, SAMPLE_SALES_ROWS, SAMPLE_WEB_ROWS } from '../src/lib/sampleData';

const sales = {
  id: 'ds-sales',
  name: 'Sales',
  data: SAMPLE_SALES_ROWS,
  columns: Object.keys(SAMPLE_SALES_ROWS[0] || {}).map((name) => ({ name })),
};

const finance = {
  id: 'ds-finance',
  name: 'Finance',
  data: SAMPLE_FINANCE_ROWS,
  columns: Object.keys(SAMPLE_FINANCE_ROWS[0] || {}).map((name) => ({ name })),
};

const web = {
  id: 'ds-web',
  name: 'Web',
  data: SAMPLE_WEB_ROWS,
  columns: Object.keys(SAMPLE_WEB_ROWS[0] || {}).map((name) => ({ name })),
};

describe('generation robustness', () => {
  it('detects a 200 error body with empty choices', () => {
    expect(chatPayloadError({ error: { message: 'Upstream error 503 overloaded' }, choices: [] })).toMatch(/503|overloaded|Upstream/i);
    expect(extractChatText({ error: { message: 'nope' }, choices: [] })).toBe('');
  });

  it('retries a 200 error body then surfaces the upstream message', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ status: 200, text: async () => JSON.stringify({ error: { message: 'Upstream error … 503 overloaded' }, choices: [] }) })
      .mockResolvedValueOnce({ status: 200, text: async () => JSON.stringify({ error: { message: 'Upstream error … 503 overloaded' }, choices: [] }) })
      .mockResolvedValueOnce({ status: 200, text: async () => JSON.stringify({ error: { message: 'Upstream error … 503 overloaded' }, choices: [] }) });
    await expect(openaiGenerate({
      provider: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'x',
      apiKey: 'k',
      stream: false,
      compatible: 'openai',
      extraHeaders: {},
      source: { baseUrl: 'provider', model: 'provider', apiKey: 'user' },
    }, [{ role: 'user', content: 'hi' }], { fetchImpl, retries: 2, timeoutMs: 2000, json: true })).rejects.toThrow(/503|overloaded|unavailable/i);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('steps down the format ladder when schema output is unusable', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: { body?: string; method?: string }) => {
      if (String(url).includes('/models')) {
        return { status: 200, text: async () => JSON.stringify({ data: [{ id: 'x', supported_parameters: ['structured_outputs'] }] }) };
      }
      const body = JSON.parse(init?.body || '{}');
      calls.push(body.response_format?.type || 'plain');
      if (body.response_format?.type === 'json_schema') {
        return { status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: '{not json' } }] }) };
      }
      return {
        status: 200,
        text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({ title: 'Board', widgets: [{ type: 'kpi', title: 'Total revenue', measure: { field: 'revenue', agg: 'sum', format: 'currency' } }] }) } }] }),
      };
    });
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    try {
      const result = await generateDashboardOnServer({
        title: 'Sales',
        intent: 'revenue',
        datasets: [sales],
        seed: 3,
        apiKey: 'k',
        provider: 'openai',
        model: 'x',
        baseUrl: 'https://api.openai.com/v1',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }, { AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k' });
      expect(result.source).toBe('ai');
      expect(result.spec.widgets.length).toBeGreaterThan(0);
      expect(calls).toContain('json_schema');
      expect(calls.some((c) => c === 'json_object' || c === 'plain')).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('parses prose before the JSON object', () => {
    const parsed = extractJsonObject('Reasoning {not} then the spec {"title":"X","widgets":[{"type":"kpi","title":"A"}]}') as { title: string; widgets: unknown[] };
    expect(parsed.title).toBe('X');
    expect(parsed.widgets.length).toBe(1);
  });

  it('mints two unique ids for two generations', async () => {
    const a = await generateDashboardOnServer({ title: 'A', datasets: [sales], seed: 1 }, {});
    const b = await generateDashboardOnServer({ title: 'B', datasets: [sales], seed: 2 }, {});
    expect(a.spec.id).not.toBe(b.spec.id);
    expect(a.fallbackReason).toBeTruthy();
  });

  it('returns html when includeHtml is set', async () => {
    const req = {
      headers: {},
      body: { datasets: [sales], includeHtml: true, title: 'T' },
    } as never;
    let payload: Record<string, unknown> = {};
    const res = {
      json(body: Record<string, unknown>) { payload = body; return this; },
      status() { return this; },
    } as never;
    await generateDashboardHandler(req, res, () => '<div class="dash-board">ok</div>');
    expect(String(payload.html)).toContain('dash-board');
    expect(payload.spec).toBeTruthy();
  });
});

describe('simple measures and ratios', () => {
  it('accepts a simple measureRef and keeps currency KPIs off the row count', () => {
    const measure = sanitizeMeasure({ field: 'revenue', aggregation: 'sum', format: 'currency' });
    expect(measure && 'field' in measure && measure.field).toBe('revenue');
    const spec = validateDashboardSpec({
      title: 'Sales',
      widgets: [{ type: 'kpi', title: 'Total revenue', measure: { field: 'revenue', agg: 'sum', format: 'currency' } }],
    });
    const next = attachComputedFacts(spec, [sales]);
    const raw = computeWidgetKpi([sales], next.widgets[0]).raw;
    expect(raw).not.toBe(SAMPLE_SALES_ROWS.length);
    expect(raw).toBeGreaterThan(1000);
  });

  it('rejects a 100% gross margin and snaps to a real candidate', () => {
    expect(sanitizeMeasure({ kind: 'ratio', numerator: { field: 'revenue' }, denominator: { field: 'revenue' } })).toBeUndefined();
    const proposed = proposeDerivedMeasures(sales);
    expect(proposed.some((p) => p.id === 'aov' || p.id === 'gm' || p.id === 'rev-unit')).toBe(true);
    const spec = validateDashboardSpec({
      title: 'Sales',
      widgets: [{ type: 'kpi', title: 'Gross margin', measure: { kind: 'ratio', numerator: { field: 'revenue' }, denominator: { field: 'revenue' } } }],
    });
    const next = attachComputedFacts(spec, [sales]);
    const value = computeWidgetKpi([sales], next.widgets[0]).raw;
    expect(value).toBeLessThan(0.9);
    expect(value).not.toBe(1);
  });

  it('evaluates derived measures inside charts', () => {
    const series = prepareChartSeries([web], {
      id: 'c',
      type: 'chart',
      title: 'ROAS by channel',
      layout: { x: 0, y: 0, w: 6, h: 5 },
      xField: 'channel',
      yField: 'revenue',
      measure: { kind: 'ratio', numerator: { field: 'revenue', agg: 'sum' }, denominator: { field: 'ad_spend', agg: 'sum' }, format: 'multiple' },
    });
    expect(series.length).toBeGreaterThan(1);
    const paid = series.find((row) => String(row.name) === 'Paid');
    expect(Number(paid?.value)).toBeGreaterThan(1);
    expect(Number(paid?.value)).toBeLessThan(200);
  });
});

describe('tables, polarity, and variety', () => {
  it('groups a channel × device table and adds a totals row', () => {
    const model = prepareTableModel([web], {
      id: 't',
      type: 'table',
      title: 'Channel × device breakdown',
      layout: { x: 0, y: 0, w: 12, h: 5 },
      table: { groupBy: ['channel', 'device'], measures: [{ field: 'sessions', agg: 'sum' }, { field: 'revenue', agg: 'sum' }], sort: { field: 'revenue', dir: 'desc' }, limit: 8 },
    });
    expect(model.columns).toContain('revenue');
    expect(model.rows.some((row) => String(row.channel) === 'Total' || String(row[model.columns[0]]) === 'Total')).toBe(true);
  });

  it('formats a test per polarity class', () => {
    for (const name of ['discount', 'DSO', 'opex', 'bounce', 'CAC', 'churn']) {
      expect(inferMetricPolarity(name)).toBe('lower-is-better');
    }
    expect(formatDeltaLabel(1.6, { rate: true, polarity: 'lower-is-better' }).color).toBe('#e11d48');
    expect(formatDeltaLabel(0.02, { rate: true }).label).toBe('flat');
  });

  it('varies two sales prompts by at least 50% of encodings', () => {
    const a = buildFallbackDashboard({ datasets: [sales], seed: 11, intent: 'Show regional revenue mix and discount pressure', archetype: 'command-center' });
    const b = buildFallbackDashboard({ datasets: [sales], seed: 11, intent: 'Track AOV, units, and product decline for Helios', archetype: 'command-center' });
    const key = (spec: typeof a) => new Set(spec.widgets.map((w) => `${w.componentId}|${w.yField || (w.measure && 'field' in w.measure ? w.measure.field : '')}|${w.xField || ''}`));
    const ka = key(a);
    const kb = key(b);
    const overlap = [...ka].filter((k) => kb.has(k)).length;
    const union = new Set([...ka, ...kb]).size;
    expect(1 - overlap / Math.max(union, 1)).toBeGreaterThanOrEqual(0.5);
  });

  it('does not count finance KPIs as 288 rows', () => {
    const spec = validateDashboardSpec({
      title: 'Finance',
      widgets: [
        { type: 'kpi', title: 'Total revenue', measure: { field: 'revenue', agg: 'sum', format: 'currency' } },
        { type: 'kpi', title: 'EBITDA', measure: { field: 'ebitda', agg: 'sum', format: 'currency' } },
      ],
    });
    const next = attachComputedFacts(spec, [finance]);
    for (const widget of next.widgets) {
      expect(computeWidgetKpi([finance], widget).raw).not.toBe(288);
    }
  });

  it('computes a non-degenerate finance margin', () => {
    const gm = proposeDerivedMeasures(finance).find((p) => p.id === 'gm')!;
    expect(gm.measure).toBeTruthy();
    const value = computeDerivedValue(SAMPLE_FINANCE_ROWS, gm.measure!);
    expect(value).toBeGreaterThan(0.15);
    expect(value).toBeLessThan(0.85);
  });
});
