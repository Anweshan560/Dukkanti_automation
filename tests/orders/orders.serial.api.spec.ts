/**
 * Orders API: listing, filtering, paging, order detail arithmetic, reorder, and who may see what.
 *
 * Reads the shared customer's orders and changes its cart (reorder), so it runs in the `customer`
 * project. It never places an order: it uses the orders the checkout tests and earlier runs left.
 */
import { buildApi, errorMessage, json, type Cart, type OrderDetail, type OrderSummary, type Page } from '../../api';
import { env } from '../../config/env';
import { knownBug } from '../../utils/knownBug';
import { expect, test } from '../../fixtures/test';
import { sameMoney } from '../../utils/dom';
import { MISSING_ID, purchasableProducts, round2 } from '../../utils/shop';

test.describe.configure({ mode: 'default' });

const ACTIVE = ['pending', 'paid', 'packaged', 'en-route', 'on-my-way', 'arrived', 'Pending', 'Paid', 'Packaging', 'Enroute'];
const PAST = ['delivered', 'failed', 'cancelled', 'Delivered', 'Failed', 'Cancelled'];

async function needOrders(customerApi: import('../../api').Api, count = 1): Promise<Page<OrderSummary>> {
  const page = await json<Page<OrderSummary>>(customerApi.orders.list({ page: 1, limit: 50 }));
  test.skip(page.total < count, `The test customer needs at least ${count} order(s); run the checkout tests first`);
  return page;
}

test.describe('Orders API: list and paging', { tag: ['@orders', '@api'] }, () => {
  test('the list has paging details that add up', async ({ customerApi }) => {
    const all = await needOrders(customerApi);
    const response = await customerApi.orders.list({ page: 1, limit: 2 });
    expect(response.status()).toBe(200);
    const page = (await response.json()) as Page<OrderSummary>;
    expect(page.page).toBe(1);
    expect(page.limit).toBe(2);
    expect(page.total).toBe(all.total);
    expect(page.totalPages).toBe(Math.ceil(all.total / 2));
    expect(page.data.length).toBe(Math.min(2, all.total));
    for (const order of page.data) {
      expect(order).toEqual(
        expect.objectContaining({ id: expect.any(String), displayId: expect.any(String), totalAmount: expect.any(Number), itemsCount: expect.any(Number), status: expect.any(String) }),
      );
      expect(order.itemsCount).toBeGreaterThan(0);
      expect(order.totalAmount).toBeGreaterThan(0);
    }
  });

  test('newest orders come first', async ({ customerApi }) => {
    const page = await needOrders(customerApi, 2);
    const ids = page.data.map((o) => Number(o.displayId));
    expect(ids, 'Order numbers should go down the list').toEqual([...ids].sort((a, b) => b - a));
  });

  test('page 2 shares no order with page 1, and a page past the end is empty', async ({ customerApi }) => {
    const all = await needOrders(customerApi, 3);
    const first = await json<Page<OrderSummary>>(customerApi.orders.list({ page: 1, limit: 2 }));
    const second = await json<Page<OrderSummary>>(customerApi.orders.list({ page: 2, limit: 2 }));
    const firstIds = new Set(first.data.map((o) => o.id));
    expect(second.data.some((o) => firstIds.has(o.id)), 'Page 2 repeats an order from page 1').toBe(false);
    const past = await json<Page<OrderSummary>>(customerApi.orders.list({ page: all.totalPages + 5, limit: 50 }));
    expect(past.data).toEqual([]);
  });

  test('"active" and "past" split the orders by status with no overlap', async ({ customerApi }) => {
    const all = await needOrders(customerApi);
    const active = await json<Page<OrderSummary>>(customerApi.orders.list({ page: 1, limit: 50, state: 'active' }));
    const past = await json<Page<OrderSummary>>(customerApi.orders.list({ page: 1, limit: 50, state: 'past' }));
    for (const order of active.data) expect(ACTIVE, `Active list has a "${order.status}" order`).toContain(order.status);
    for (const order of past.data) expect(PAST, `Past list has a "${order.status}" order`).toContain(order.status);
    const activeIds = new Set(active.data.map((o) => o.id));
    expect(past.data.filter((o) => activeIds.has(o.id))).toEqual([]);
    expect(active.total + past.total, 'Active + past should cover every order').toBe(all.total);
  });

  for (const [label, query] of [
    ['an unknown state', { page: 1, limit: 5, state: 'bogus' }],
    ['a limit that is not a number', { page: 1, limit: 'abc' }],
    ['a page that is not a number', { page: 'abc', limit: 5 }],
  ] as const) {
    test(`${label} is refused with 400`, { tag: '@negative' }, async ({ customerApi }) => {
      const response = await customerApi.orders.listRaw(query);
      expect(response.status(), `GET /orders ${JSON.stringify(query)}`).toBe(400);
    });
  }

  for (const [label, query] of [
    ['page 0', { page: 0, limit: 5 }],
    ['a negative page', { page: -1, limit: 5 }],
    ['limit 0', { page: 1, limit: 0 }],
    ['a negative limit', { page: 1, limit: -5 }],
  ] as const) {
    test(`${label} does not crash the server`, { tag: '@negative' }, async ({ customerApi }) => {
      if (query.page < 1 || query.limit < 0) knownBug('orders-pagination-500');
      const response = await customerApi.orders.listRaw(query);
      expect(response.status(), `GET /orders ${JSON.stringify(query)} answered ${response.status()}`).toBeLessThan(500);
    });
  }
});

