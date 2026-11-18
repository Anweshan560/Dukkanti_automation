import type { Locator, Page } from '@playwright/test';

/** Amounts such as "12.50" or "1,240.00": prices and totals change with the catalogue. */
const MONEY = /^\s*[\d,]+\.\d{2}\s*$/;

/**
 * What changes between runs without the layout changing: product pictures and names, prices, the store
 * announcement, the cart button, the signed-in name. A screenshot with these masked catches broken
 * layout, missing sections and styling regressions without failing whenever the data moves.
 */
export function volatileContent(page: Page): Locator[] {
  const main = page.getByRole('main');
  return [
    main.getByRole('img'),
    main.locator('a[href^="/products/"]:not([href^="/products/categories/"]):not([href^="/products/countries/"]):not([href^="/products/brands/"])'),
    main.locator('span, p').filter({ hasText: MONEY }),
    main.getByRole('region', { name: /^(Store update|تحديث المتجر)$/ }),
    // Header cart button and the floating "View cart" button.
    page.getByRole('button', { name: /^Cart/ }),
    // Delivery days and dates move every day ("Tomorrow · 1 item", "Arrives Tomorrow, Nov 19").
    main.getByText(/\b(Today|Tomorrow|Arrives|Order within)\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}\b/),
    page.getByRole('banner').getByRole('button', { name: /^Hello|Account/ }),
    // The free-delivery bar under the header follows the cart.
    page.getByRole('banner').getByRole('progressbar'),
    // Footer link lists (categories, baskets, deals, countries) come from the CMS.
    page.getByRole('contentinfo').getByRole('navigation'),
  ];
}

/** Waits for web fonts and images so the text and boxes render the same way every time. */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts.ready);
}
