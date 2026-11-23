/**
 * Checkout API: refused checkouts first (none may place an order), then the order a cash-on-delivery
 * checkout creates, a card checkout that is started but not paid (priced by the server, not payable from
 * the pay page), and a double submit.
 *
 * BUDGET: POST /cart/checkout allows ~10 calls per customer per ~10 minutes, refused calls included
 * (see utils/rateLimit.ts). This file makes 9 calls and the checkout UI file 2. Add a checkout call only
 * if you take one away elsewhere. Every call goes through `retryOn429`, so a quick re-run waits instead
 * of failing.
 *
 * Positive tests place real orders on dev (cash on delivery is never collected). Runs in the `customer`
 * project, one test at a time.
 */
import {
  errorMessage,
  json,
  type Address,
  type Api,
  type CheckoutInput,
  type OrderDetail,
  type OrderPayment,
  type OrderSummary,
  type Page,
} from '../../api';
import { knownBug } from '../../utils/knownBug';
import { expect, test } from '../../fixtures/test';
import { sameMoney } from '../../utils/dom';
import { CHECKOUT_TEST_TIMEOUT, retryOn429 } from '../../utils/rateLimit';
import { env } from '../../config/env';
import { expectedTotals, MISSING_ID, outOfStockProduct, purchasableProducts, quantityForExactly, round2 } from '../../utils/shop';
import { buildAddress } from '../../utils/testData';

test.describe.configure({ mode: 'default', timeout: CHECKOUT_TEST_TIMEOUT });

let address: Address;

test.beforeAll(async ({ customerApi }) => {
  address = await json<Address>(customerApi.users.createAddress(buildAddress()));
});
test.afterAll(async ({ customerApi }) => {
  if (address) await customerApi.users.deleteAddress(address.id);
});
test.beforeEach(async ({ customerApi }) => {
  await json(customerApi.cart.clear());
});
test.afterEach(async ({ customerApi }) => {
  await customerApi.cart.clear();
});

const checkout = (customerApi: Api, body: CheckoutInput | Record<string, unknown>) =>
  retryOn429(() => customerApi.cart.raw('POST', '/checkout', body));

const orderCount = async (api: Api): Promise<number> =>
  (await json<Page<OrderSummary>>(api.orders.list({ page: 1, limit: 1 }))).total;

/** Two products whose subtotal is just above the minimum order, so checkout is allowed. */
async function seedCheckoutableCart(api: Api, customerApi: Api, minOrder: number) {
  const { product, quantity } = await quantityForExactly(api, minOrder);
  const [other] = (await purchasableProducts(api, 5)).filter((p) => p.id !== product.id);
  return customerApi.cart.seed([
    { productId: product.id, quantity },
    { productId: other.id, quantity: 1 },
  ]);
}

test.describe('Checkout API: refused checkouts place no order', { tag: ['@checkout', '@api', '@negative'] }, () => {
  test('an empty cart cannot be checked out', async ({ customerApi }) => {
    const before = await orderCount(customerApi);
    const response = await checkout(customerApi, { consentForSimilarProducts: 'false', paymentMethod: 'cod', addressId: address.id });
    expect([400, 404], `Empty cart answered ${response.status()}`).toContain(response.status());
    expect(await errorMessage(response)).toBe('Cart is empty');
    expect(await orderCount(customerApi)).toBe(before);
  });

  test('a cart one item below the minimum order cannot be checked out, and keeps its items', async ({ api, customerApi, storeInfo }) => {
    const { product, quantity } = await quantityForExactly(api, storeInfo.minOrderAmount);
    await customerApi.cart.seed([{ productId: product.id, quantity: quantity - 1 }]);
    const before = await orderCount(customerApi);
    const response = await checkout(customerApi, { consentForSimilarProducts: 'false', paymentMethod: 'cod', addressId: address.id });
    expect(response.status()).toBe(400);
    expect(await errorMessage(response)).toMatch(new RegExp(`Minimum order amount.*${storeInfo.minOrderAmount}`));
    expect(await orderCount(customerApi)).toBe(before);
    expect((await customerApi.cart.current()).items, 'The refused checkout emptied the cart').toHaveLength(1);
  });

  test('a bad payment method, a bad delivery choice and a missing out-of-stock choice are all named', async ({ api, customerApi, storeInfo }) => {
    // One call checks three rules: the API reports every validation error at once.
    await seedCheckoutableCart(api, customerApi, storeInfo.minOrderAmount);
    const response = await checkout(customerApi, { paymentMethod: 'bitcoin', deliveryPreference: 'whenever', addressId: address.id });
    expect(response.status()).toBe(400);
    const message = await errorMessage(response);
    expect(message).toContain('paymentMethod must be one of the following values: card, cod');
    expect(message).toContain('consentForSimilarProducts should not be empty');
    expect(message).toMatch(/deliveryPreference must be one of the following values/);
  });

  test('an address that does not exist is refused with 404', async ({ api, customerApi, storeInfo }) => {
    await seedCheckoutableCart(api, customerApi, storeInfo.minOrderAmount);
    const before = await orderCount(customerApi);
    const response = await checkout(customerApi, { consentForSimilarProducts: 'false', paymentMethod: 'cod', addressId: MISSING_ID });
    expect(response.status()).toBe(404);
    expect(await errorMessage(response)).toBe('Address not found');
    expect(await orderCount(customerApi)).toBe(before);
  });

  test('a cart holding an out-of-stock product cannot be checked out', { tag: '@stock' }, async ({ api, customerApi, storeInfo }) => {
    const product = await outOfStockProduct(api);
    await seedCheckoutableCart(api, customerApi, storeInfo.minOrderAmount);
    // Only possible while the cart still accepts out-of-stock products (known bug cart-accepts-out-of-stock).
    await customerApi.cart.add(product.id, 1);
    const inCart = (await customerApi.cart.current()).items.some((i) => i.product.id === product.id);
    test.skip(!inCart, 'The cart refuses out-of-stock products now, so such a cart cannot be built');

    const before = await orderCount(customerApi);
    const response = await checkout(customerApi, { consentForSimilarProducts: 'false', paymentMethod: 'cod', addressId: address.id });
    expect(response.status(), `Checkout with "${product.name}" (out of stock) answered ${response.status()}`).toBeGreaterThanOrEqual(400);
    expect(await orderCount(customerApi), 'An order was placed for an out-of-stock product').toBe(before);
  });

  test('a guest cannot check out', { tag: '@security' }, async ({ api }) => {
    // No customer, so this does not use up the customer's checkout budget.
    expect((await api.cart.checkout({ consentForSimilarProducts: 'false', paymentMethod: 'cod' })).status()).toBe(401);
  });
});

