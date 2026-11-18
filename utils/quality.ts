/**
 * Page-quality checks shared by the home suite and the every-page sweep (tests/sweep): accessibility
 * (axe), broken links and images, JavaScript errors and failed API calls, and Core Web Vitals.
 */
import AxeBuilder from '@axe-core/playwright';
import { test, type Locator, type Page } from '@playwright/test';
import { recordApiCalls } from './network';

/** WCAG 2.1 A and AA. */
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

interface AxeNode {
  html: string;
  any: { data?: unknown }[];
}

/**
 * Site-wide axe failures already reported in known-bugs.json, matched element by element so a new
 * failure of the same rule elsewhere is still caught. Each has its own known-bug test in tests/sweep.
 */
export type KnownSiteAxeBug =
  | 'site-grey-text-contrast'
  | 'header-cart-label-mismatch'
  | 'aria-label-hides-visible-text'
  | 'blocked-badge-contrast'
  | 'order-tracker-a11y';

export const KNOWN_SITE_AXE_ISSUES: {
  bug: KnownSiteAxeBug;
  rule: string;
  /**
   * A page where the issue shows, for its own known-bug test; `customer` pages need the signed-in customer.
   * `{pending order}` stands for the detail page of one of the customer's pending orders.
   */
  shownOn: { path: string; customer: boolean };
  matches: (node: AxeNode) => boolean;
}[] = [
  {
    // The secondary grey (#8a8f8a) used for "Brand · Country", struck prices, "Ends …", side-menu titles.
    bug: 'site-grey-text-contrast',
    rule: 'color-contrast',
    shownOn: { path: '/products', customer: false },
    matches: (node) => (node.any[0]?.data as { fgColor?: string } | undefined)?.fgColor === '#8a8f8a',
  },
  {
    // The header cart button is named "Cart" but shows "0 items 0.00".
    bug: 'header-cart-label-mismatch',
    rule: 'label-content-name-mismatch',
    shownOn: { path: '/products', customer: false },
    matches: (node) => /^<button[^>]*aria-label="Cart( \(\d+\))?"/.test(node.html),
  },
  {
    // Signed-in controls whose aria-label replaces the visible text: the account button ("Account" vs
    // "Hello, Wilma"), the sidebar card ("Profile"), the count links ("40 Orders"), order cards ("View order #10442"),
    // the cart drawer's "See the items in this delivery".
    bug: 'aria-label-hides-visible-text',
    rule: 'label-content-name-mismatch',
    shownOn: { path: '/account/orders', customer: true },
    matches: (node) => /aria-label="(Account|Profile|\d+ (Orders|Wishlist|Addresses)|View order #\d+|See the items in thi)/.test(node.html),
  },
  {
    // The red "Blocked" notifications badge: #b94b4b on #fbefea is 4.46:1, just under 4.5:1.
    bug: 'blocked-badge-contrast',
    rule: 'color-contrast',
    shownOn: { path: '/account', customer: true },
    matches: (node) => {
      const data = node.any[0]?.data as { fgColor?: string; bgColor?: string } | undefined;
      return data?.fgColor === '#b94b4b' && data?.bgColor === '#fbefea';
    },
  },
  {
    // Order status tracker: the progress bar ("Placed", 1 of 4) has no name.
    bug: 'order-tracker-a11y',
    rule: 'aria-progressbar-name',
    shownOn: { path: '/account/orders/{pending order}', customer: true },
    matches: (node) => /^<div role="progressbar"[^>]*aria-valuetext="/.test(node.html),
  },
  {
    // Order status tracker: the steps still to come ("Packed", "On the way") are #8eaea2 on #1b4d3e, 4:1.
    bug: 'order-tracker-a11y',
    rule: 'color-contrast',
    shownOn: { path: '/account/orders/{pending order}', customer: true },
    matches: (node) => node.html.includes('text-brand-mint/70'),
  },
];

/**
 * Serious and critical axe violations, one line each, e.g. "serious color-contrast: … (3 element(s))".
 * The full list is attached to the report as `<name>.json`.
 *
 * With `skipKnownSiteIssues`, elements matching KNOWN_SITE_AXE_ISSUES are left out (and noted in the report),
 * so a page fails only on problems that are not already reported. With `onlyKnown`, only the elements of
 * that one known issue are reported (for its known-bug test).
 */
