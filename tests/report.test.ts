import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/server/app';
import { generateExecutiveReportOnServer } from '../src/lib/report/generate';
import { buildReportFacts } from '../src/lib/report/facts';
import { SAMPLE_SALES_ROWS } from '../src/lib/sampleData';

const sales = {
  id: 'ds-sales',
  name: 'Sales',
  data: SAMPLE_SALES_ROWS.slice(0, 80),
  columns: Object.keys(SAMPLE_SALES_ROWS[0] || {}).map((name) => ({ name })),
};

function listen(app: ReturnType<typeof createApp>) {
  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((done, fail) => server.close((err) => (err ? fail(err) : done()))),
      });
    });
  });
}

describe('executive report facts', () => {
  it('computes real numbers from loaded rows', () => {
    const facts = buildReportFacts('Northstar', [sales]);
    expect(facts.rowCount).toBe(80);
    expect(facts.kpis.length).toBeGreaterThan(3);
    expect(facts.tokens.length).toBeGreaterThan(3);
    expect(facts.methodology).toMatch(/computed/i);
  });
});

describe('generateExecutiveReportOnServer', () => {
  it('returns a labelled template when no key is present', async () => {
    const doc = await generateExecutiveReportOnServer({
      title: 'Northstar',
      datasets: [sales],
      provider: 'openrouter',
    }, { AI_PROVIDER: 'openrouter' });
    expect(doc.source).toBe('fallback');
    expect(doc.fallbackReason).toMatch(/API key/i);
    expect(doc.markdown).toMatch(/Template fallback/);
    expect(doc.markdown).toMatch(/Executive Summary/);
    expect(doc.keyFindings.length).toBeGreaterThan(1);
    expect(doc.facts.rowCount).toBe(80);
  });

  it('falls back when the model invents a number', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes('/models')) {
        return { status: 200, text: async () => JSON.stringify({ data: [{ id: 'x', supported_parameters: [] }] }) };
      }
      return {
        status: 200,
        text: async () => JSON.stringify({
          model: 'test-model',
          choices: [{
            message: {
              content: JSON.stringify({
                executiveSummary: 'Revenue was $999 trillion this quarter.',
                keyFindings: ['Made-up 999 trillion figure', 'Another invented 42.7% jump'],
                trends: 'Up 999%',
                risks: 'None',
                recommendations: ['Spend more', 'Hire 400 people'],
                methodology: 'Guessed',
              }),
            },
          }],
        }),
      };
    });
    const doc = await generateExecutiveReportOnServer({
      title: 'Northstar',
      datasets: [sales],
      provider: 'openai',
      model: 'gpt-test',
      apiKey: 'sk-test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }, { AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' });
    expect(doc.source).toBe('fallback');
    expect(doc.fallbackReason).toMatch(/not in the computed fact list/i);
    expect(doc.markdown).toMatch(/Template fallback/);
  });

  it('accepts a verified AI draft', async () => {
    const facts = buildReportFacts('Northstar', [sales]);
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes('/models')) {
        return { status: 200, text: async () => JSON.stringify({ data: [{ id: 'x' }] }) };
      }
      return {
        status: 200,
        text: async () => JSON.stringify({
          model: 'ok-model',
          choices: [{
            message: {
              content: JSON.stringify({
                executiveSummary: `Northstar covers ${facts.rowCount} rows with completeness ${facts.completeness}%.`,
                keyFindings: [
                  `Rows analysed ${facts.rowCount}.`,
                  facts.ranks[0] ? `${facts.ranks[0].key} leads at ${facts.ranks[0].sharePct}%.` : 'Mix is concentrated.',
                  `Completeness ${facts.completeness}%.`,
                ],
                trends: facts.trend ? `${facts.trend.measure} moved ${facts.trend.deltaPct}%.` : 'Insufficient data in current scope.',
                risks: `Anomaly flags ${facts.anomalies}.`,
                recommendations: ['Investigate the leading mix slice.', 'Re-run after the next load.'],
                methodology: facts.methodology,
              }),
            },
          }],
        }),
      };
    });
    const doc = await generateExecutiveReportOnServer({
      title: 'Northstar',
      datasets: [sales],
      provider: 'openai',
      model: 'ok-model',
      apiKey: 'sk-test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }, { AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' });
    expect(doc.source).toBe('ai');
    expect(doc.generatedBy).toBe('ok-model');
    expect(doc.markdown).toMatch(/Executive Summary/);
    expect(doc.markdown).not.toMatch(/Template fallback/);
  });
});

describe('POST /api/reports/generate', () => {
  let url = '';
  let close: () => Promise<void> = async () => undefined;

  beforeAll(async () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.AI_PROVIDER = 'openrouter';
    const app = createApp({
      loadRenderer: async () => ({
        renderDashboard: async () => '<div class="dash-board">ok</div>',
        renderDashboardDocument: async () => '<!DOCTYPE html><html><body>doc</body></html>',
      }),
    });
    const started = await listen(app);
    url = started.url;
    close = started.close;
  });

  afterAll(async () => {
    await close();
  });

  it('never returns a blank body and uses the computed template without a key', async () => {
    const res = await fetch(`${url}/api/reports/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Northstar',
        datasets: [sales],
        provider: 'openrouter',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe('fallback');
    expect(body.markdown).toMatch(/Executive Summary/);
    expect(body.facts.rowCount).toBe(80);
    expect(body.attempts?.some((a: { keySource?: string }) => a.keySource === 'none')).toBe(true);
  });
});
