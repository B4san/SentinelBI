import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createSampleSpace } from '../src/lib/sampleData';

const space = createSampleSpace('sales');
space.id = 'sp-a11y';

function persisted(mode: 'light' | 'dark') {
  return {
    state: {
      user: { id: 'usr-1', name: 'Eleanor Vance', email: 'admin@sentinel.ai', role: 'Admin', isAuthenticated: true },
      spaces: [space],
      appearance: { mode },
      aiSettings: { provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/free', apiKey: '', stream: true },
    },
    version: 0,
  };
}

async function seed(page: import('@playwright/test').Page, mode: 'light' | 'dark') {
  await page.addInitScript((payload) => {
    localStorage.setItem('sentinel-bi-state', JSON.stringify(payload));
  }, persisted(mode));
}

for (const mode of ['light', 'dark'] as const) {
  test(`overview and topology have no color-contrast violations in ${mode} mode`, async ({ page }) => {
    await seed(page, mode);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/space/${space.id}`);
    await expect(page.getByRole('heading', { name: /Overview/ })).toBeVisible();
    await expect(page.locator('aside a[aria-current="page"]')).toBeVisible();
    await page.waitForTimeout(300);
    const overview = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['region', 'page-has-heading-one', 'landmark-one-main']).analyze();
    const overviewContrast = overview.violations.filter((v) => v.id === 'color-contrast');
    expect(overviewContrast, JSON.stringify(overviewContrast, null, 2)).toEqual([]);

    await page.goto(`/space/${space.id}/topology`);
    await expect(page.getByRole('heading', { name: /topology/i })).toBeVisible();
    await page.waitForTimeout(300);
    const topology = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['region', 'page-has-heading-one', 'landmark-one-main']).analyze();
    const topologyContrast = topology.violations.filter((v) => v.id === 'color-contrast');
    expect(topologyContrast, JSON.stringify(topologyContrast, null, 2)).toEqual([]);
  });
}
