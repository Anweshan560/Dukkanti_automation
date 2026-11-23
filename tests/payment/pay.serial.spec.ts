/**
 * Pay page (`/pay/{orderId}`): what a shopper sees when they open the WhatsApp pay link for an order, as a
 * guest, and paying through Stripe Checkout (sandbox) with Stripe's test cards.
 *
 * The good-card test really pays one of the customer's unpaid cash-on-delivery test orders (Stripe test
 * mode, no money moves). Orders are reused from the checkout tests: no checkout call unless none is left.
 * Runs in the `customer` project because it changes the shared customer's orders.
 */
import { json, type OrderPayment } from '../../api';
import { env } from '../../config/env';
import { expect, test } from '../../fixtures/test';
import { STRIPE_CARDS } from '../../pages/checkout/CheckoutPage';
import { PayPage, StripeCheckoutPage } from '../../pages/payment/PayPage';
import { sameMoney } from '../../utils/dom';
import { CHECKOUT_TEST_TIMEOUT } from '../../utils/rateLimit';
import { MISSING_ID } from '../../utils/shop';
import { paidOrder, payableOrders } from './payableOrders';

test.describe.configure({ timeout: CHECKOUT_TEST_TIMEOUT });

const whatsAppText = (href: string | null): string =>
  new URL(href ?? 'https://x').searchParams.get('text') ?? '';

test.describe('Pay page', { tag: ['@payment'] }, () => {
  test('an unpaid cash order shows its number, the amount due and a Pay button', async ({
    page,
    api,
    customerApi,
    storeInfo,
    cleanup,
  }) => {
    const [payment] = await payableOrders(customerApi, 1, { api, storeInfo, cleanup });
    const payPage = new PayPage(page);
    expect(await payPage.openFor(payment.id)).toBe(200);

    await expect(payPage.heading).toHaveText(`Order #${payment.displayId}`);
    expect(
      sameMoney(await payPage.amount(), payment.amountDue),
      `shown ${await payPage.amount()}, due ${payment.amountDue}`,
    ).toBe(true);
    await expect(payPage.payButton).toBeEnabled();
    await expect(payPage.payButton).toHaveAccessibleName(`Pay ${payment.amountDue.toFixed(2)}`);
    expect(whatsAppText(await payPage.whatsApp.getAttribute('href'))).toContain(`#${payment.displayId}`);
  });

  test(
    'the pay page is kept out of search engines',
    { tag: '@security' },
    async ({ page, api, customerApi, storeInfo, cleanup }) => {
      const [payment] = await payableOrders(customerApi, 1, { api, storeInfo, cleanup });
      await new PayPage(page).openFor(payment.id);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    },
  );

  test('a paid order says it is paid, shows the amount and offers no Pay button', async ({
    page,
    customerApi,
  }) => {
    const payment = await paidOrder(customerApi);
    test.skip(!payment, 'The customer has no paid order yet');
    const payPage = new PayPage(page);
    expect(await payPage.openFor(payment!.id)).toBe(200);

    await expect(payPage.paidHeading(payment!.displayId)).toBeVisible();
    await expect(payPage.main).toContainText(
      `We received your payment of ${payment!.totalAmount.toFixed(2)}`,
    );
    await expect(payPage.payButton).toHaveCount(0);
    await expect(payPage.continueShopping).toHaveAttribute('href', '/');
  });

  for (const [label, id] of [
    ['an order that does not exist', MISSING_ID],
    ['a broken link', 'not-a-uuid'],
  ] as const) {
    test(
      `${label} shows "We couldn't find this order" with a 404 and ways back`,
      { tag: '@negative' },
      async ({ page }) => {
        const payPage = new PayPage(page);
        expect(await payPage.openFor(id)).toBe(404);
        await expect(payPage.heading).toHaveText("We couldn't find this order");
        await expect(payPage.payButton).toHaveCount(0);
        await expect(payPage.whatsApp).toBeVisible();
        await expect(payPage.main.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
      },
    );
  }
});

test.describe('Paying from the pay page', { tag: ['@payment', '@checkout'] }, () => {
  test('Pay opens Stripe Checkout for the same order and amount, and Back returns to the pay page', async ({
    page,
    api,
    customerApi,
    storeInfo,
    cleanup,
  }) => {
    const [payment] = await payableOrders(customerApi, 1, { api, storeInfo, cleanup });
    const payPage = new PayPage(page);
    await payPage.openFor(payment.id);
    await payPage.payButton.click();

    const stripe = new StripeCheckoutPage(page);
    await stripe.expectOpen(payment.displayId);
    expect(
      sameMoney(await stripe.amount(), payment.amountDue),
      `Stripe asks ${await stripe.amount()}, due ${payment.amountDue}`,
    ).toBe(true);
    await expect(stripe.back).toHaveAttribute('href', `${env.baseUrl}/pay/${payment.id}`);
  });

  test(
    'a declined card leaves the order unpaid and payable',
    { tag: '@negative' },
    async ({ page, api, customerApi, storeInfo, cleanup }) => {
      const [payment] = await payableOrders(customerApi, 1, { api, storeInfo, cleanup });
      const payPage = new PayPage(page);
      await payPage.openFor(payment.id);
      await payPage.payButton.click();

      const stripe = new StripeCheckoutPage(page);
      await stripe.expectOpen(payment.displayId);
      await stripe.payWith(STRIPE_CARDS.declined);
      await expect(stripe.declined).toBeVisible({ timeout: 30_000 });
      await expect(page).toHaveURL(/checkout\.stripe\.com/);

      const after = await json<OrderPayment>(api.payment.order(payment.id));
      expect(after).toMatchObject({
        paymentStatus: 'pending',
        isPayable: true,
        amountDue: payment.amountDue,
      });
    },
  );

  test(
    'a good test card pays the order: the pay page, the order and its timeline say so',
    { tag: '@smoke' },
    async ({ page, api, customerApi, storeInfo, cleanup }) => {
      const [payment] = await payableOrders(customerApi, 1, { api, storeInfo, cleanup });
      const payPage = new PayPage(page);
      await payPage.openFor(payment.id);
      await payPage.payButton.click();

      const stripe = new StripeCheckoutPage(page);
      await stripe.expectOpen(payment.displayId);
      await stripe.payWith(STRIPE_CARDS.success);

      await test.step('Stripe sends the shopper back to the pay page, which says the order is paid', async () => {
        await expect(page).toHaveURL(`${env.baseUrl}/pay/${payment.id}?paid=1`, { timeout: 60_000 });
        await expect(payPage.paidHeading(payment.displayId)).toBeVisible({ timeout: 30_000 });
        await expect(payPage.main).toContainText(
          `We received your payment of ${payment.amountDue.toFixed(2)}`,
        );
      });

      await test.step('the order is paid, owes nothing and cannot be paid again', async () => {
        // Stripe tells the store through a webhook, which can land a moment after the redirect.
        await expect
          .poll(async () => (await customerApi.orders.detail(payment.id)).paymentStatus, { timeout: 30_000 })
          .toBe('paid');
        expect(await json<OrderPayment>(api.payment.order(payment.id))).toMatchObject({
          paymentStatus: 'paid',
          isPayable: false,
          amountDue: 0,
        });
        expect((await api.payment.link(payment.id)).status()).toBe(409);
      });

      await test.step('the order timeline has a "Paid" step', async () => {
        const order = await customerApi.orders.detail(payment.id);
        expect(order.timelines.map((t) => t.status ?? t.title)).toContain('Paid');
      });
    },
  );
});
