import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.DASH_URL || 'http://127.0.0.1:3000';
const OUT = process.env.SHOT_DIR || '/opt/cursor/artifacts/screenshots';
const archetypes = ['hero-kpi-rail', 'editorial', 'command-center', 'metric-mosaic', 'comparison'];
const datasets = ['sales', 'web'];
const modes = ['light', 'dark'];

mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome-stable',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,1400'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1400, deviceScaleFactor: 1 });
page.on('pageerror', (err) => console.error('PAGEERROR', err.message));

const errors = [];
for (const dataset of datasets) {
  for (const archetype of archetypes) {
    for (const mode of modes) {
      const url = `${BASE}/__dash-preview?dataset=${dataset}&archetype=${archetype}&mode=${mode}&seed=17`;
      const file = `${OUT}/dash2_${dataset}_${archetype}_${mode}.png`;
      try {
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
        await page.waitForSelector('.dash-grid', { timeout: 15000 });
        await new Promise((r) => setTimeout(r, 900));
        await page.screenshot({ path: file, fullPage: true });
        console.log('ok', file);
      } catch (err) {
        errors.push(`${file}: ${err.message}`);
        console.error('fail', file, err.message);
      }
    }
  }
}

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
