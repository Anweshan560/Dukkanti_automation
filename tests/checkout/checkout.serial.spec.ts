/**
 * Checkout page, as the signed-in customer.
 *
 * BUDGET: only two tests here call POST /cart/checkout (see checkout.serial.api.spec.ts): the cash-on-
 * delivery order and the card test, which covers an empty card, a declined card, "Try another card" and a
 * successful payment in one payment session. Everything else stops before Proceed, or answers the
 * checkout call from the test itself without reaching the server.
 *
 * Places two real orders on dev per run. Runs in the `customer` project, one test at a time.
 */
import { json, type OrderDetail, type OrderSummary, type Page as ApiPage, type Address } from '../../api';
import { env } from '../../config/env';
import { expect, test } from '../../fixtures/test';
import { STRIPE_CARDS } from '../../pages/checkout/CheckoutPage';
import { sameMoney } from '../../utils/dom';
import { recordApiCalls, waitForApi } from '../../utils/network';
import { absorbCheckoutRateLimit, CHECKOUT_TEST_TIMEOUT } from '../../utils/rateLimit';
import { expectedTotals, purchasableProducts, quantityForExactly, round2, type ExpectedTotals } from '../../utils/shop';

test.use({ storageState: env.storageState.customer });
test.describe.configure({ mode: 'default' });

test.beforeEach(async ({ customerApi }) => {
  await json(customerApi.cart.clear());
});
test.afterEach(async ({ customerApi }) => {
  await customerApi.cart.clear();
});

/** A cart just above the minimum order (delivery is charged). */
async function seedAboveMinimum(api: import('../../api').Api, customerApi: import('../../api').Api, minOrder: number) {
  const { product, quantity } = await quantityForExactly(api, minOrder);
  return customerApi.cart.seed([{ productId: product.id, quantity: quantity + 1 }]);
}

/** The four amounts the order summary shows. */
const amounts = ({ subTotal, vat, deliveryFee, total }: ExpectedTotals) => ({ subTotal, vat, deliveryFee, total });