test.describe('Orders API: order detail', { tag: ['@orders', '@api', '@pricing'] }, () => {
  test('item prices are numbers, like cart prices and the order totals', { tag: '@contract' }, async ({ customerApi }) => {
    knownBug('order-item-price-string');
    const [summary] = (await json<Page<OrderSummary>>(customerApi.orders.list({ page: 1, limit: 1 }))).data;
    test.skip(!summary, 'The test customer has no orders');
    const order = await json<OrderDetail>(customerApi.orders.getById(summary.id));
    expect(typeof order.totalAmount).toBe('number');
    for (const item of order.items) expect(typeof item.price, item.product.name).toBe('number');
  });

  test('the detail matches the list and its amounts add up', async ({ customerApi, storeInfo }) => {
    const page = await needOrders(customerApi);
    for (const summary of page.data.slice(0, 5)) {
      await test.step(`order #${summary.displayId}`, async () => {
        const order = await json<OrderDetail>(customerApi.orders.getById(summary.id));
        expect(order.displayId).toBe(summary.displayId);
        expect(order.totalAmount).toBe(summary.totalAmount);
        expect(order.items.reduce((n, i) => n + i.quantity, 0)).toBe(summary.itemsCount);
        const lines = round2(order.items.reduce((n, i) => n + Number(i.price) * i.quantity, 0));
        expect(sameMoney(order.subTotalAmount, lines), `#${order.displayId}: subtotal ${order.subTotalAmount}, lines ${lines}`).toBe(true);
        expect(sameMoney(order.vatAmount, round2((order.subTotalAmount * storeInfo.taxPercentage) / 100)), `#${order.displayId}: VAT`).toBe(true);
        const total = round2(order.subTotalAmount + order.vatAmount + order.deliveryAmount + order.codFee - (order.discountAmount ?? 0));
        expect(sameMoney(order.totalAmount, total), `#${order.displayId}: total ${order.totalAmount}, parts add up to ${total}`).toBe(true);
      });
    }
  });

  test('an order that does not exist answers 404', { tag: '@negative' }, async ({ customerApi }) => {
    const response = await customerApi.orders.getById(MISSING_ID);
    expect(response.status()).toBe(404);
    expect(await errorMessage(response)).toBe('Order not found');
  });

  test('an order id that is not a UUID answers 404, not a server error', { tag: '@negative' }, async ({ customerApi }) => {
    expect((await customerApi.orders.getById('not-a-uuid')).status()).toBe(404);
    expect((await customerApi.orders.getById("1' OR '1'='1")).status()).toBeLessThan(500);
  });
});

