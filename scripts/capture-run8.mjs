import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { validateDashboardSpec } from '../src/lib/dashboard/validate.ts';
import { SAMPLE_FINANCE_ROWS, SAMPLE_SALES_ROWS, SAMPLE_WEB_ROWS } from '../src/lib/sampleData.ts';

const BASE = process.env.DASH_URL || 'http://127.0.0.1:3000';
const OUT = process.env.SHOT_DIR || '/opt/cursor/artifacts/screenshots';
const ROOT = path.join(import.meta.dirname, '..');

function dataset(kind) {
  const rows = kind === 'web' ? SAMPLE_WEB_ROWS : kind === 'finance' ? SAMPLE_FINANCE_ROWS : SAMPLE_SALES_ROWS;
  return [{
    id: `ds-${kind}`,
    name: kind,
    data: rows,
    columns: Object.keys(rows[0] || {}).map((name) => ({ name })),
  }];
}

async function seed(id, fixtureName, kind) {
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures', fixtureName), 'utf8'));
  spec.id = id;
  spec.theme = spec.theme || { palette: { mode: 'light' } };
  const body = {
    spec: validateDashboardSpec(spec),
    datasets: dataset(kind),
  };
  const res = await fetch(`${BASE}/api/dashboards/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${id}: ${json.error || res.status}`);
  return json.spec.id;
}

fs.mkdirSync(OUT, { recursive: true });

const chrome = process.env.CHROME || '/usr/bin/google-chrome-stable';
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,1800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1600, deviceScaleFactor: 1 });
page.on('pageerror', (err) => console.error('PAGEERROR', err.message));

const ids = {
  salesb: await seed('run8-sales-b', 'sales-b-light.json', 'sales'),
  web: await seed('run8-web', 'web-light.json', 'web'),
  finance: await seed('run8-finance', 'finance-light.json', 'finance'),
};
console.log('seeded', ids);

async function shot(url, file) {
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: true });
  console.log('ok', file);
}

await shot(`${BASE}/d/${ids.salesb}`, 'run8_fix_sales_b_light.png');
await shot(`${BASE}/d/${ids.web}`, 'run8_fix_web_light.png');
await shot(`${BASE}/d/${ids.finance}`, 'run8_fix_finance_light.png');

await page.goto(`${BASE}/d/${ids.salesb}`, { waitUntil: 'networkidle0', timeout: 60000 });
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((el) => /Compare period|Vs previous|Vs last year/i.test(el.textContent || ''));
  if (btn) btn.click();
});
await new Promise((r) => setTimeout(r, 500));
const dashed = await page.evaluate(() => document.querySelectorAll('.dash-plot polyline[stroke-dasharray], .dash-plot polyline[data-compare="1"]').length);
await page.screenshot({ path: `${OUT}/run8_fix_sales_b_compare_on.png`, fullPage: true });
console.log('ok run8_fix_sales_b_compare_on.png dashed=', dashed);

await browser.close();
if (!dashed) {
  console.error('compare overlay missing');
  process.exit(1);
}
