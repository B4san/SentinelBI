import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const out = process.env.OUT_DIR || '/opt/cursor/artifacts';
mkdirSync(out, { recursive: true });
const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
const suffix = process.env.SHOT_SUFFIX || 'after';
const boards = [
  ['sales', 'sample-sales-command-center'],
  ['web', 'sample-web-funnel-flow'],
  ['finance', 'sample-finance-command-center'],
];

const browser = await chromium.launch({ headless: true });
const notes = [];

for (const [name, id] of boards) {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const url = `${base}/d/${id}-${theme}`;
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    notes.push(`${name} ${theme} status=${res?.status()} url=${url}`);
    await page.waitForTimeout(3500);
    const file = path.join(out, `board_${name}_${theme}_${suffix}.png`);
    await page.screenshot({ path: file, fullPage: true });
    notes.push(`saved ${file}`);
    await page.close();
  }
}

writeFileSync(path.join(out, `board-capture-${suffix}.txt`), notes.join('\n'));
console.log(notes.join('\n'));
await browser.close();
