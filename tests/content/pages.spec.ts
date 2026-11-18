/**
 * Policy pages, the 404 page, and the files search engines read. Read-only, runs in parallel.
 */
import { expect, test } from '../../fixtures/test';
import { clickToNavigate } from '../../utils/dom';
import { knownBug } from '../../utils/knownBug';

const POLICIES = [
  ['/delivery', 'Delivery Policy'],
  ['/return', /Return/],
  ['/refund', /Refund/],
  ['/cancellation', /Cancellation/],
  ['/terms', /Terms/],
  ['/privacy', /Privacy/],
  ['/cookies', /Cookie/],
  ['/about', /About/],
] as const;

test.describe('Policy pages', { tag: ['@content'] }, () => {
  for (const [path, title] of POLICIES) {
    test(`${path} answers 200 with its title and some content`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      const main = page.getByRole('main');
      await expect(main.getByRole('heading', { level: 1 }).first()).toHaveText(title);
      expect((await main.innerText()).length, `${path} is nearly empty`).toBeGreaterThan(300);
      await expect(page).toHaveTitle(/.+/);
    });
  }

  test('the "Help & policies" menu links every policy page to the others', async ({ page }) => {
    await page.goto('/delivery');
    const menu = page.getByRole('main').getByRole('heading', { name: 'Help & policies' }).locator('xpath=ancestor::*[self::nav or self::aside][1]');
    for (const [path] of POLICIES.filter(([p]) => p !== '/about')) {
      await expect(menu.locator(`a[href="${path}"]`), `${path} is missing from the policy menu`).toHaveCount(1);
    }
    await clickToNavigate(page, menu.locator('a[href="/privacy"]'), /\/privacy$/);
  });
});

test.describe('Page not found', { tag: ['@content', '@negative'] }, () => {
  test('an unknown address answers 404 with the "Page not found" page', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Page not found', level: 1 })).toBeVisible();
  });

  test('an unknown account page answers 404', async ({ page }) => {
    const response = await page.goto('/account/nothing-here');
    expect(response?.status()).toBe(404);
  });

  test('an unknown category answers 404, not the full product list', async ({ page }) => {
    knownBug('soft-404-unknown-category');
    const response = await page.goto('/products/categories/no-such-category-qa');
    expect(response?.status(), 'Unknown category should be a real 404, not a 200 "soft 404"').toBe(404);
  });

  test('the 404 page links home, to all products and to all categories, and each works', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    const main = page.getByRole('main');
    for (const [name, url] of [
      ['Go home', /\/$/],
      ['All products', /\/products$/],
      ['All categories', /\/categories$/],
    ] as const) {
      await clickToNavigate(page, main.getByRole('link', { name }), url);
      await page.goto('/this-page-does-not-exist');
    }
  });

  test('a path with script in it is not echoed back as markup', { tag: '@security' }, async ({ page }) => {
    await page.goto('/%3Cscript%3Ewindow.__xss%3D1%3C%2Fscript%3E');
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });
});

test.describe('Files for search engines', { tag: ['@content', '@nonfunctional'] }, () => {
  test('robots.txt is served and points to a sitemap', async ({ request }) => {
    const response = await request.get('/robots.txt');
    expect(response.status()).toBe(200);
    expect(await response.text()).toMatch(/sitemap:/i);
  });

  test('the sitemap lists product pages', async ({ request }) => {
    knownBug('sitemap-500');
    const robots = await (await request.get('/robots.txt')).text();
    const sitemap = /sitemap:\s*(\S+)/i.exec(robots)?.[1] ?? '/sitemap.xml';
    const response = await request.get(sitemap);
    expect(response.status()).toBe(200);
    expect(await response.text()).toMatch(/<(urlset|sitemapindex)/);
  });
});
