import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.DASH_URL || 'http://127.0.0.1:3000';
const OUT = process.env.SHOT_DIR || '/opt/cursor/artifacts/screenshots';
const archetypes = ['hero-kpi-rail', 'editorial', 'command-center', 'metric-mosaic', 'comparison'];
const datasets = ['sales', 'web', 'finance'];
const modes = ['light', 'dark'];

mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome-stable',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,1600'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1400, deviceScaleFactor: 1 });

async function shot(url, file) {
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: true });
  console.log('ok', file);
}

for (const dataset of datasets) {
  for (const archetype of archetypes) {
    for (const mode of modes) {
      await shot(
        `${BASE}/d/sample-${dataset}-${archetype}-${mode}`,
        `run6_${dataset}_${archetype}_${mode}.png`,
      );
    }
  }
}

await shot(`${BASE}/d/mocked-ai`, 'run6_ssr_mocked_hydrated.png');

const noscript = await browser.newPage();
await noscript.setJavaScriptEnabled(false);
await noscript.setViewport({ width: 1440, height: 1400, deviceScaleFactor: 1 });
await noscript.goto(`${BASE}/d/sample-sales-command-center-light`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await noscript.screenshot({ path: `${OUT}/run6_ssr_js_disabled.png`, fullPage: true });
console.log('ok run6_ssr_js_disabled.png');
await noscript.close();

await page.goto(`${BASE}/d/sample-sales-command-center-light`, { waitUntil: 'networkidle0', timeout: 60000 });
await new Promise((r) => setTimeout(r, 400));

const clicked = await page.evaluate(() => {
  const bar = document.querySelector('.dash-plot rect');
  if (bar) {
    bar.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return 'bar';
  }
  return '';
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `${OUT}/run6_hydrated_crossfilter.png`, fullPage: true });
console.log('ok run6_hydrated_crossfilter.png', clicked);

const calendar = await page.evaluate(() => {
  const trigger = [...document.querySelectorAll('[data-arc="date-range-picker"] button')].find(Boolean);
  if (trigger) {
    trigger.click();
    return true;
  }
  return false;
});
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: `${OUT}/run6_date_picker.png`, fullPage: true });
console.log('ok run6_date_picker.png', calendar);

if (calendar) {
  await page.evaluate(() => {
    const preset = [...document.querySelectorAll('button')].find((el) => /Last 30d/i.test(el.textContent || ''));
    if (preset) preset.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: `${OUT}/run6_last_30d.png`, fullPage: true });
  console.log('ok run6_last_30d.png');
}

await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((el) => /Compare period|Vs previous|Vs last year/i.test(el.textContent || ''));
  if (btn) btn.click();
});
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: `${OUT}/run6_compare.png`, fullPage: true });
console.log('ok run6_compare.png');

await page.goto(`${BASE}/d/sample-sales-editorial-dark`, { waitUntil: 'networkidle0', timeout: 60000 });
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `${OUT}/run6_sales_editorial_dark.png`, fullPage: true });
console.log('ok run6_sales_editorial_dark.png');

await browser.close();