test.describe('Checkout API: placing orders', { tag: ['@checkout', '@api'] }, () => {
  test('cash on delivery places the order with every cart line and the COD fee, and empties the cart', { tag: '@smoke' }, async ({ api, customerApi, storeInfo }) => {
    const cart = await seedCheckoutableCart(api, customerApi, storeInfo.minOrderAmount);
    const want = expectedTotals(cart.subTotal, storeInfo, 'cod');
    const response = await checkout(customerApi, { consentForSimilarProducts: 'true', paymentMethod: 'cod', addressId: address.id });
    expect(response.status(), await response.text()).toBe(201);
    const result = (await response.json()) as { orderId?: string; id?: string; redirectType?: string };
    const orderId = result.orderId ?? result.id ?? '';
    expect(orderId, `No order id in ${JSON.stringify(result)}`).toBeTruthy();

    const order = await json<OrderDetail>(customerApi.orders.getById(orderId));
    await test.step('the order holds exactly the cart lines at the cart prices', async () => {
      const byId = (items: { product: { id: string }; quantity: number }[]) =>
        items.map((i) => [i.product.id, i.quantity]).sort();
      expect(byId(order.items)).toEqual(byId(cart.items));
      for (const item of order.items) {
        // Order prices come back as strings ("3.00"), cart prices as numbers: compare the amounts.
        expect(Number(item.price)).toBe(cart.items.find((c) => c.product.id === item.product.id)?.price);
      }
    });
    await test.step('the totals follow the store rules for cash on delivery', async () => {
      expect(sameMoney(order.subTotalAmount, want.subTotal), `subtotal ${order.subTotalAmount}`).toBe(true);
      expect(sameMoney(order.vatAmount, want.vat), `VAT ${order.vatAmount}`).toBe(true);
      expect(order.deliveryAmount).toBe(want.deliveryFee);
      expect(order.codFee).toBe(storeInfo.codFee);
      expect(sameMoney(order.totalAmount, want.total), `total ${order.totalAmount}, expected ${want.total}`).toBe(true);
    });
    await test.step('the order is unpaid, goes to the chosen address, and is first in the order list', async () => {
      expect(order.paymentStatus).toBe('pending');
      expect(order.address?.nickName).toBe(address.nickName);
      const list = await json<Page<OrderSummary>>(customerApi.orders.list({ page: 1, limit: 1 }));
      expect(list.data[0].id).toBe(orderId);
      expect(list.data[0].itemsCount).toBe(cart.items.reduce((n, i) => n + i.quantity, 0));
    });
    await test.step('the cart is empty afterwards', async () => {
      expect((await customerApi.cart.current()).items).toEqual([]);
    });
    await test.step('the public pay page knows the order and asks for the full amount', async () => {
      const payment = await json<OrderPayment>(api.payment.order(orderId));
      expect(payment.displayId).toBe(order.displayId);
      expect(payment.paymentStatus).toBe('pending');
      expect(sameMoney(payment.totalAmount, order.totalAmount)).toBe(true);
    });
  });

  test('a card checkout with the test coupon only starts a payment, for the coupon price: no order yet, and the cart is kept', { tag: '@pricing' }, async ({ api, customerApi, storeInfo }) => {
    // Well above the minimum, so the 10% coupon cannot take the cart below it.
    const { product, quantity } = await quantityForExactly(api, storeInfo.deliveryCutOff + 100);
    const [other] = (await purchasableProducts(api, 5)).filter((p) => p.id !== product.id);
    const full = await customerApi.cart.seed([
      { productId: product.id, quantity },
      { productId: other.id, quantity: 1 },
    ]);
    const applied = await customerApi.coupons.apply(env.testData.couponCode);
    expect(applied.ok(), `${env.testData.couponCode} was refused: ${await errorMessage(applied)}`).toBe(true);
    const cart = await customerApi.cart.current();
    expect(cart.subTotal, 'The coupon did not lower the subtotal').toBeLessThan(full.subTotal);
    const before = await orderCount(customerApi);
    // Totals sent by the shopper must be ignored: the server prices the order itself.
    const tampered = { totalAmount: 1, subTotal: 1, deliveryFee: 0, vat: 0, discount: 999 };
    const response = await checkout(customerApi, { consentForSimilarProducts: 'false', paymentMethod: 'card', addressId: address.id, ...tampered });
    expect(response.status(), await response.text()).toBe(201);
    const { orderId } = (await response.json()) as { orderId: string };
    expect(await orderCount(customerApi), 'An unpaid card checkout showed up as an order').toBe(before);
    expect((await customerApi.cart.current()).items).toHaveLength(2);

    await test.step('the started payment is the cart total with the coupon, not the totals the shopper sent', async () => {
      const payment = await json<OrderPayment>(api.payment.order(orderId));
      const want = expectedTotals(cart.subTotal, storeInfo, 'card').total;
      expect(sameMoney(want, cart.total), `cart total ${cart.total}, rules say ${want}`).toBe(true);
      expect(sameMoney(payment.totalAmount, want), `payment total ${payment.totalAmount}, expected ${want}`).toBe(true);
    });
    await test.step('it cannot be paid from the pay page, and confirming it without paying keeps it unpaid', async () => {
      const payment = await json<OrderPayment>(api.payment.order(orderId));
      expect(payment).toMatchObject({ status: 'awaiting-payment', paymentStatus: 'pending', isPayable: false });
      const link = await api.payment.link(orderId);
      expect(link.status()).toBe(409);
      expect(await errorMessage(link)).toBe('This order can no longer be paid online');
      expect((await customerApi.payment.confirm(orderId)).status()).toBeLessThan(500);
      expect((await json<OrderPayment>(api.payment.order(orderId))).paymentStatus).toBe('pending');
    });
  });

  test('two checkouts sent at the same moment place only one order', { tag: '@resilience' }, async ({ api, customerApi, storeInfo }) => {
    knownBug('checkout-double-submit-two-orders');
    await seedCheckoutableCart(api, customerApi, storeInfo.minOrderAmount);
    const before = await orderCount(customerApi);
    const body = { consentForSimilarProducts: 'false', paymentMethod: 'cod', addressId: address.id };
    const [first, second] = await Promise.all([checkout(customerApi, body), checkout(customerApi, body)]);
    const statuses = [first.status(), second.status()].sort();
    expect(await orderCount(customerApi), `Double submit answered ${statuses.join(' and ')}`).toBe(before + 1);
    expect(statuses.filter((s) => s === 201), 'Exactly one of the two should succeed').toHaveLength(1);
  });

  test('the pay page and payment confirmation answer 404 for an order that does not exist', { tag: '@negative' }, async ({ api, customerApi }) => {
    expect((await api.payment.order(MISSING_ID)).status()).toBe(404);
    expect((await customerApi.payment.confirm(MISSING_ID)).status()).toBe(404);
  });

  test('VAT is charged on the subtotal only, never on the delivery fee', { tag: '@pricing' }, async ({ api, customerApi, storeInfo }) => {
    const cart = await seedCheckoutableCart(api, customerApi, storeInfo.minOrderAmount);
    test.skip(cart.deliveryFee === 0, 'Delivery is free for this cart, so the two cannot be told apart');
    expect(cart.vat).toBeCloseTo(round2((cart.subTotal * storeInfo.taxPercentage) / 100), 2);
    expect(cart.vat).not.toBeCloseTo(round2(((cart.subTotal + cart.deliveryFee) * storeInfo.taxPercentage) / 100), 2);
  });
});
