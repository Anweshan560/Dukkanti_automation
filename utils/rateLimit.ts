import { test, type APIResponse, type Page } from '@playwright/test';
import { env } from '../config/env';

/**
 * POST /cart/checkout allows about 10 calls per customer in a ~10 minute window (measured 2026-11-17),
 * and refused calls (400/404) count too. A 429 does not extend the window and carries no Retry-After.
 *
 * The suite keeps its checkout calls under that budget, but a quick re-run can still land inside the
 * previous run's window. These helpers wait the window out instead of failing, and say so in the report.
 */
const POLL_MS = 30_000;
const MAX_WAIT_MS = 12 * 60_000;

/** Tests that may have to wait for the window give themselves room for it. */
export const CHECKOUT_TEST_TIMEOUT = MAX_WAIT_MS + 3 * 60_000;

function noteWait(waitedMs: number): void {
  if (!waitedMs) return;
  test.info().annotations.push({
    type: 'rate-limit',
    description: `Waited ${Math.round(waitedMs / 1000)} s for the checkout rate limit (429) to clear`,
  });
}

/** Sends an API call again, every 30 s, while it answers 429. */
export async function retryOn429(send: () => Promise<APIResponse>): Promise<APIResponse> {
  const started = Date.now();
  let response = await send();
  while (response.status() === 429 && Date.now() - started < MAX_WAIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    response = await send();
  }
  const waited = Date.now() - started;
  noteWait(waited > POLL_MS / 2 ? waited : 0);
  return response;
}

/**
 * Makes the browser's own POST /cart/checkout wait out a 429 too, so a UI test checks the app and not the
 * rate limit. Any other answer (including errors) is passed to the page unchanged.
 */
export async function absorbCheckoutRateLimit(page: Page): Promise<void> {
  await absorbRateLimit(page, `${env.apiUrl}/cart/checkout`);
}

/**
 * The form endpoints (`/forms/*`) share a limit of 5 calls per caller per hour (measured 2026-11-26),
 * far longer than a test can wait. The suite sends exactly 5 (see forms.api.spec.ts), so a 429 means
 * another run used them within the hour: the test is skipped with that reason instead of failing.
 */
export function skipIfFormsRateLimited(response: { status(): number }): void {
  test.skip(
    response.status() === 429,
    'Rate limited: /forms/* allows 5 calls per caller per hour and another run used them. Run again in an hour.',
  );
}

/** POST /coupons/apply allows 10 calls per customer per minute (measured 2026-11-26). Same idea. */
export async function absorbCouponRateLimit(page: Page): Promise<void> {
  await absorbRateLimit(page, `${env.apiUrl}/coupons/apply`);
}

async function absorbRateLimit(page: Page, url: string): Promise<void> {
  await page.route(url, async (route) => {
    const started = Date.now();
    let response = await route.fetch();
    while (response.status() === 429 && Date.now() - started < MAX_WAIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      response = await route.fetch();
    }
    const waited = Date.now() - started;
    noteWait(waited > POLL_MS / 2 ? waited : 0);
    await route.fulfill({ response });
  });
}
