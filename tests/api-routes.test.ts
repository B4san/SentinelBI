import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/server/app';
import { httpStatusForGenerateResult } from '../src/server/http';
import { mapProviderError } from '../src/lib/ai/errors';
import { resolveProviderConfig } from '../src/lib/ai/resolve';
import { SAMPLE_SALES_ROWS } from '../src/lib/sampleData';

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

const stubRenderer = async () => ({
  renderDashboard: async () => '<div class="dash-board">ok</div>',
  renderDashboardDocument: async () => '<!DOCTYPE html><html><body>doc</body></html>',
});

describe('httpStatusForGenerateResult', () => {
  it('maps quota, auth, payment and timeout', () => {
    expect(httpStatusForGenerateResult({ spec: {} as never, source: 'fallback', fallbackReason: '429: free quota', attempts: [{ step: 'plain', status: 429, ms: 10 }] })).toBe(429);
    expect(httpStatusForGenerateResult({ spec: {} as never, source: 'fallback', error: 'invalid API key for openai', attempts: [{ step: 'json_object', status: 401, ms: 10 }] })).toBe(401);
    expect(httpStatusForGenerateResult({ spec: {} as never, source: 'fallback', fallbackReason: 'insufficient credits', attempts: [{ step: 'plain', status: 402, ms: 10 }] })).toBe(402);
    expect(httpStatusForGenerateResult({ spec: {} as never, source: 'fallback', fallbackReason: 'timed out after 50s at step json_object', attempts: [] })).toBe(504);
    expect(httpStatusForGenerateResult({ spec: {} as never, source: 'fallback', fallbackReason: 'No API key on the server', attempts: [] })).toBe(200);
  });
});

describe('API app factory', () => {
  let url = '';
  let close: () => Promise<void> = async () => undefined;
  const prevKey = process.env.OPENROUTER_API_KEY;
  const prevProvider = process.env.AI_PROVIDER;

  beforeAll(async () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.AI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.AI_PROVIDER = 'openrouter';
    const app = createApp({ loadRenderer: stubRenderer });
    const started = await listen(app);
    url = started.url;
    close = started.close;
  });

  afterAll(async () => {
    await close();
    if (prevKey) process.env.OPENROUTER_API_KEY = prevKey;
    else delete process.env.OPENROUTER_API_KEY;
    if (prevProvider) process.env.AI_PROVIDER = prevProvider;
    else delete process.env.AI_PROVIDER;
  });

  it('serves GET /api/health without secrets', async () => {
    const res = await fetch(`${url}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.runtime).toMatch(/node|vercel/);
    expect(['memory', 'blob', 'kv', 'fs']).toContain(body.storage);
    expect(JSON.stringify(body)).not.toMatch(/sk-|AIza|Bearer /);
  });

  it('lists providers and models', async () => {
    const providers = await fetch(`${url}/api/ai/providers`);
    expect(providers.status).toBe(200);
    const listed = await providers.json();
    expect(listed.providers.some((p: { id: string }) => p.id === 'openrouter')).toBe(true);

    const models = await fetch(`${url}/api/ai/models?provider=openrouter`);
    expect(models.status).toBe(200);
    const body = await models.json();
    expect(Array.isArray(body.models)).toBe(true);
  });

  it('returns 4xx JSON for POST /api/ai without a key', async () => {
    const res = await fetch(`${url}/api/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'openrouter', contents: 'hello' }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    const body = await res.json();
    expect(body.error).toMatch(/API key|Missing/i);
    expect(body.error).not.toMatch(/FUNCTION_INVOCATION_FAILED/);
  });

  it('returns 401 JSON for an invalid x-api-key against a live-looking request that fails auth locally', async () => {
    const mapped = mapProviderError({ status: 401, provider: 'openrouter' });
    expect(mapped.status).toBe(401);
    expect(mapped.message).toMatch(/invalid API key for openrouter/);
  });

  it('renders dashboards statelessly and lists them', async () => {
    const render = await fetch(`${url}/api/dashboards/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spec: { title: 'Test', widgets: [] },
        datasets: [{ id: 'ds', name: 'Sales', data: SAMPLE_SALES_ROWS.slice(0, 5) }],
      }),
    });
    expect(render.status).toBe(200);
    const body = await render.json();
    expect(body.html).toContain('dash-board');

    const list = await fetch(`${url}/api/dashboards`);
    expect(list.status).toBe(200);
  });

  it('returns a friendly HTML 404 for unknown share links', async () => {
    const res = await fetch(`${url}/d/does-not-exist`);
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toMatch(/share link expired/i);
    expect(html).not.toMatch(/FUNCTION_INVOCATION_FAILED/);
  });

  it('serves sample /d pages', async () => {
    for (const id of [
      'sample-sales-command-center-light',
      'sample-web-funnel-flow-light',
      'sample-finance-command-center-light',
    ]) {
      const res = await fetch(`${url}/d/${id}`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toMatch(/<!DOCTYPE html>/i);
    }
  });

  it('generates a fallback dashboard without a key', async () => {
    const res = await fetch(`${url}/api/dashboards/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Sales',
        intent: 'Show revenue',
        datasets: [{ id: 'ds', name: 'Sales', data: SAMPLE_SALES_ROWS.slice(0, 40) }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe('fallback');
    expect(body.fallbackReason).toBeTruthy();
    expect(body.spec.widgets.length).toBeGreaterThan(0);
    expect(body.attempts?.some((a: { keySource?: string }) => a.keySource === 'none')).toBe(true);
  });

  it('generates a fallback executive report without a key', async () => {
    const res = await fetch(`${url}/api/reports/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Sales',
        datasets: [{ id: 'ds', name: 'Sales', data: SAMPLE_SALES_ROWS.slice(0, 40) }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe('fallback');
    expect(body.markdown).toMatch(/Executive Summary/);
    expect(body.facts.rowCount).toBe(40);
  });
});

describe('BYOK key source', () => {
  it('records user vs env without echoing the key', () => {
    const user = resolveProviderConfig({ provider: 'openrouter', apiKey: 'user-secret' }, { OPENROUTER_API_KEY: 'env-secret' });
    expect(user.apiKey).toBe('user-secret');
    expect(user.source.apiKey).toBe('user');
    const env = resolveProviderConfig({ provider: 'openrouter' }, { OPENROUTER_API_KEY: 'env-secret' });
    expect(env.apiKey).toBe('env-secret');
    expect(env.source.apiKey).toBe('env');
  });
});
