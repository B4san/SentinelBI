import { expect, test } from '@playwright/test';

const archetypes = ['hero-kpi-rail', 'editorial', 'command-center', 'metric-mosaic', 'comparison'];
const widths = [1440, 1280];

for (const width of widths) {
  for (const archetype of archetypes) {
    test(`plot fills the card at ${width}px (${archetype})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1100 });
      await page.goto(`/?dataset=sales&archetype=${archetype}&mode=light&seed=17`.replace('/', '/__dash-preview'));
      await page.waitForSelector('.dash-plot');
      await page.setViewportSize({ width: width - 80, height: 1100 });
      await page.setViewportSize({ width, height: 1100 });
      const ratio = await page.evaluate(() => {
        const plots = [...document.querySelectorAll('.dash-plot')] as SVGElement[];
        const cards = plots.map((plot) => plot.closest('.dash-card') as HTMLElement).filter(Boolean);
        if (!plots.length) return 0;
        return Math.min(...plots.map((plot, i) => {
          const card = cards[i];
          if (!card) return 0;
          return plot.getBoundingClientRect().width / Math.max(card.clientWidth - 24, 1);
        }));
      });
      expect(ratio).toBeGreaterThanOrEqual(0.9);
    });
  }
}
