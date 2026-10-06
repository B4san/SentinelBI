#!/usr/bin/env node
const base = String(process.env.BASE_URL || process.argv[2] || '').replace(/\/+$/, '');
if (!base) {
  console.error('Usage: BASE_URL=https://example.vercel.app node scripts/smoke.mjs');
  process.exit(1);
}

const results = [];

async function check(name, fn) {
  try {
    const value = await fn();
    results.push({ name, ok: true, ...value });
    console.log(`PASS ${name} ${value.status || ''} ${value.note || ''}`.trim());
  } catch (error) {
    results.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) });
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : error}`);
  }
}

await check('GET /api/health', async () => {
  const res = await fetch(`${base}/api/health`);
  const body = await res.json().catch(() => ({}));
  if (res.status !== 200 || body.ok !== true) throw new Error(`status ${res.status} body=${JSON.stringify(body)}`);
  return { status: res.status, note: `runtime=${body.runtime} storage=${body.storage}` };
});

await check('GET /space/anything SPA fallback', async () => {
  const res = await fetch(`${base}/space/anything`, { redirect: 'manual' });
  const html = await res.text();
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  if (!/html/i.test(html)) throw new Error('expected HTML shell');
  if (/NOT_FOUND|FUNCTION_INVOCATION_FAILED/i.test(html) && !/root/i.test(html)) throw new Error('looks like a platform 404');
  return { status: res.status };
});

await check('GET /api/ai/providers', async () => {
  const res = await fetch(`${base}/api/ai/providers`);
  const body = await res.json().catch(() => ({}));
  if (res.status !== 200 || !Array.isArray(body.providers)) throw new Error(`status ${res.status}`);
  return { status: res.status };
});

await check('POST /api/ai without key', async () => {
  const res = await fetch(`${base}/api/ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'openrouter', contents: 'ping' }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status < 400 || res.status >= 500) throw new Error(`expected 4xx, got ${res.status} ${JSON.stringify(body)}`);
  if (!body.error) throw new Error('missing error JSON');
  return { status: res.status, note: body.error };
});

await check('POST /api/ai invalid key', async () => {
  const res = await fetch(`${base}/api/ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': 'definitely-invalid' },
    body: JSON.stringify({ provider: 'openrouter', contents: 'ping' }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && /invalid API key/i.test(body.error || '')) return { status: res.status, note: body.error };
  if (res.status >= 400 && res.status < 500) return { status: res.status, note: body.error || '4xx' };
  throw new Error(`expected auth 4xx, got ${res.status} ${JSON.stringify(body)}`);
});

await check('POST /api/dashboards/render', async () => {
  const res = await fetch(`${base}/api/dashboards/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spec: { title: 'Smoke', widgets: [] }, datasets: [{ id: 'ds', name: 'ds', data: [{ n: 1 }] }] }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status !== 200 || typeof body.html !== 'string') throw new Error(`status ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return { status: res.status };
});

await check('GET /d/missing friendly 404', async () => {
  const res = await fetch(`${base}/d/missing-smoke-id`);
  const text = await res.text();
  if (/FUNCTION_INVOCATION_FAILED/i.test(text)) throw new Error('function crashed');
  if (![200, 404].includes(res.status)) throw new Error(`status ${res.status}`);
  if (res.status === 404 && !/expired|workspace|not found/i.test(text)) throw new Error('404 was not the friendly page');
  return { status: res.status };
});

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ base, failed: failed.length, results }, null, 2));
process.exit(failed.length ? 1 : 0);
