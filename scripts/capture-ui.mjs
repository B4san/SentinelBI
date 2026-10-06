import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const out = process.env.OUT_DIR || '/opt/cursor/artifacts';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const notes = [];

async function shot(name) {
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  notes.push(`saved ${file} url=${page.url()}`);
}

await page.goto('http://127.0.0.1:3000/login');
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForURL('**/');
await page.getByRole('button', { name: /sample sales/i }).click();
await page.waitForURL(/\/space\/.+\/visuals/);
await page.getByRole('link', { name: 'Overview' }).click();
await page.waitForURL(/\/space\/[^/]+$/);
await page.waitForTimeout(800);
const overviewText = await page.locator('main').innerText();
notes.push(`overview-light text includes 100% fake? ${/Data Completeness & AI Confidence|Active Orchestration Agents/.test(overviewText)}`);
notes.push(`overview-light has Rows loaded? ${/Rows loaded|Completeness/.test(overviewText)}`);
await shot('overview_light_after');

const sidebar = page.locator('aside').first();
await sidebar.screenshot({ path: path.join(out, 'sidebar_light_after.png') });
notes.push('saved sidebar_light_after.png');

const active = page.locator('aside a', { hasText: 'Overview' }).first();
const activeStyles = await active.evaluate((el) => {
  const s = getComputedStyle(el);
  return { color: s.color, bg: s.backgroundColor, fontSize: s.fontSize };
});
notes.push(`sidebar active light styles ${JSON.stringify(activeStyles)}`);

await page.getByRole('link', { name: 'Agent Topology' }).click();
await page.waitForURL(/topology/);
await page.waitForTimeout(1200);
const topoText = await page.locator('main').innerText();
notes.push(`topology-light lobster/11 models? ${/Lobster Trap|11 Active Models|Execution Flow Active/.test(topoText)}`);
notes.push(`topology-light pipeline title? ${/Pipeline topology|Upload a CSV/.test(topoText)}`);
await shot('topology_light_after');

await page.getByRole('button', { name: /switch to dark theme/i }).click();
await page.waitForTimeout(600);
notes.push(`dark after toggle? ${await page.evaluate(() => document.documentElement.getAttribute('data-theme'))}`);
await shot('topology_dark_after');
await page.locator('aside').first().screenshot({ path: path.join(out, 'sidebar_dark_after.png') });

await page.getByRole('link', { name: 'Overview' }).click();
await page.waitForTimeout(800);
await shot('overview_dark_after');

const url = page.url();
await page.reload();
await page.waitForTimeout(800);
const afterReload = await page.locator('body').innerText();
notes.push(`reload ${url} not platform 404? ${!/This page doesn’t exist|NOT_FOUND/.test(afterReload)}`);
await shot('deeplink_reload_after');

await page.goto('http://127.0.0.1:3000/space/anything');
await page.waitForTimeout(400);
const missing = await page.locator('body').innerText();
notes.push(`unknown space SPA? ${/Workspace not found|Return to Spaces/.test(missing)} platform404? ${/NOT_FOUND|This page doesn’t exist/.test(missing)}`);
await shot('unknown_space_spa_after');

console.log(notes.join('\n'));
await browser.close();
