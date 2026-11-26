/**
 * The checks that every page type must pass, run on one page of each type as a guest: accessibility
 * (axe), no JavaScript errors or failed loads, no broken links or images, a phone layout that does not
 * scroll sideways, and the Arabic page (right to left, translated). The home page has its own, deeper
 * versions of these in tests/home.
 *
 * Read-only, so it runs in parallel. Customer pages: sweep.serial.spec.ts.
 */
import { expect, test } from '../../fixtures/test';
import { hasHorizontalOverflow, scrollThroughPage } from '../../utils/dom';
import { knownBug } from '../../utils/knownBug';
import {
  ARABIC,
  brokenLinksAndImages,
  KNOWN_SITE_AXE_ISSUES,
  observeWebVitals,
  readWebVitals,
  seriousAxeViolations,
  watchPageErrors,
} from '../../utils/quality';
import { arabicPath, GUEST_PAGES, resolveOrSkip } from './pageTypes';

/** Links and images already fetched by this worker: each URL is checked once per run, not once per page. */
const checkedUrls = new Set<string>();

/** The 404 page answers 404 for its own address by design. */
const isNotFoundPage = (path: string) => path.includes('does-not-exist');

/** Header controls that may stay in Latin letters on the Arabic page: the logo, the "English" switch, amounts. */
const ALLOWED_LATIN = /^(Dukkanti|English|EN|\d+([.,]\d+)?)$/i;

for (const type of GUEST_PAGES) {
  test.describe(`Every page: ${type.name}`, { tag: ['@sweep', '@nonfunctional'] }, () => {
    test('axe finds no serious or critical issues', { tag: '@a11y' }, async ({ api, page }) => {
      if (type.name === 'baskets') knownBug('baskets-rows-not-keyboard-scrollable');
      const { path } = await resolveOrSkip(type, api);
      await page.goto(path);
      await scrollThroughPage(page);
      // The two site-wide issues already reported are checked once (below), not on every page.
      const violations = await seriousAxeViolations(page, { skipKnownSiteIssues: true });
      expect(violations, `Serious/critical accessibility issues on ${path}`).toEqual([]);
    });

    test('loads without JavaScript errors or failed loads', async ({ api, page }) => {
      const { path } = await resolveOrSkip(type, api);
      const watch = watchPageErrors(page, {
        ignoreUrl: (url) => isNotFoundPage(path) && new URL(url).pathname === path,
      });
      const response = await page.goto(path);
      await scrollThroughPage(page);
      await page.waitForLoadState('networkidle');
      const problems = watch.stop();
      expect(response?.status(), `HTTP status of ${path}`).toBe(isNotFoundPage(path) ? 404 : 200);
      expect(problems, problems.join('\n')).toEqual([]);
    });

    test('every link and image answers 2xx/3xx', async ({ api, page }) => {
      test.slow();
      const { path } = await resolveOrSkip(type, api);
      await page.goto(path);
      await scrollThroughPage(page);
      const broken = (await brokenLinksAndImages(page, checkedUrls)).filter(
        (line) => !(isNotFoundPage(path) && line.includes(path)),
      );
      expect(broken, broken.join('\n')).toEqual([]);
    });

    test.describe('on a 390px phone', () => {
      test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

      test('nothing is wider than the screen', { tag: '@responsive' }, async ({ api, page }) => {
        const { path } = await resolveOrSkip(type, api);
        await page.goto(path);
        await scrollThroughPage(page);
        expect(await hasHorizontalOverflow(page), `${path} scrolls sideways at 390px`).toBe(false);
      });
    });

    test('the Arabic page is right to left and translated', { tag: '@i18n' }, async ({ api, page }) => {
      if (['policy page', 'about'].includes(type.name)) knownBug('ar-static-pages-not-translated');
      const { path, arabicName } = await resolveOrSkip(type, api);
      await page.goto(arabicPath(path));
      const html = page.locator('html');
      await expect(html).toHaveAttribute('lang', 'ar');
      await expect(html).toHaveAttribute('dir', 'rtl');
      // Brand names are often Latin in Arabic too ("Loyal"), so a brand listing's heading may be.
      if (type.name !== 'brand listing') {
        await expect(
          page.getByRole('main').getByRole('heading', { level: 1 }).first(),
          'The heading is in Arabic',
        ).toHaveText(ARABIC);
      }
      // A deal page's heading is the deal type ("Buy 2 get 1 free"); the deal's own name is shown under it.
      if (arabicName)
        await expect(page.getByRole('main'), 'The page shows the Arabic name from the API').toContainText(
          arabicName,
        );
      // Every visible named control in the header is in Arabic.
      const banner = page.getByRole('banner');
      const names = await banner
        .getByRole('link')
        .or(banner.getByRole('button'))
        .evaluateAll((els) =>
          els
            .filter((el) => (el as HTMLElement).offsetParent !== null)
            .map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim()),
        );
      const english = names.filter((name) => name && !ARABIC.test(name) && !ALLOWED_LATIN.test(name));
      expect(english, `Header controls still in English on ${arabicPath(path)}`).toEqual([]);
    });
  });
}

test.describe(
  'Site-wide accessibility issues already reported',
  { tag: ['@sweep', '@a11y', '@nonfunctional'] },
  () => {
    // Left out of the per-page axe checks above and checked here once, so their fix is noticed.
    // Issues on signed-in pages have their own test in sweep.serial.spec.ts.
    for (const issue of KNOWN_SITE_AXE_ISSUES.filter((i) => !i.shownOn.customer)) {
      test(`${issue.rule} on ${issue.shownOn.path} (${issue.bug})`, async ({ page }) => {
        knownBug(issue.bug);
        await page.goto(issue.shownOn.path);
        await scrollThroughPage(page);
        expect(await seriousAxeViolations(page, { onlyKnown: issue.bug })).toEqual([]);
      });
    }
  },
);

test.describe('Speed of the busiest pages', { tag: ['@sweep', '@nonfunctional', '@performance'] }, () => {
  for (const type of GUEST_PAGES.filter((t) =>
    ['all products', 'category listing', 'product page'].includes(t.name),
  )) {
    test(`${type.name}: largest contentful paint under 2.5 s and layout shift under 0.1`, async ({
      api,
      page,
    }) => {
      const { path } = await resolveOrSkip(type, api);
      await observeWebVitals(page);
      await page.goto(path);
      const { lcp, cls } = await readWebVitals(page);
      expect(lcp, `LCP ${Math.round(lcp)} ms on ${path}`).toBeLessThan(2_500);
      expect(cls, `CLS ${cls.toFixed(3)} on ${path}`).toBeLessThan(0.1);
    });
  }
});
