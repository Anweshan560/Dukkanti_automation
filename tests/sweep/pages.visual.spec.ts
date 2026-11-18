/**
 * Screenshots of the main page types as a guest, compared with stored baselines (opt-in: npm run
 * test:visual). The home page has its own, per-section set in tests/home/home.visual.spec.ts.
 *
 * Each shot is the first screen (1440 × 900) with changing content masked (visualMasks.ts), so a failure
 * means the layout moved, not that a price changed. Baselines are per operating system; refresh them
 * with `npm run test:visual:update` and look at the images before committing.
 */
import { expect, test } from '../../fixtures/test';
import { GUEST_PAGES, resolveOrSkip } from './pageTypes';
import { settle, volatileContent } from './visualMasks';

const SHOWN = ['all products', 'category listing', 'product page', 'baskets', 'deals', 'contact', 'sell on Dukkanti', 'page not found'];

test.describe('Page layouts as a guest', { tag: ['@visual', '@nonfunctional'] }, () => {
  for (const type of GUEST_PAGES.filter((t) => SHOWN.includes(t.name))) {
    test(type.name, async ({ api, page }) => {
      const { path } = await resolveOrSkip(type, api);
      await page.goto(path);
      await settle(page);
      const main = page.getByRole('main');
      // The product picked for "product page" can change with the catalogue: hide its name and origin.
      const productDetails =
        type.name === 'product page'
          ? [main.getByRole('heading', { level: 1 }), main.getByRole('navigation', { name: /^breadcrumb$/i }), main.getByText('From').locator('xpath=..')]
          : [];
      await expect(page).toHaveScreenshot(`${type.name.replace(/\W+/g, '-')}.png`, { mask: [...volatileContent(page), ...productDetails] });
    });
  }
});
