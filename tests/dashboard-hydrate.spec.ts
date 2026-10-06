import { expect, test } from '@playwright/test';

test('hydrated /d page styles, slicer, cross-filter, and compare', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/d/sample-sales-command-center-light');
  await page.waitForSelector('.dash-board');
  await expect(page.locator('.dash-card').first()).toBeVisible();
  const padded = await page.evaluate(() => {
    const card = document.querySelector('.dash-card') as HTMLElement | null;
    if (!card) return 0;
    return card.getBoundingClientRect().left;
  });
  expect(padded).toBeGreaterThan(16);

  const firstKpi = page.locator('.dash-kpi-value, .dash-kpi-value-hero').first();
  const before = await firstKpi.textContent();
  const slicer = page.locator('.dash-toolbar button').filter({ hasText: /North|South|EMEA|APAC|LATAM|Direct|Partner/ }).first();
  if (await slicer.count()) await slicer.click();
  const candidate = page.locator('.dash-plot').nth(2).locator('rect').first();
  if (await candidate.count()) await candidate.click();
  else await page.locator('.dash-plot rect').first().click();
  const chips = page.locator('.dash-toolbar button').filter({ hasText: /=/ });
  await expect(chips).toHaveCount(1);
  await expect(chips.first()).toHaveText(/\w+ = .+/);
  const afterFilter = await firstKpi.textContent();
  expect(afterFilter).toBeTruthy();
  expect(afterFilter).not.toMatch(/^\$0|0\.0%$/);

  const last30 = page.getByRole('button', { name: /Last 30d|Date range|2025-/ }).first();
  if (await last30.count()) {
    await last30.click();
    const preset = page.getByRole('button', { name: 'Last 30d' });
    if (await preset.count()) await preset.click();
  }

  await page.getByRole('button', { name: /Compare period|Vs previous|Vs last year/ }).click();
  await expect(page.locator('.dash-plot polyline[data-compare="1"], .dash-plot polyline[stroke-dasharray]').first()).toBeVisible();
  const after = await firstKpi.textContent();
  expect(before).toBeTruthy();
  expect(after).toBeTruthy();
  expect(errors.filter((e) => !/favicon|hydration|Warning/i.test(e))).toEqual([]);
});

test('SSR /d page is styled with JS disabled', async ({ browser }) => {
  const page = await browser.newPage({ javaScriptEnabled: false });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/d/sample-sales-command-center-light');
  await expect(page.locator('.dash-board')).toHaveCount(1);
  await expect(page.locator('.dash-plot').first()).toBeVisible();
  await page.close();
});
