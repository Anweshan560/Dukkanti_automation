/**
 * Per-section screenshots of the home page, compared with stored baselines (opt-in: npm run test:visual).
 *
 * Content that changes on its own is masked: prices, product rows, deal dates, the store banner, the
 * last-order card and the cart. Baselines are per operating system (tests/__screenshots__/<platform>/);
 * create or refresh them with `npm run test:visual:update` and review the images before committing.
 */
import { expect, test } from '../../fixtures/test';
import { scrollThroughPage } from '../../utils/dom';

test.describe('Home visual regression', { tag: ['@home', '@visual', '@nonfunctional'] }, () => {
  test.beforeEach(async ({ page, homePage }) => {
    await homePage.open();
    await scrollThroughPage(page);
    // Wait for web fonts so text renders the same way every time.
    await page.evaluate(() => document.fonts.ready);
  });

  test('header and nav', async ({ homePage }) => {
    await expect(homePage.header.banner).toHaveScreenshot('header.png', {
      mask: [homePage.header.cartButton, homePage.thresholdBar.message],
    });
  });

  test('hero', async ({ homePage }) => {
    await expect(homePage.hero.root).toHaveScreenshot('hero.png', {
      // The four decorative country stamps are picked at random on every load.
      mask: [homePage.hero.lastOrder.root, homePage.hero.root.locator('a[href^="/products/countries/"]')],
    });
  });

  test('shop by category', async ({ homePage }) => {
    await homePage.categories.root.scrollIntoViewIfNeeded();
    await expect(homePage.categories.root).toHaveScreenshot('categories.png');
  });

  test('deals band layout', async ({ homePage }) => {
    await homePage.deals.root.scrollIntoViewIfNeeded();
    await expect(homePage.deals.root).toHaveScreenshot('deals.png', {
      // Deal names, end dates and product pictures change with the running deals.
      mask: [homePage.deals.visibleCards],
    });
  });

  test('shop by country', async ({ homePage }) => {
    await homePage.countries.root.scrollIntoViewIfNeeded();
    await expect(homePage.countries.root).toHaveScreenshot('countries.png');
  });

  test('shop by brand', async ({ homePage }) => {
    await homePage.brands.root.scrollIntoViewIfNeeded();
    await expect(homePage.brands.root).toHaveScreenshot('brands.png');
  });

  test('product rows layout', async ({ homePage }) => {
    await homePage.productTabs.root.scrollIntoViewIfNeeded();
    await expect(homePage.productTabs.root).toHaveScreenshot('product-tabs.png', {
      mask: [homePage.productTabs.cards],
    });
  });

  test('local businesses and request card', async ({ homePage }) => {
    await homePage.localBusinesses.root.scrollIntoViewIfNeeded();
    await expect(homePage.localBusinesses.root).toHaveScreenshot('local-businesses.png');
  });

  test('footer', async ({ homePage }) => {
    await homePage.footer.root.scrollIntoViewIfNeeded();
    await expect(homePage.footer.root).toHaveScreenshot('footer.png', {
      // Basket and deal lists come from the CMS; the year changes every January.
      mask: [homePage.footer.column('Baskets'), homePage.footer.column('Deals'), homePage.footer.copyright],
    });
  });

  test('store banner position', async ({ homePage }) => {
    const banner = homePage.storeBanner.root;
    test.skip(!(await banner.count()), 'No store announcement is set');
    await expect(banner).toHaveScreenshot('store-banner.png', { mask: [homePage.storeBanner.message] });
  });
});
