/**
 * Your orders and order detail pages, as the signed-in customer.
 *
 * Uses the orders already on the account (the checkout tests add to them). "Order again" changes the
 * cart, so this runs in the `customer` project.
 */
import { json, type OrderDetail, type OrderSummary, type Page as ApiPage } from '../../api';
import { env } from '../../config/env';
import { expect, test } from '../../fixtures/test';
import { OrderDetailPage, OrdersPage } from '../../pages/account/AccountPages';
import { sameMoney } from '../../utils/dom';
import { waitForApi } from '../../utils/network';
import { MISSING_ID, purchasableProducts } from '../../utils/shop';

test.use({ storageState: env.storageState.customer });
test.describe.configure({ mode: 'default' });

async function latestOrder(customerApi: import('../../api').Api): Promise<OrderDetail> {
  const order = await customerApi.orders.latest();
  test.skip(!order, 'The test customer has no orders; run the checkout tests first');
  return order as OrderDetail;
}

test.describe('Your orders', { tag: ['@orders'] }, () => {
  test('lists the pending orders first, each with its number, item count and total', async ({ customerApi, page }) => {
    const active = await json<ApiPage<OrderSummary>>(customerApi.orders.list({ page: 1, limit: 50, state: 'active' }));
    const ordersPage = new OrdersPage(page);
    await ordersPage.open();
    await expect(ordersPage.pendingTab).toHaveAttribute('aria-selected', 'true');
    for (const order of active.data.slice(0, 5)) {
      const link = ordersPage.orderLink(order.displayId);
      await expect(link, `Pending order #${order.displayId} is not listed`).toBeVisible();
      await expect(link).toContainText(`${order.itemsCount} item`);
      await expect(link).toContainText(order.totalAmount.toFixed(2));
      await expect(link).toHaveAttribute('href', `/account/orders/${order.id}`);
    }
  });

  test('"Past orders" shows only finished orders', async ({ customerApi, page }) => {
    const past = await json<ApiPage<OrderSummary>>(customerApi.orders.list({ page: 1, limit: 50, state: 'past' }));
    const active = await json<ApiPage<OrderSummary>>(customerApi.orders.list({ page: 1, limit: 50, state: 'active' }));
    test.skip(!past.total, 'The test customer has no finished orders');
    const ordersPage = new OrdersPage(page);
    await ordersPage.open();
    await ordersPage.pastTab.click();
    await expect(ordersPage.pastTab).toHaveAttribute('aria-selected', 'true');
    await expect(ordersPage.orderLink(past.data[0].displayId)).toBeVisible();
    if (active.data[0]) await expect(ordersPage.pendingPanel.getByRole('link', { name: `View order #${active.data[0].displayId}` })).toBeHidden();
  });

  test('the pending list shows every pending order and then says it has reached the end', async ({ customerApi, page }) => {
    const active = await json<ApiPage<OrderSummary>>(customerApi.orders.list({ page: 1, limit: 1, state: 'active' }));
    test.skip(!active.total, 'The test customer has no pending orders');
    const ordersPage = new OrdersPage(page);
    await ordersPage.open();
    const links = ordersPage.pendingPanel.getByRole('link', { name: /^View order #\d+$/ });
    // More orders load as the visitor scrolls; keep scrolling until the end message shows.
    await expect(async () => {
      await page.mouse.wheel(0, 10_000);
      await expect(ordersPage.endOfList).toBeVisible({ timeout: 2_000 });
    }, 'The list never said it had reached the end').toPass({ timeout: 30_000 });
    await expect(links).toHaveCount(active.total);
    await expect(ordersPage.main.getByRole('button', { name: 'Back to top' })).toBeVisible();
  });

  test('the account summary counts every order', async ({ customerApi, page }) => {
    const all = await json<ApiPage<OrderSummary>>(customerApi.orders.list({ page: 1, limit: 1 }));
    const ordersPage = new OrdersPage(page);
    await ordersPage.open();
    await ordersPage.sidebar.expectCount('Orders', all.total);
  });

  test('clicking an order opens its detail', async ({ customerApi, page }) => {
    const order = await latestOrder(customerApi);
    const ordersPage = new OrdersPage(page);
    await ordersPage.open();
    await ordersPage.orderLink(order.displayId).click();
    await expect(page).toHaveURL(new RegExp(`/account/orders/${order.id}$`));
    await expect(new OrderDetailPage(page).heading).toHaveText(`Order #${order.displayId}`);
  });
});

test.describe('Order detail', { tag: ['@orders'] }, () => {
  test('lines, quantities and totals match the order the API holds', { tag: ['@smoke', '@pricing'] }, async ({ customerApi, page }) => {
    const order = await latestOrder(customerApi);
    const detail = new OrderDetailPage(page);
    await detail.openOrder(order.id);
    await expect(detail.heading).toHaveText(`Order #${order.displayId}`);
    const units = order.items.reduce((n, i) => n + i.quantity, 0);
    await expect(detail.itemsHeading).toHaveText(`${units} ${units === 1 ? 'item' : 'items'}`);
    for (const item of order.items) {
      const price = Number(item.price);
      const row = detail.item(item.product.name);
      await expect(row, `${item.product.name} is missing`).toBeVisible();
      await expect(row).toContainText(`${item.quantity} ×`);
      await expect(row).toContainText(price.toFixed(2));
      await expect(row).toContainText((price * item.quantity).toFixed(2));
    }
    expect(sameMoney(await detail.amount('Subtotal'), order.subTotalAmount)).toBe(true);
    expect(sameMoney(await detail.amount('VAT'), order.vatAmount)).toBe(true);
    expect(sameMoney(await detail.amount('Delivery fee'), order.deliveryAmount)).toBe(true);
    expect(sameMoney(await detail.amount('Total'), order.totalAmount)).toBe(true);
  });

  test('the WhatsApp link opens a chat that already names the order', async ({ customerApi, page }) => {
    const order = await latestOrder(customerApi);
    const detail = new OrderDetailPage(page);
    await detail.openOrder(order.id);
    const href = (await detail.whatsApp.getAttribute('href')) ?? '';
    expect(href).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(decodeURIComponent(href.replace(/\+/g, ' '))).toContain(`#${order.displayId}`);
  });

  test('the timeline lists at least the first status, with a time', async ({ customerApi, page }) => {
    const order = await latestOrder(customerApi);
    const detail = new OrderDetailPage(page);
    await detail.openOrder(order.id);
    const timeline = page.getByRole('main').getByRole('heading', { name: 'Order timeline' });
    await expect(timeline).toBeVisible();
    await expect(page.getByRole('main').locator('time').first()).toBeVisible();
  });

  test('"All orders" goes back to the list', async ({ customerApi, page }) => {
    const order = await latestOrder(customerApi);
    const detail = new OrderDetailPage(page);
    await detail.openOrder(order.id);
    await detail.allOrders.click();
    await expect(page).toHaveURL(/\/account\/orders$/);
  });

  for (const choice of ['replace', 'add'] as const) {
    test(`"Order again", then "${choice === 'replace' ? 'Replace current cart' : 'Add to current cart'}", ${choice === 'replace' ? 'swaps the cart for the order' : 'adds the order to the cart'}`, async ({ api, customerApi, page }) => {
      const order = await latestOrder(customerApi);
      const inStock = order.items.filter((i) => i.product.inStock !== false);
      // Something already in the cart that is not in the order, to see what each choice does with it.
      const inOrder = new Set(order.items.map((i) => i.product.id));
      const extra = (await purchasableProducts(api, 20)).find((p) => !inOrder.has(p.id))!;
      await json(customerApi.cart.clear());
      await json(customerApi.cart.add(extra.id, 1));
      try {
        const detail = new OrderDetailPage(page);
        await detail.openOrder(order.id);
        await detail.orderAgain.click();
        await expect(detail.orderAgainDialog).toBeVisible();
        const copied = waitForApi(page, 'POST', '/cart/copy-order');
        await (choice === 'replace' ? detail.replaceCart : detail.addToCart).click();
        const response = await copied;
        expect(response.ok()).toBe(true);
        expect(response.request().postDataJSON()).toMatchObject({ orderId: order.id, removeExisting: choice === 'replace' });
        await expect(page).toHaveURL(/\/cart$/);
        const cart = await customerApi.cart.current();
        for (const item of inStock) {
          expect(cart.items.find((c) => c.product.id === item.product.id)?.quantity, item.product.name).toBe(item.quantity);
        }
        const kept = cart.items.some((c) => c.product.id === extra.id);
        expect(kept, choice === 'replace' ? 'Replace kept the earlier cart line' : 'Add dropped the earlier cart line').toBe(choice === 'add');
      } finally {
        await customerApi.cart.clear();
      }
    });
  }

  test('an order that does not exist shows an error, not a broken page', { tag: '@negative' }, async ({ page }) => {
    const response = await page.goto(`/account/orders/${MISSING_ID}`);
    const main = page.getByRole('main');
    // The page shows its general "couldn't load" alert. A "this order does not exist" message would be clearer
    // than "Please try again" (noted in the report), but either is an error and not a broken page.
    await expect(main.getByRole('alert').or(main.getByText(/not found|doesn.t exist|couldn.t (find|load)|no longer/i)).first(), 'No error for a missing order').toBeVisible();
    await expect(main.getByRole('link', { name: 'All orders' })).toBeVisible();
    await expect(main.getByRole('heading', { name: /^Order #\d+$/ })).toHaveCount(0);
    expect(response?.status() ?? 0).toBeLessThan(500);
  });

  test('a guest who opens an order link is asked to sign in and sees nothing of the order', { tag: '@security' }, async ({ customerApi, browser }) => {
    const order = await latestOrder(customerApi);
    const context = await browser.newContext({ storageState: env.storageState.guest });
    const page = await context.newPage();
    try {
      await page.goto(`/account/orders/${order.id}`);
      await expect(page.getByRole('dialog', { name: 'Sign in or create an account' })).toBeVisible();
      await expect(page.getByText(`#${order.displayId}`)).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
