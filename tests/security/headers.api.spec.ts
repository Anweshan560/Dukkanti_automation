/**
 * Security headers of the storefront and the API.
 *
 * The browser keeps the customer's token in localStorage, so the page must not be framable by other sites
 * (clickjacking on Pay / Place order) and should limit where scripts may come from (CSP), which is the main
 * guard against a script injection stealing the token.
 *
 * Read-only: no data changes. The storefront is behind Cloudflare Access on dev, so its pages are fetched
 * with the saved guest session.
 */
import type { APIRequestContext } from '@playwright/test';
import { env } from '../../config/env';
import { expect, test } from '../../fixtures/test';
import { knownBug } from '../../utils/knownBug';
import { MISSING_ID } from '../../utils/shop';

/** One page of each kind that matters: home, a page with personal data, and the public pay page. */
const PAGES = ['/', '/account', `/pay/${MISSING_ID}`];

let site: APIRequestContext;
test.beforeAll(async ({ playwright }) => {
  site = await playwright.request.newContext({ storageState: env.storageState.guest });
});
test.afterAll(async () => {
  await site?.dispose();
});

async function headersOf(path: string): Promise<Record<string, string>> {
  const response = await site.get(`${env.baseUrl}${path}`, { maxRedirects: 0 });
  expect(response.status(), `${path} redirected: is the saved guest session still valid?`).not.toBe(302);
  return response.headers();
}

test.describe('Storefront security headers', { tag: ['@security', '@nonfunctional'] }, () => {
  for (const path of PAGES) {
    test(`${path} cannot be framed by another site and is HTTPS-only`, async () => {
      const headers = await headersOf(path);
      const frameAncestors = /frame-ancestors\s+('none'|'self')/.test(
        headers['content-security-policy'] ?? '',
      );
      expect(
        ['DENY', 'SAMEORIGIN'].includes((headers['x-frame-options'] ?? '').toUpperCase()) || frameAncestors,
        'Neither X-Frame-Options nor CSP frame-ancestors stops other sites from framing the page',
      ).toBe(true);
      expect(headers['strict-transport-security'] ?? '').toMatch(/max-age=\d{7,}/);
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['referrer-policy'] ?? '').toMatch(
        /^(no-referrer|same-origin|strict-origin|strict-origin-when-cross-origin)$/,
      );
    });
  }

  test('pages send a Content-Security-Policy that limits where scripts come from', async () => {
    knownBug('web-no-content-security-policy');
    const csp = (await headersOf('/'))['content-security-policy'] ?? '';
    expect(csp, 'No Content-Security-Policy header').toMatch(/(script-src|default-src)\s/);
  });
});

test.describe('API security headers', { tag: ['@security', '@nonfunctional', '@api'] }, () => {
  test('the API does not say which framework it runs on', async ({ request }) => {
    knownBug('api-reveals-framework');
    const response = await request.get(`${env.apiUrl}/info`);
    expect(
      response.headers()['x-powered-by'],
      'X-Powered-By tells attackers which exploits to try',
    ).toBeUndefined();
  });
});
