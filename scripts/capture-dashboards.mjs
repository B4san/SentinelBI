import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.DASH_URL || 'http://127.0.0.1:3000';
const OUT = process.env.SHOT_DIR || '/opt/cursor/artifacts/screenshots';
const archetypes = ['hero-kpi-rail', 'editorial', 'command-center', 'metric-mosaic', 'comparison', 'story-arc', 'split-insight', 'funnel-flow'];
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
page.on('pageerror', (err) => console.error('PAGEERROR', err.message));

const errors = [];
async function shot(url, file) {
  try {
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 700));
    await page.screenshot({ path: `${OUT}/${file}`, fullPage: true });
    console.log('ok', file);
  } catch (err) {
    errors.push(`${file}: ${err.message}`);
    console.error('fail', file, err.message);
  }
}

for (const dataset of datasets) {
  for (const archetype of archetypes) {
    for (const mode of modes) {
      await shot(
        `${BASE}/__dash-preview?dataset=${dataset}&archetype=${archetype}&mode=${mode}&seed=17`,
        `dash4_${dataset}_${archetype}_${mode}.png`,
      );
    }
  }
}

await shot(`${BASE}/__dash-preview?spec=mocked&mode=light`, 'dash4_mocked_ai_light.png');
await shot(`${BASE}/__dash-preview?spec=mocked&mode=dark`, 'dash4_mocked_ai_dark.png');
await shot(`${BASE}/__dash-preview?state=generating&mode=light`, 'dash4_ai_generating.png');
await shot(`${BASE}/__shell-preview?page=login`, 'dash4_login.png');
await shot(`${BASE}/__shell-preview?page=landing`, 'dash4_landing.png');
await shot(`${BASE}/__shell-preview?page=settings`, 'dash4_settings.png');
await shot(`${BASE}/d/mocked-ai`, 'dash4_ssr_mocked.png');

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