test.describe('Orders API: who may see orders', { tag: ['@orders', '@api', '@security'] }, () => {
  test('a guest cannot list orders or open one', async ({ api, customerApi }) => {
    const page = await needOrders(customerApi);
    expect((await api.orders.list({ page: 1, limit: 5 })).status()).toBe(401);
    expect((await api.orders.getById(page.data[0].id)).status()).toBe(401);
  });

  test('another customer cannot open this customer\'s order', async ({ customerApi, playwright }) => {
    test.skip(!env.customer2, 'Set CUSTOMER2_PHONE and CUSTOMER2_OTP in .env to test access between customers.');
    const page = await needOrders(customerApi);
    const context = await playwright.request.newContext();
    try {
      const { token } = await buildApi(context).users.loginAs(env.customer2!);
      const other = buildApi(context, token);
      expect((await other.orders.getById(page.data[0].id)).status()).toBe(404);
      expect((await other.cart.copyOrder(page.data[0].id)).status()).toBe(404);
      const theirs = await json<Page<OrderSummary>>(other.orders.list({ page: 1, limit: 50 }));
      expect(theirs.data.some((o) => o.id === page.data[0].id)).toBe(false);
    } finally {
      await context.dispose();
    }
  });
});

test.describe('Orders API: reorder', { tag: ['@orders', '@api'] }, () => {
  test.beforeEach(async ({ customerApi }) => {
    await json(customerApi.cart.clear());
  });
  test.afterEach(async ({ customerApi }) => {
    await customerApi.cart.clear();
  });

  test('reordering puts the order\'s in-stock products back in the cart with their quantities', async ({ customerApi }) => {
    const page = await needOrders(customerApi);
    const order = await json<OrderDetail>(customerApi.orders.getById(page.data[0].id));
    const response = await customerApi.cart.copyOrder(order.id);
    expect(response.ok(), await errorMessage(response)).toBe(true);
    const cart = await customerApi.cart.current();
    for (const item of order.items.filter((i) => i.product.inStock !== false)) {
      expect(cart.items.find((c) => c.product.id === item.product.id)?.quantity, `${item.product.name} after reorder`).toBe(item.quantity);
    }
  });

  test('reordering into a cart that already has the product adds to it', async ({ customerApi }) => {
    const page = await needOrders(customerApi);
    const order = await json<OrderDetail>(customerApi.orders.getById(page.data[0].id));
    const item = order.items[0];
    await customerApi.cart.seed([{ productId: item.product.id, quantity: 1 }]);
    await json(customerApi.cart.copyOrder(order.id));
    const cart: Cart = await customerApi.cart.current();
    const quantity = cart.items.find((c) => c.product.id === item.product.id)?.quantity ?? 0;
    expect([item.quantity, item.quantity + 1], `Reorder over an existing line gave ${quantity}`).toContain(quantity);
  });

  test('reordering with removeExisting replaces the cart with the order', async ({ api, customerApi }) => {
    const page = await needOrders(customerApi);
    const order = await json<OrderDetail>(customerApi.orders.getById(page.data[0].id));
    const inOrder = new Set(order.items.map((i) => i.product.id));
    const extra = (await purchasableProducts(api, 20)).find((p) => !inOrder.has(p.id))!;
    await customerApi.cart.seed([{ productId: extra.id, quantity: 1 }]);
    const response = await customerApi.cart.copyOrder(order.id, true);
    expect(response.ok(), await errorMessage(response)).toBe(true);
    const cart: Cart = await customerApi.cart.current();
    expect(cart.items.some((c) => c.product.id === extra.id), 'The earlier cart line was kept').toBe(false);
    for (const item of order.items.filter((i) => i.product.inStock !== false)) {
      expect(cart.items.find((c) => c.product.id === item.product.id)?.quantity, item.product.name).toBe(item.quantity);
    }
  });

  test('reordering an order that does not exist answers 404 and leaves the cart alone', { tag: '@negative' }, async ({ customerApi }) => {
    const response = await customerApi.cart.copyOrder(MISSING_ID);
    expect(response.status()).toBe(404);
    expect(await errorMessage(response)).toBe('Order not found');
    expect((await customerApi.cart.current()).items).toEqual([]);
  });

  test('reordering without an order id is refused with 400', { tag: '@negative' }, async ({ customerApi }) => {
    const response = await customerApi.cart.raw('POST', '/copy-order', {});
    expect(response.status()).toBe(400);
    expect(await errorMessage(response)).toContain('orderId should not be empty');
  });
});