export async function seriousAxeViolations(
  page: Page,
  options: { include?: string; name?: string; skipKnownSiteIssues?: boolean; onlyKnown?: KnownSiteAxeBug } = {},
): Promise<string[]> {
  let builder = new AxeBuilder({ page }).withTags(AXE_TAGS);
  if (options.include) builder = builder.include(options.include);
  const results = await builder.analyze();
  const skipped = new Set<string>();
  const serious = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => {
      if (options.onlyKnown) {
        const issues = KNOWN_SITE_AXE_ISSUES.filter((k) => k.bug === options.onlyKnown && k.rule === v.id);
        return { ...v, nodes: v.nodes.filter((node) => issues.some((issue) => issue.matches(node as unknown as AxeNode))) };
      }
      if (!options.skipKnownSiteIssues) return v;
      const nodes = v.nodes.filter((node) => {
        const known = KNOWN_SITE_AXE_ISSUES.find((k) => k.rule === v.id && k.matches(node as unknown as AxeNode));
        if (known) skipped.add(known.bug);
        return !known;
      });
      return { ...v, nodes };
    })
    .filter((v) => v.nodes.length);
  if (skipped.size) test.info().annotations.push({ type: 'knownBug', description: `Known site-wide axe issues left out: ${[...skipped].join(', ')}` });
  await test.info().attach(`${options.name ?? 'axe-violations'}.json`, {
    body: JSON.stringify(
      serious.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 10) })),
      null,
      2,
    ),
    contentType: 'application/json',
  });
  return serious.map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length} element(s))`);
}

/** The axe rule ids behind the lines `seriousAxeViolations` returns. */
export const axeRuleIds = (lines: string[]): string[] => [...new Set(lines.map((line) => line.split(' ')[1].replace(/:$/, '')))];

/** Our own hosts. Social networks block automated requests (429/403), so their links are only checked by address. */
const OWN_URL = /^https:\/\/(dev\.dukkanti\.com|links\.dukkanti\.ae|imagedelivery\.net)\//;

/** Every link and image on the page that does not answer 2xx/3xx, as "url -> status". */
export async function brokenLinksAndImages(page: Page, alreadyChecked = new Set<string>()): Promise<string[]> {
  const { hrefs, srcs } = await page.evaluate(() => ({
    hrefs: [...document.querySelectorAll('a[href]')].map((a) => (a as HTMLAnchorElement).href),
    srcs: [...document.querySelectorAll('img[src]')].map((img) => (img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src),
  }));
  const urls = [...new Set([...hrefs, ...srcs])]
    .filter((url) => OWN_URL.test(url))
    .map((url) => url.split('#')[0])
    .filter((url) => !alreadyChecked.has(url));
  urls.forEach((url) => alreadyChecked.add(url));
  const broken: string[] = [];
  const queue = [...urls];
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      const response = await page.request.get(url, { maxRedirects: 0, timeout: 30_000 }).catch((error: Error) => error);
      if (response instanceof Error) broken.push(`${url} -> ${response.message.split('\n')[0]}`);
      else if (response.status() >= 400) broken.push(`${url} -> ${response.status()}`);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  test.info().annotations.push({ type: 'checked', description: `${urls.length} unique links and images` });
  return broken;
}

/**
 * Starts recording JavaScript errors and failed API calls. Call `stop()` after the page has loaded:
 * it returns one line per problem.
 */
export function watchPageErrors(
  page: Page,
  options: { ignoreApi?: (call: { status: number; method: string; path: string }) => boolean; ignoreUrl?: (url: string) => boolean } = {},
): {
  stop: () => string[];
} {
  const ignoreApi = options.ignoreApi ?? (() => false);
  const ignoreUrl = options.ignoreUrl ?? (() => false);
  const errors: string[] = [];
  const onPageError = (error: Error) => errors.push(`page error: ${error.message}`);
  const onConsole = (message: { type(): string; text(): string }) => {
    // "Failed to load resource" carries no address; failed loads are reported below with their URL instead.
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(`console: ${message.text()}`);
  };
  // Pages and images of our own hosts that fail to load. Third-party scripts (analytics, maps) are not ours to fix.
  const onRequestFailed = (request: { url(): string; failure(): { errorText: string } | null }) => {
    if (OWN_URL.test(request.url()) && !ignoreUrl(request.url())) errors.push(`failed to load: ${request.url()} (${request.failure()?.errorText})`);
  };
  const onResponse = (response: { url(): string; status(): number }) => {
    if (response.status() >= 400 && OWN_URL.test(response.url()) && !ignoreUrl(response.url())) errors.push(`${response.status()}: ${response.url()}`);
  };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);
  page.on('requestfailed', onRequestFailed);
  page.on('response', onResponse);
  const api = recordApiCalls(page);
  return {
    stop: () => {
      page.off('pageerror', onPageError);
      page.off('console', onConsole);
      page.off('requestfailed', onRequestFailed);
      page.off('response', onResponse);
      api.stop();
      const failed = api.calls.filter((call) => call.status >= 400 && !ignoreApi(call)).map((c) => `${c.status} ${c.method} ${c.path}`);
      return [...errors, ...failed];
    },
  };
}

/** Registers LCP and CLS observers. Call before the first navigation. */
export async function observeWebVitals(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __lcp: number; __cls: number };
    w.__lcp = 0;
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) w.__lcp = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!entry.hadRecentInput) w.__cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

/** LCP (ms) and CLS after the page has loaded. Ends LCP with a click on empty space, as a visitor would. */
export async function readWebVitals(page: Page): Promise<{ lcp: number; cls: number }> {
  await page.waitForLoadState('load');
  await page.mouse.click(1, 1);
  const vitals = await page.evaluate(() => {
    const w = window as unknown as { __lcp: number; __cls: number };
    return { lcp: w.__lcp, cls: w.__cls };
  });
  test.info().annotations.push({ type: 'performance', description: `LCP ${Math.round(vitals.lcp)} ms, CLS ${vitals.cls.toFixed(3)}` });
  return vitals;
}

/** True when the element (or the page) has focus somewhere inside it. */
export async function hasFocusWithin(locator: Locator): Promise<boolean> {
  return locator.evaluate((el) => el.contains(document.activeElement));
}

/** Arabic letters. */
export const ARABIC = /[؀-ۿ]/;
