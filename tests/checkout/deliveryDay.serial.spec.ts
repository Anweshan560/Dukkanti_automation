/**
 * Same-day delivery and its cut-off (GET /info: `sameDayCutoff`, "11:00" Dubai time).
 *
 * The server decides the delivery day: `/info` and `/cart` return `deliveryEstimate`
 * `{ date, orderBy }`. Before the cut-off the delivery is today and `orderBy` is today at the cut-off;
 * after it the delivery moves to a later day and `orderBy` is null.
 *
 * The page turns that into "Today · 2 items" / "Tomorrow · 2 items" and a countdown, "Order within
 * 1 h 33 min", using the browser's clock. The UI tests freeze that clock (page.clock) and hand the page
 * a chosen estimate, so they can check either side of the cut-off at any time of day.
 *
 * Customer project: the cart is seeded through the API and emptied afterwards.
 */
import { json, type Cart, type StoreInfo } from '../../api';
import { env } from '../../config/env';
import { expect, test } from '../../fixtures/test';
import { CartPage } from '../../pages/cart/CartPage';
import { CheckoutPage } from '../../pages/checkout/CheckoutPage';
import type { Page } from '@playwright/test';
import { purchasableProducts } from '../../utils/shop';

test.use({ storageState: env.storageState.customer });
test.describe.configure({ mode: 'default' });

/** Dubai has no daylight saving: always UTC+4. */
const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000;

/** "2026-11-19" for a moment, as the calendar day in Dubai. */
const dubaiDay = (time: Date | string): string =>
  new Date(new Date(time).getTime() + DUBAI_OFFSET_MS).toISOString().slice(0, 10);

/** The moment it is `hh:mm` in Dubai on the Dubai calendar day `day` ("2026-11-19"). */
const dubaiTime = (day: string, hhmm: string): Date => new Date(`${day}T${hhmm}:00+04:00`);

const addDays = (day: string, days: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Minutes from now to today's cut-off in Dubai; negative once it has passed. */
function minutesToCutoff(info: StoreInfo, now = new Date()): number {
  return (dubaiTime(dubaiDay(now), info.sameDayCutoff).getTime() - now.getTime()) / 60_000;
}

/** Makes every GET /cart the page sends carry this delivery estimate (the rest of the cart is real). */
async function serveEstimate(page: Page, estimate: Cart['deliveryEstimate']): Promise<void> {
  await page.route(/\/v1\/cart(\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    (body.data ?? body).deliveryEstimate = estimate;
    await route.fulfill({ response, json: body });
  });
}

test.beforeEach(async ({ api, customerApi }) => {
  const [product] = await purchasableProducts(api, 1);
  await customerApi.cart.seed([{ productId: product.id, quantity: 1 }]);
});
test.afterEach(async ({ customerApi }) => {
  await customerApi.cart.clear();
});

test.describe('Same-day delivery cut-off', { tag: ['@checkout', '@delivery'] }, () => {
  test(
    'the API promises today before the cut-off and a later day after it',
    { tag: '@api' },
    async ({ api, customerApi, storeInfo }) => {
      test.skip(!storeInfo.sameDayDeliveryEnabled, 'Same-day delivery is switched off in the store settings');
      const now = new Date();
      const minutes = minutesToCutoff(storeInfo, now);
      // Too close to call: the answer may change between the two requests.
      test.skip(Math.abs(minutes) < 2, `Run within 2 minutes of the ${storeInfo.sameDayCutoff} cut-off`);

      const info = await json<StoreInfo>(api.info.getInfo());
      const cart = await customerApi.cart.current();
      const today = dubaiDay(now);

      expect(cart.deliveryEstimate, 'The cart promises the same delivery as /info').toEqual(
        info.deliveryEstimate,
      );
      const { date, orderBy } = info.deliveryEstimate;
      if (minutes > 0) {
        expect(dubaiDay(date), `Before ${storeInfo.sameDayCutoff} Dubai time the delivery is today`).toBe(
          today,
        );
        expect(orderBy && new Date(orderBy).toISOString(), 'Order by: today at the cut-off').toBe(
          dubaiTime(today, storeInfo.sameDayCutoff).toISOString(),
        );
      } else {
        expect(
          dubaiDay(date) > today,
          `After ${storeInfo.sameDayCutoff} Dubai time the delivery is on a later day (got ${date})`,
        ).toBe(true);
        expect(orderBy, 'After the cut-off there is no "order by" time').toBeNull();
      }
    },
  );

  test('before the cut-off the cart says "Today" and counts down to it', async ({ page, storeInfo }) => {
    const day = dubaiDay(new Date());
    const cutoff = dubaiTime(day, storeInfo.sameDayCutoff);
    await serveEstimate(page, { date: dubaiTime(day, '12:00').toISOString(), orderBy: cutoff.toISOString() });
    // 1 h 33 min before the cut-off.
    await page.clock.install({ time: new Date(cutoff.getTime() - 93 * 60_000) });

    const cartPage = new CartPage(page);
    await cartPage.open();
    await expect(cartPage.lines.heading).toHaveText(/^Today · 1 item$/);
    await expect(cartPage.main.getByText(/^Order within/).first()).toHaveText('Order within 1 h 33 min');
  });

  test('on checkout the countdown ticks down and disappears at the cut-off', async ({ page, storeInfo }) => {
    const day = dubaiDay(new Date());
    const cutoff = dubaiTime(day, storeInfo.sameDayCutoff);
    await serveEstimate(page, { date: dubaiTime(day, '12:00').toISOString(), orderBy: cutoff.toISOString() });
    await page.clock.install({ time: new Date(cutoff.getTime() - 93 * 60_000) });

    const checkoutPage = new CheckoutPage(page);
    await checkoutPage.open();
    const countdown = checkoutPage.main.getByText(/^Order within/);
    await expect(checkoutPage.delivery.root).toContainText('Today · 1 item');
    await expect(countdown).toHaveText('Order within 1 h 33 min');

    await page.clock.runFor('01:00:00');
    await expect(countdown, 'One hour later').toHaveText('Order within 33 min');

    await page.clock.runFor('00:34:00');
    await expect(countdown, 'Past the cut-off nothing is left to count down').toHaveCount(0);
  });

  test('after the cut-off the cart says "Tomorrow" and shows no countdown', async ({ page, storeInfo }) => {
    const day = dubaiDay(new Date());
    const tomorrow = addDays(day, 1);
    await serveEstimate(page, { date: dubaiTime(tomorrow, '12:00').toISOString(), orderBy: null });
    // 2 hours after today's cut-off.
    await page.clock.install({
      time: new Date(dubaiTime(day, storeInfo.sameDayCutoff).getTime() + 2 * 3_600_000),
    });

    const cartPage = new CartPage(page);
    await cartPage.open();
    await expect(cartPage.lines.heading).toHaveText(/^Tomorrow · 1 item$/);
    await expect(cartPage.main.getByText(/^Order within/)).toHaveCount(0);
  });

  test('a delivery further away shows its date, not "Tomorrow"', async ({ page }) => {
    const day = dubaiDay(new Date());
    const later = addDays(day, 3);
    await serveEstimate(page, { date: dubaiTime(later, '12:00').toISOString(), orderBy: null });
    await page.clock.install({ time: dubaiTime(day, '15:00') });

    const cartPage = new CartPage(page);
    await cartPage.open();
    await expect(cartPage.lines.heading).not.toHaveText(/^(Today|Tomorrow) ·/);
    await expect(cartPage.lines.heading).toHaveText(/· 1 item$/);
  });
});
