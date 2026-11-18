/**
 * The every-page checks (see sweep.spec.ts) on the signed-in customer's pages: accessibility, no
 * JavaScript errors or failed API calls, no broken links or images, and the 390px phone layout.
 *
 * Cart and checkout are opened with something in the cart, so this changes the shared customer's cart
 * and runs in the `customer` project. The Arabic pages are not opened as the customer, because doing so
 * may save Arabic as the account's language; the guest sweep covers Arabic.
 */
import { json, type OrderSummary, type Page as ApiPage } from '../../api';
import { env } from '../../config/env';
import { expect, test } from '../../fixtures/test';
import { hasHorizontalOverflow, scrollThroughPage } from '../../utils/dom';
import { knownBug } from '../../utils/knownBug';
import { brokenLinksAndImages, KNOWN_SITE_AXE_ISSUES, seriousAxeViolations, watchPageErrors } from '../../utils/quality';
import { quantityForExactly } from '../../utils/shop';
import { CUSTOMER_PAGES, resolveOrSkip } from './pageTypes';

test.use({ storageState: env.storageState.customer });
test.describe.configure({ mode: 'default' });

const checkedUrls = new Set<string>();

for (const type of CUSTOMER_PAGES) {
  test.describe(`Every customer page: ${type.name}`, { tag: ['@sweep', '@nonfunctional'] }, () => {
    test.beforeEach(async ({ api, customerApi, storeInfo }) => {
      if (!type.needsCart) return;
      // Above the minimum order, so checkout shows its full form.
      const { product, quantity } = await quantityForExactly(api, storeInfo.minOrderAmount);
      await customerApi.cart.seed([{ productId: product.id, quantity: quantity + 1 }]);
    });
    test.afterEach(async ({ customerApi }) => {
      if (type.needsCart) await customerApi.cart.clear();
    });

    test('axe finds no serious or critical issues', { tag: '@a11y' }, async ({ customerApi, page }) => {
      const { path } = await resolveOrSkip(type, customerApi);
      await page.goto(path);
      await scrollThroughPage(page);
      const violations = await seriousAxeViolations(page, { skipKnownSiteIssues: true });
      expect(violations, `Serious/critical accessibility issues on ${path}`).toEqual([]);
    });

    test('loads without JavaScript errors or failed loads', async ({ customerApi, page }) => {
      const { path } = await resolveOrSkip(type, customerApi);
      const watch = watchPageErrors(page);
      const response = await page.goto(path);
      await scrollThroughPage(page);
      // Checkout keeps Stripe connections open, so "no network for 500 ms" may never come; wait at most 10 s.
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      const problems = watch.stop();
      expect(response?.status(), `HTTP status of ${path}`).toBe(200);
      expect(problems, problems.join('\n')).toEqual([]);
    });

    test('every link and image answers 2xx/3xx', async ({ customerApi, page }) => {
      test.slow();
      const { path } = await resolveOrSkip(type, customerApi);
      await page.goto(path);
      await scrollThroughPage(page);
      const broken = await brokenLinksAndImages(page, checkedUrls);
      expect(broken, broken.join('\n')).toEqual([]);
    });

    test.describe('on a 390px phone', () => {
      test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

      test('nothing is wider than the screen', { tag: '@responsive' }, async ({ customerApi, page }) => {
        const { path } = await resolveOrSkip(type, customerApi);
        await page.goto(path);
        await scrollThroughPage(page);
        expect(await hasHorizontalOverflow(page), `${path} scrolls sideways at 390px`).toBe(false);
      });
    });
  });
}

test.describe('Signed-in accessibility issues already reported', { tag: ['@sweep', '@a11y', '@nonfunctional'] }, () => {
  // Left out of the per-page axe checks above and checked here once per bug, so their fix is noticed.
  const issues = KNOWN_SITE_AXE_ISSUES.filter((i) => i.shownOn.customer);
  for (const bug of [...new Set(issues.map((i) => i.bug))]) {
    const issue = issues.find((i) => i.bug === bug)!;
    test(`${bug} on ${issue.shownOn.path}`, async ({ customerApi, page }) => {
      knownBug(bug);
      let path = issue.shownOn.path;
      if (path.includes('{pending order}')) {
        const [order] = (await json<ApiPage<OrderSummary>>(customerApi.orders.list({ page: 1, limit: 1, state: 'active' }))).data;
        test.skip(!order, 'The test customer has no pending order');
        path = path.replace('{pending order}', order.id);
      }
      await page.goto(path);
      await scrollThroughPage(page);
      if (bug === 'order-tracker-a11y') {
        await expect(page.getByRole('progressbar').first()).toBeVisible();
        // The step colours change with a 0.5 s transition.
        await page.waitForTimeout(1_000);
      }
      expect(await seriousAxeViolations(page, { onlyKnown: bug })).toEqual([]);
    });
  }
});
