/**
 * Pay page API: `GET /payment/orders/{id}` and `POST /payment/orders/{id}/link`.
 *
 * The store sends a WhatsApp pay link for unpaid cash-on-delivery orders. The link holds only the order id
 * and works without signing in, so these endpoints are public by design. The tests check that they give
 * away nothing but the order number and amount, open one payment page per order, and refuse orders that
 * are paid or cannot be paid online. (A card checkout that was started but never paid is checked in
 * tests/checkout/checkout.serial.api.spec.ts, where that order is made.)
 *
 * Reuses unpaid COD orders the checkout tests leave behind: no checkout call unless none is left. Runs in
 * the `customer` project because it reads the shared customer's orders.
 */
import { buildApi, errorMessage, json, type OrderPayment, type PayLink } from '../../api';
import { env } from '../../config/env';
import { expect, test } from '../../fixtures/test';
import { sameMoney } from '../../utils/dom';
import { CHECKOUT_TEST_TIMEOUT } from '../../utils/rateLimit';
import { MISSING_ID } from '../../utils/shop';
import { paidOrder, payableOrders } from './payableOrders';

// Room for the rare case where no unpaid order is left and one has to wait for the checkout rate limit.
test.describe.configure({ timeout: CHECKOUT_TEST_TIMEOUT });

/** The only fields the public pay details may hold: no name, phone, address or items. */
const PAYMENT_FIELDS = [
  'amountDue',
  'displayId',
  'id',
  'isPayable',
  'paymentStatus',
  'status',
  'totalAmount',
];

/** The Stripe Checkout session a pay link points to (the part after `#` changes on every call). */
const stripeSession = (url: string): string => new URL(url).pathname;

test.describe('Pay page API: an unpaid cash order', { tag: ['@payment', '@api'] }, () => {
  test(
    'asks for the full order total and gives away nothing but the order number and amounts',
    { tag: '@security' },
    async ({ api, customerApi, storeInfo, cleanup }) => {
      const [payment] = await payableOrders(customerApi, 1, { api, storeInfo, cleanup });
      const order = await customerApi.orders.detail(payment.id);
      const asGuest = await json<OrderPayment>(api.payment.order(payment.id));

      expect(Object.keys(asGuest).sort(), 'The public pay details hold more than the pay page needs').toEqual(
        PAYMENT_FIELDS,
      );
      expect(asGuest, 'A guest and the customer should see the same pay details').toEqual(payment);
      expect(asGuest.displayId).toBe(order.displayId);
      expect(
        sameMoney(asGuest.totalAmount, order.totalAmount),
        `total ${asGuest.totalAmount} vs order ${order.totalAmount}`,
      ).toBe(true);
      expect(
        sameMoney(asGuest.amountDue, order.totalAmount),
        `amount due ${asGuest.amountDue} vs order ${order.totalAmount}`,
      ).toBe(true);
    },
  );

  test('a pay link opens a Stripe Checkout page, and asking again reuses the same page', async ({
    api,
    customerApi,
    storeInfo,
    cleanup,
  }) => {
    const [payment] = await payableOrders(customerApi, 1, { api, storeInfo, cleanup });
    const first = await api.payment.link(payment.id);
    expect(first.status(), await first.text()).toBe(201);
    const { url } = (await first.json()) as PayLink;
    expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\/[^#]*\/cs_test_/);

    const again = await json<PayLink>(api.payment.link(payment.id));
    expect(
      stripeSession(again.url),
      'A second link opened a second Stripe page, so the order could be paid twice',
    ).toBe(stripeSession(url));
    // Asking for a link takes no money and changes nothing on the order.
    expect(await json<OrderPayment>(api.payment.order(payment.id))).toEqual(payment);
  });

  test(
    'confirming a payment that never happened leaves the order unpaid',
    { tag: ['@security', '@negative'] },
    async ({ api, customerApi, storeInfo, cleanup }) => {
      const [payment] = await payableOrders(customerApi, 1, { api, storeInfo, cleanup });
      const response = await customerApi.payment.confirm(payment.id);
      expect(response.status(), 'Confirm should report the order as it is, or refuse it').toBeLessThan(500);
      expect((await customerApi.orders.detail(payment.id)).paymentStatus).toBe('pending');
      expect((await json<OrderPayment>(api.payment.order(payment.id))).isPayable).toBe(true);
    },
  );

  test(
    'a guest cannot confirm a payment',
    { tag: ['@security', '@negative'] },
    async ({ api, customerApi, storeInfo, cleanup }) => {
      const [payment] = await payableOrders(customerApi, 1, { api, storeInfo, cleanup });
      expect((await api.payment.confirm(payment.id)).status()).toBe(401);
    },
  );

  test(
    "another customer cannot confirm this customer's order",
    { tag: ['@security', '@negative'] },
    async ({ api, customerApi, storeInfo, cleanup, playwright }) => {
      test.skip(
        !env.customer2,
        'Set CUSTOMER2_PHONE and CUSTOMER2_OTP in .env to test access between customers.',
      );
      const [payment] = await payableOrders(customerApi, 1, { api, storeInfo, cleanup });
      const context = await playwright.request.newContext();
      try {
        const { token } = await buildApi(context).users.loginAs(env.customer2!);
        expect([403, 404]).toContain((await buildApi(context, token).payment.confirm(payment.id)).status());
      } finally {
        await context.dispose();
      }
    },
  );
});

test.describe('Pay page API: orders that cannot be paid', { tag: ['@payment', '@api', '@negative'] }, () => {
  test('a paid order owes nothing and cannot be paid again (409)', async ({ api, customerApi }) => {
    const payment = await paidOrder(customerApi);
    test.skip(!payment, 'The customer has no paid order yet');
    expect(payment!.isPayable).toBe(false);
    expect(payment!.amountDue).toBe(0);
    expect((await customerApi.orders.detail(payment!.id)).paymentStatus).toBe('paid');
    const response = await api.payment.link(payment!.id);
    expect(response.status()).toBe(409);
    expect(await errorMessage(response)).toBe('This order is already paid');
  });

  test('an order that does not exist answers 404 for the details and the link', async ({ api }) => {
    expect((await api.payment.order(MISSING_ID)).status()).toBe(404);
    const link = await api.payment.link(MISSING_ID);
    expect(link.status()).toBe(404);
    expect(await errorMessage(link)).toBe('Order not found');
  });

  for (const [label, id] of [
    ['an id that is not a UUID', 'not-a-uuid'],
    ['an id that looks like SQL', "1' OR '1'='1"],
  ] as const) {
    test(`${label} is refused with 400, not a server error`, { tag: '@security' }, async ({ api }) => {
      for (const response of [await api.payment.order(id), await api.payment.link(id)]) {
        expect(response.status(), `${response.url()} answered ${response.status()}`).toBe(400);
      }
    });
  }
});

test.describe('Pay page API: old WhatsApp pay buttons', { tag: ['@payment', '@api'] }, () => {
  for (const kind of ['pay', 'cod'] as const) {
    test(`/payment/${kind}/{id} redirects to the website's pay page for that order`, async ({
      api,
      customerApi,
      storeInfo,
      cleanup,
    }) => {
      const [payment] = await payableOrders(customerApi, 1, { api, storeInfo, cleanup });
      const response = await api.payment.legacyPayLink(kind, payment.id);
      expect(response.status()).toBe(302);
      expect(response.headers()['location']).toBe(`${env.baseUrl}/pay/${payment.id}`);
    });
  }
});