test.describe('Checkout page before paying', { tag: ['@checkout'] }, () => {
  test('shows the delivery address, the out-of-stock choice, the payment choice and the summary', async ({ api, customerApi, checkoutPage, storeInfo }) => {
    const cart = await seedAboveMinimum(api, customerApi, storeInfo.minOrderAmount);
    const addresses = await json<Address[]>(customerApi.users.listAddresses());
    test.skip(!addresses.length, 'The test customer has no saved address');
    await checkoutPage.open();
    await checkoutPage.waitUntilReady();
    await expect(checkoutPage.deliverTo).toContainText(/Deliver to/);
    await expect(checkoutPage.outOfStock.getByRole('radio', { name: 'Replace' })).toBeChecked();
    for (const option of ['Call me', 'Replace', 'Refund']) {
      await expect(checkoutPage.outOfStock.getByRole('radio', { name: option })).toBeVisible();
    }
    await expect(checkoutPage.payNow).toBeChecked();
    // The fee is part of the radio's label ("Pay on delivery + 10 fee …"), not text inside the radio.
    await expect(checkoutPage.payOnDelivery).toHaveAccessibleName(new RegExp(`\\+ ${storeInfo.codFee} fee`));
    const want = expectedTotals(cart.subTotal, storeInfo, 'card');
    await checkoutPage.summary.expectAmounts({ subTotal: want.subTotal, vat: want.vat, deliveryFee: want.deliveryFee, total: want.total });
    await expect(checkoutPage.proceed).toBeEnabled();
    expect(await checkoutPage.proceedAmount()).toBe(want.total);
  });

  test('choosing pay on delivery adds the COD fee to the amount to pay, and switching back removes it', { tag: '@pricing' }, async ({ api, customerApi, checkoutPage, storeInfo }) => {
    const cart = await seedAboveMinimum(api, customerApi, storeInfo.minOrderAmount);
    await checkoutPage.open();
    await checkoutPage.waitUntilReady();
    const card = expectedTotals(cart.subTotal, storeInfo, 'card');
    const cod = expectedTotals(cart.subTotal, storeInfo, 'cod');
    await checkoutPage.choosePayment('cod');
    await expect.poll(() => checkoutPage.proceedAmount(), { message: 'Amount on the button with pay on delivery' }).toBe(cod.total);
    await checkoutPage.choosePayment('card');
    await expect.poll(() => checkoutPage.proceedAmount(), { message: 'Amount on the button with pay now' }).toBe(card.total);
  });

  test('below the minimum order Proceed is disabled and the page says how much is missing', { tag: ['@negative', '@states'] }, async ({ api, customerApi, checkoutPage, storeInfo, page }) => {
    const { product, quantity } = await quantityForExactly(api, storeInfo.minOrderAmount);
    const cart = await customerApi.cart.seed([{ productId: product.id, quantity: quantity - 1 }]);
    const calls = recordApiCalls(page);
    await checkoutPage.open();
    await checkoutPage.waitUntilReady();
    const missing = round2(storeInfo.minOrderAmount - cart.subTotal);
    await expect(checkoutPage.minimumNotice).toHaveText(new RegExp(`Add\\s*${missing.toFixed(2)} more to reach minimum order`));
    await expect(checkoutPage.proceed).toBeDisabled();
    await checkoutPage.proceed.click({ force: true }).catch(() => {});
    calls.stop();
    expect(calls.calls.filter((c) => c.path.startsWith('/cart/checkout')), 'A disabled Proceed still called checkout').toEqual([]);
  });

  test('an empty cart sends the shopper away from checkout, with no checkout form', { tag: '@states' }, async ({ customerApi, checkoutPage, page }) => {
    await json(customerApi.cart.clear());
    await page.goto('/checkout');
    // Since 2026-11 an empty cart redirects to the home page; before, /checkout showed "Your cart is empty".
    await expect(page.getByRole('heading', { name: 'Checkout', level: 1 }).or(checkoutPage.emptyMessage).or(page.getByRole('heading', { level: 1 }).first())).toBeVisible();
    await expect(async () => {
      const redirected = !new URL(page.url()).pathname.startsWith('/checkout');
      expect(redirected || (await checkoutPage.emptyMessage.isVisible()), 'Still on a checkout form with an empty cart').toBe(true);
    }).toPass({ timeout: 15_000 });
    await expect(checkoutPage.proceed).toHaveCount(0);
  });

  test('an unknown coupon is refused with a message and the totals do not change', { tag: ['@negative', '@pricing'] }, async ({ api, customerApi, checkoutPage, storeInfo, page }) => {
    const cart = await seedAboveMinimum(api, customerApi, storeInfo.minOrderAmount);
    await checkoutPage.open();
    await checkoutPage.waitUntilReady();
    await expect(checkoutPage.applyCoupon, 'Apply should wait for a code').toBeDisabled();
    await checkoutPage.couponInput.fill('NOPE-NOT-A-CODE');
    await expect(checkoutPage.applyCoupon).toBeEnabled();
    const applied = waitForApi(page, 'POST', '/coupons/apply');
    await checkoutPage.applyCoupon.click();
    expect((await applied).status()).toBe(404);
    await expect(checkoutPage.couponError).toHaveText('Coupon not found');
    await expect(checkoutPage.couponInput).toHaveAttribute('aria-invalid', 'true');
    expect(await checkoutPage.summary.amount('Total')).toBe(expectedTotals(cart.subTotal, storeInfo).total);
  });

  test('the test coupon lowers the subtotal, VAT and amount to pay, and Remove puts them back', { tag: '@pricing' }, async ({ api, customerApi, checkoutPage, storeInfo, page }) => {
    const code = env.testData.couponCode;
    // Well above the free-delivery line, so the coupon changes only the subtotal and VAT.
    const { product, quantity } = await quantityForExactly(api, storeInfo.deliveryCutOff + 100);
    const cart = await customerApi.cart.seed([{ productId: product.id, quantity }]);
    await checkoutPage.open();
    await checkoutPage.waitUntilReady();

    await checkoutPage.couponInput.fill(code);
    const applied = waitForApi(page, 'POST', '/coupons/apply');
    await checkoutPage.applyCoupon.click();
    expect((await applied).ok(), `${code} was refused`).toBe(true);
    const saving = round2(cart.subTotal * 0.1);
    const remove = checkoutPage.couponBox.getByRole('button', { name: `Remove coupon ${code}` });
    await expect(remove).toBeVisible();
    await expect(checkoutPage.couponBox).toContainText(saving.toFixed(2));
    await checkoutPage.summary.expectAmounts(amounts(expectedTotals(round2(cart.subTotal - saving), storeInfo)));

    await remove.click();
    await expect(remove).toBeHidden();
    await checkoutPage.summary.expectAmounts(amounts(expectedTotals(cart.subTotal, storeInfo)));
    expect((await customerApi.cart.current()).appliedCoupons).toEqual([]);
  });

  test('a coupon code of only spaces cannot be applied', { tag: '@negative' }, async ({ api, customerApi, checkoutPage, storeInfo }) => {
    await seedAboveMinimum(api, customerApi, storeInfo.minOrderAmount);
    await checkoutPage.open();
    await checkoutPage.waitUntilReady();
    await checkoutPage.couponInput.fill('    ');
    await expect(checkoutPage.applyCoupon).toBeDisabled();
  });

  test('"View coupons" lists the coupons saved to the account', async ({ api, customerApi, checkoutPage, storeInfo, page }) => {
    await seedAboveMinimum(api, customerApi, storeInfo.minOrderAmount);
    const saved = await json<unknown[]>(customerApi.coupons.list());
    await checkoutPage.open();
    await checkoutPage.waitUntilReady();
    await checkoutPage.viewCoupons.click();
    const dialog = page.getByRole('dialog', { name: 'My coupons' });
    await expect(dialog).toBeVisible();
    if (!saved.length) await expect(dialog.getByText('No coupons yet')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
  });

  test('the address picker lists every saved address and the choice shows in "Deliver to"', async ({ api, customerApi, checkoutPage, storeInfo }) => {
    await seedAboveMinimum(api, customerApi, storeInfo.minOrderAmount);
    const addresses = await json<Address[]>(customerApi.users.listAddresses());
    test.skip(addresses.length < 2, 'Needs two saved addresses');
    await checkoutPage.open();
    await checkoutPage.waitUntilReady();
    await checkoutPage.deliverTo.click();
    const radios = checkoutPage.addressPicker.getByRole('radio');
    await expect(radios).toHaveCount(addresses.length);
    // The radio itself is a hidden dot; its label is what the shopper clicks.
    // Pin the radio by position: a { checked: false } locator would move to another radio once this one is checked.
    const states: boolean[] = [];
    for (let i = 0; i < addresses.length; i++) states.push(await radios.nth(i).isChecked());
    const index = states.indexOf(false);
    expect(index, 'Every address is already chosen').toBeGreaterThanOrEqual(0);
    const unchecked = radios.nth(index);
    const labelId = (await unchecked.getAttribute('aria-labelledby')) ?? '';
    const label = checkoutPage.addressPicker.locator(`[id="${labelId}"]`);
    const name = (await label.innerText()).trim();
    await label.click();
    // Choosing an address closes the picker at once (or, in older builds, shows the choice checked).
    const picker = checkoutPage.addressPicker;
    await expect.poll(async () => !(await picker.isVisible()) || (await unchecked.isChecked().catch(() => false)), { message: 'The choice was taken' }).toBe(true);
    await expect(picker).toBeHidden({ timeout: 5_000 }).catch(() => picker.page().keyboard.press('Escape'));
    await expect(picker).toBeHidden();
    // The label is "Home" + nickname on two lines; the button runs them together. Compare without spaces.
    const squash = (text: string) => text.split(',')[0].replace(/\s+/g, '');
    await expect.poll(async () => squash(await checkoutPage.deliverTo.innerText()).includes(squash(name)), { message: `"Deliver to" shows ${name}` }).toBe(true);
  });

  test('when the server fails to place the order, the shopper stays on checkout with an error and no order is made', { tag: ['@negative', '@resilience'] }, async ({ api, customerApi, checkoutPage, storeInfo, page }) => {
    await seedAboveMinimum(api, customerApi, storeInfo.minOrderAmount);
    const before = (await json<ApiPage<OrderSummary>>(customerApi.orders.list({ page: 1, limit: 1 }))).total;
    // Answered here, so the real checkout (and its rate limit) is never reached.
    await page.route(`${env.apiUrl}/cart/checkout`, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"statusCode":500,"message":"Internal server error"}' }),
    );
    await checkoutPage.open();
    await checkoutPage.waitUntilReady();
    await checkoutPage.choosePayment('cod');
    await checkoutPage.proceed.click();
    await expect(page.getByRole('region', { name: 'Notifications' }).or(page.getByRole('alert')).first()).toContainText(/.+/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(checkoutPage.proceed).toBeEnabled();
    expect((await json<ApiPage<OrderSummary>>(customerApi.orders.list({ page: 1, limit: 1 }))).total).toBe(before);
    expect((await customerApi.cart.current()).items, 'The failed checkout emptied the cart').toHaveLength(1);
  });
});

test.describe('Placing an order', { tag: ['@checkout'] }, () => {
  test.describe.configure({ timeout: CHECKOUT_TEST_TIMEOUT });

  test('pay on delivery: a double click places one order, the confirmation and the order match the cart', { tag: '@smoke' }, async ({ api, customerApi, checkoutPage, orderConfirmation, storeInfo, page }) => {
    const cart = await seedAboveMinimum(api, customerApi, storeInfo.minOrderAmount);
    const want = expectedTotals(cart.subTotal, storeInfo, 'cod');
    await absorbCheckoutRateLimit(page);
    const calls = recordApiCalls(page);
    await checkoutPage.open();
    await checkoutPage.waitUntilReady();
    await checkoutPage.choosePayment('cod');
    await checkoutPage.outOfStock.getByRole('radio', { name: 'Refund' }).check();
    const placed = page.waitForRequest((r) => r.url() === `${env.apiUrl}/cart/checkout` && r.method() === 'POST');
    await checkoutPage.proceed.dblclick();
    const request = await placed;
    const orderId = await orderConfirmation.expectOpen();
    calls.stop();

    await test.step('one checkout call, with the choices made on the page', async () => {
      expect(calls.calls.filter((c) => c.method === 'POST' && c.path === '/cart/checkout'), 'A double click sent two checkouts').toHaveLength(1);
      const body = request.postDataJSON() as Record<string, unknown>;
      expect(body.paymentMethod).toBe('cod');
      // The out-of-stock choice travels as a word, not a yes/no: "Refund" is refund_and_deliver.
      expect(body.consentForSimilarProducts, '"Refund" was not sent as the out-of-stock choice').toBe('refund_and_deliver');
    });
    await test.step('the confirmation shows the cash-on-delivery total', async () => {
      await expect(orderConfirmation.main).toContainText('Pay on delivery');
      expect(await orderConfirmation.total()).toBe(want.total);
      await expect(orderConfirmation.trackOrder).toHaveAttribute('href', `/account/orders/${orderId}`);
    });
    await test.step('the order holds the cart lines and the COD totals', async () => {
      const order = await json<OrderDetail>(customerApi.orders.getById(orderId));
      expect(order.items.map((i) => [i.product.id, i.quantity])).toEqual(cart.items.map((i) => [i.product.id, i.quantity]));
      expect(sameMoney(order.totalAmount, want.total), `Order total ${order.totalAmount}, expected ${want.total}`).toBe(true);
      expect(order.paymentStatus).toBe('pending');
      expect(order.consentForSimilarProducts, 'The order did not keep the out-of-stock choice').toBe('refund_and_deliver');
      await expect(orderConfirmation.whatsApp).toHaveAttribute('href', new RegExp(`order%20?%23${order.displayId}|%23${order.displayId}`));
    });
    await test.step('the cart is empty and "Track order" opens the order', async () => {
      expect((await customerApi.cart.current()).items).toEqual([]);
      await orderConfirmation.trackOrder.click();
      await expect(page).toHaveURL(new RegExp(`/account/orders/${orderId}$`));
    });
  });

  test('card: an empty card is stopped by Stripe, a declined card can be retried, and a good card pays the order', { tag: '@smoke' }, async ({ api, customerApi, checkoutPage, orderConfirmation, storeInfo, page }) => {
    const cart = await seedAboveMinimum(api, customerApi, storeInfo.minOrderAmount);
    const want = expectedTotals(cart.subTotal, storeInfo, 'card');
    const ordersBefore = (await json<ApiPage<OrderSummary>>(customerApi.orders.list({ page: 1, limit: 1 }))).total;
    await absorbCheckoutRateLimit(page);
    await checkoutPage.open();
    await checkoutPage.waitUntilReady();
    await checkoutPage.choosePayment('card');
    await checkoutPage.proceed.click();
    const pay = checkoutPage.payDialog;
    await expect(pay.root).toBeVisible({ timeout: CHECKOUT_TEST_TIMEOUT });
    await expect(pay.payButton).toContainText(want.total.toFixed(2));

    await test.step('an empty card number is caught before anything is charged', async () => {
      await pay.openCardForm();
      await pay.payButton.click();
      await expect(pay.stripe.getByText(/card number is incomplete|card number is invalid|Required/i).first()).toBeVisible();
      await expect(page).toHaveURL(/\/checkout$/);
    });

    await test.step('a declined card shows the failure, places no order and keeps the cart', async () => {
      await pay.enterCard(STRIPE_CARDS.declined);
      await pay.payButton.click();
      await expect(checkoutPage.paymentFailed.root).toBeVisible({ timeout: 30_000 });
      await expect(checkoutPage.paymentFailed.root).toContainText("you haven't been charged");
      await expect(checkoutPage.paymentFailed.payOnDelivery).toContainText(expectedTotals(cart.subTotal, storeInfo, 'cod').total.toFixed(2));
      expect((await json<ApiPage<OrderSummary>>(customerApi.orders.list({ page: 1, limit: 1 }))).total, 'A declined card created an order').toBe(ordersBefore);
      expect((await customerApi.cart.current()).items).toHaveLength(1);
    });

    let orderId = '';
    await test.step('"Try another card" with a good card pays and places the order', async () => {
      await checkoutPage.paymentFailed.tryAnotherCard.click();
      await pay.enterCard(STRIPE_CARDS.success);
      const confirmed = waitForApi(page, 'POST', /\/payment\/orders\/[^/]+\/confirm/, 60_000);
      await pay.payButton.click();
      expect((await confirmed).ok()).toBe(true);
      orderId = await orderConfirmation.expectOpen();
      await expect(orderConfirmation.main).toContainText('Paid by card');
      expect(await orderConfirmation.total()).toBe(want.total);
    });

    await test.step('exactly one order exists for it, paid, without the COD fee', async () => {
      const order = await json<OrderDetail>(customerApi.orders.getById(orderId));
      expect(order.paymentStatus).toBe('paid');
      expect(order.codFee).toBe(0);
      expect(sameMoney(order.totalAmount, want.total)).toBe(true);
      expect((await json<ApiPage<OrderSummary>>(customerApi.orders.list({ page: 1, limit: 1 }))).total).toBe(ordersBefore + 1);
      expect((await customerApi.cart.current()).items).toEqual([]);
    });
  });
});

test.describe('Checkout for a guest', { tag: ['@checkout', '@security'] }, () => {
  test.use({ storageState: env.storageState.guest });

  test('a guest who opens /checkout is asked to sign in and sees no order form', async ({ page, signInDialog }) => {
    await page.goto('/checkout');
    await signInDialog.expectOpen();
    await expect(page.getByRole('button', { name: /^Proceed to pay/ })).toHaveCount(0);
  });

  test('a guest with a product id cannot reach the payment step through the API', async ({ api }) => {
    const [product] = await purchasableProducts(api, 1);
    expect((await api.cart.add(product.id, 1)).status()).toBe(401);
  });
});
