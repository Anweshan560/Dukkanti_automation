/**
 * Cart page and cart drawer, as the signed-in customer.
 *
 * Runs in the `customer` project (one test at a time): the cart is seeded through the API, checked in
 * the UI, and emptied again afterwards.
 */
import { json, type Cart } from '../../api';
import { env } from '../../config/env';
import { expect, test } from '../../fixtures/test';
import { CartPage } from '../../pages/cart/CartPage';
import { CartDrawer } from '../../pages/home/components/Cart';
import { knownBug } from '../../utils/knownBug';
import { waitForApi } from '../../utils/network';
import { dealWithProducts, expectedTotals, HOSTILE_STRINGS, purchasableProducts, quantityForExactly, round2 } from '../../utils/shop';
import { qaName } from '../../utils/testData';

test.use({ storageState: env.storageState.customer });
test.describe.configure({ mode: 'default' });

test.beforeEach(async ({ customerApi }) => {
  await json(customerApi.cart.clear());
});
test.afterEach(async ({ customerApi }) => {
  await customerApi.cart.clear();
});

test.describe('Cart page', { tag: ['@cart'] }, () => {
  test('an empty cart says so and offers a way back to the shop', { tag: '@states' }, async ({ cartPage, page }) => {
    await cartPage.open();
    await expect(cartPage.emptyMessage).toBeVisible();
    await expect(cartPage.continueShopping).toHaveAttribute('href', '/products');
    await expect(cartPage.goToCheckout).toHaveCount(0);
    await cartPage.continueShopping.click();
    await expect(page).toHaveURL(/\/products$/);
  });

  test('lines, quantities and amounts match the cart the API holds', { tag: '@smoke' }, async ({ api, customerApi, cartPage, storeInfo }) => {
    const products = await purchasableProducts(api, 2);
    const cart = await customerApi.cart.seed([
      { productId: products[0].id, quantity: 3 },
      { productId: products[1].id, quantity: 1 },
    ]);
    await cartPage.open();
    await expect(cartPage.lines.heading).toHaveText(/· 2 items$/);
    expect(await cartPage.lines.names()).toEqual(expect.arrayContaining(products.map((p) => p.name)));
    for (const item of cart.items) {
      await cartPage.lines.expectQuantity(item.product.name, item.quantity);
      await cartPage.lines.expectAmount(item.product.name, round2(item.lineTotal));
    }
    if (cart.subTotal >= storeInfo.minOrderAmount) {
      await cartPage.summary.expectAmounts(expectedTotals(cart.subTotal, storeInfo));
    }
  });

  test('the order summary shows subtotal, VAT, delivery and total by the store rules', { tag: '@pricing' }, async ({ api, customerApi, cartPage, storeInfo }) => {
    const { product, quantity } = await quantityForExactly(api, storeInfo.minOrderAmount);
    const cart = await customerApi.cart.seed([{ productId: product.id, quantity: quantity + 1 }]);
    await cartPage.open();
    const want = expectedTotals(cart.subTotal, storeInfo);
    await cartPage.summary.expectAmounts({ subTotal: want.subTotal, vat: want.vat, deliveryFee: want.deliveryFee, total: want.total });
    await expect(cartPage.summary.vatLabel()).toHaveText(`VAT (${storeInfo.taxPercentage}%)`);
    await expect(cartPage.goToCheckout).toContainText(want.total.toFixed(2));
  });

  test('"+" raises the quantity, and the line and summary follow', async ({ api, customerApi, cartPage, page }) => {
    const [product] = await purchasableProducts(api, 1, 5);
    await customerApi.cart.seed([{ productId: product.id, quantity: 1 }]);
    await cartPage.open();
    const saved = waitForApi(page, 'PATCH', '/cart/update');
    await cartPage.lines.increase(product.name).click();
    expect((await saved).status()).toBe(200);
    await cartPage.lines.expectQuantity(product.name, 2);
    await cartPage.lines.expectAmount(product.name, round2(product.price * 2));
    await expect.poll(() => cartPage.summary.amount('Subtotal')).toBe(round2(product.price * 2));
    expect((await customerApi.cart.current()).items[0].quantity).toBe(2);
  });

  test('"-" lowers the quantity, and at 1 the button becomes Remove and removes the line', async ({ api, customerApi, cartPage }) => {
    const [product] = await purchasableProducts(api, 1);
    await customerApi.cart.seed([{ productId: product.id, quantity: 2 }]);
    await cartPage.open();
    await expect(cartPage.lines.decrease(product.name)).toHaveAccessibleName('Decrease quantity');
    await cartPage.lines.decrease(product.name).click();
    await cartPage.lines.expectQuantity(product.name, 1);
    await expect(cartPage.lines.decrease(product.name)).toHaveAccessibleName('Remove');
    await cartPage.lines.decrease(product.name).click();
    await expect(cartPage.emptyMessage).toBeVisible();
    await expect.poll(async () => (await customerApi.cart.current()).items.length).toBe(0);
  });

  test('below the minimum order there is no way to check out, and the bar says how much is missing', { tag: ['@states', '@negative'] }, async ({ api, customerApi, cartPage, storeInfo }) => {
    const [product] = await purchasableProducts(api, 1);
    const cart = await customerApi.cart.seed([{ productId: product.id, quantity: 1 }]);
    test.skip(cart.subTotal >= storeInfo.minOrderAmount, 'The cheapest product is already above the minimum order');
    await cartPage.open();
    const missing = round2(storeInfo.minOrderAmount - cart.subTotal);
    await expect(cartPage.delivery.progressbar).toHaveAccessibleName(`${missing.toFixed(2)} to go`);
    expect(await cartPage.delivery.percent()).toBe(Math.round((cart.subTotal / storeInfo.minOrderAmount) * 100));
    await expect(cartPage.goToCheckout).toHaveCount(0);
  });

  test('between the minimum and free delivery the bar counts down to free delivery', { tag: '@states' }, async ({ api, customerApi, cartPage, storeInfo }) => {
    const { product, quantity } = await quantityForExactly(api, storeInfo.minOrderAmount);
    const cart = await customerApi.cart.seed([{ productId: product.id, quantity }]);
    await cartPage.open();
    const toFree = round2(storeInfo.deliveryCutOff - cart.subTotal);
    await expect(cartPage.delivery.progressbar).toHaveAccessibleName(`${toFree.toFixed(2)} to free delivery`);
    await expect(cartPage.goToCheckout).toBeVisible();
  });

  test('at the free-delivery amount the delivery costs nothing', { tag: ['@states', '@pricing'] }, async ({ api, customerApi, cartPage, storeInfo }) => {
    const { product, quantity } = await quantityForExactly(api, storeInfo.deliveryCutOff);
    await customerApi.cart.seed([{ productId: product.id, quantity }]);
    await cartPage.open();
    await expect.poll(() => cartPage.summary.amount('Delivery')).toBe(0);
    await expect(cartPage.delivery.root).not.toContainText('to free delivery');
  });

  test('the badge on "items in this delivery" counts every item', async ({ api, customerApi, cartPage }) => {
    knownBug('delivery-badge-wrong-count');
    const [first, second] = await purchasableProducts(api, 2);
    await customerApi.cart.seed([
      { productId: first.id, quantity: 1 },
      { productId: second.id, quantity: 5 },
    ]);
    await cartPage.open();
    await expect.poll(() => cartPage.delivery.badgeCount(), { message: 'Badge on "See the items in this delivery"' }).toBe(6);
  });

  test('a deal line offers the missing items, and adding them applies the deal', { tag: '@pricing' }, async ({ api, customerApi, cartPage }) => {
    const { promotion, products } = await dealWithProducts(api, 'buy_x_get_y');
    const product = products[0];
    await customerApi.cart.seed([{ productId: product.id, quantity: 1 }]);
    await cartPage.open();
    const buy = promotion.buyQuantity ?? 0;
    const get = promotion.getQuantity ?? 0;
    // "Add 2 more, get 1 free": the items still missing for the deal to apply once.
    const nudge = cartPage.lines.root.getByRole('button', { name: new RegExp(`^Add ${buy + get - 1} more.*get ${get} free$`) });
    await expect(nudge).toBeVisible();
    await expect(cartPage.lines.root.getByRole('link', { name: 'See items in this deal' })).toHaveAttribute('href', `/deals/${promotion.slugEn}`);
    await nudge.click();
    await expect.poll(async () => (await customerApi.cart.current()).items[0]?.quantity).toBe(buy + get);
    const cart = await customerApi.cart.current();
    expect(cart.promotionDiscount, 'The deal was not applied after adding the offered items').toBeGreaterThan(0);
    await cartPage.lines.expectQuantity(product.name, buy + get);
  });

  test('a product link on a line opens that product', async ({ api, customerApi, cartPage, page }) => {
    const [product] = await purchasableProducts(api, 1);
    await customerApi.cart.seed([{ productId: product.id, quantity: 1 }]);
    await cartPage.open();
    await cartPage.lines.link(product.name).click();
    await expect(page).toHaveURL(new RegExp(`/products/${product.slugEn}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(product.name);
  });

  test('a quick add puts a suggested product in the cart', async ({ api, customerApi, cartPage, page }) => {
    const [product] = await purchasableProducts(api, 1);
    await customerApi.cart.seed([{ productId: product.id, quantity: 1 }]);
    await cartPage.open();
    const addButton = cartPage.quickAdds.getByRole('button', { name: /^Add .+ to cart$/ }).first();
    await expect(addButton).toBeVisible();
    const added = waitForApi(page, 'POST', '/cart/add');
    await addButton.click();
    expect((await added).ok()).toBe(true);
    await expect.poll(async () => (await customerApi.cart.current()).items.length).toBe(2);
    await expect(cartPage.lines.steppers).toHaveCount(2);
  });

  test('the cart survives a reload and is the same in a second tab', async ({ api, customerApi, cartPage, context }) => {
    const [product] = await purchasableProducts(api, 1);
    await customerApi.cart.seed([{ productId: product.id, quantity: 2 }]);
    await cartPage.open();
    await cartPage.lines.expectQuantity(product.name, 2);
    await cartPage.lines.increase(product.name).click();
    await cartPage.lines.expectQuantity(product.name, 3);
    await expect.poll(async () => (await customerApi.cart.current()).items[0].quantity).toBe(3);
    await cartPage.open();
    await cartPage.lines.expectQuantity(product.name, 3);
    const second = await context.newPage();
    const secondCart = new CartPage(second);
    await secondCart.open();
    await secondCart.lines.expectQuantity(product.name, 3);
    await second.close();
  });

  test('a requested item with a name that looks like code is shown as plain text', { tag: '@security' }, async ({ customerApi, cartPage, page }) => {
    const name = `${HOSTILE_STRINGS.xss} ${qaName('cheese')}`;
    await json(customerApi.cart.addSpecial({ name, description: HOSTILE_STRINGS.script, quantity: 1, minPrice: 10, maxPrice: 49 }));
    await cartPage.open();
    await expect(cartPage.main.getByText(name, { exact: false }).first()).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss), 'Injected script ran').toBeUndefined();
  });

  test('when saving a quantity fails, the page shows the quantity the server really has', { tag: ['@negative', '@resilience'] }, async ({ api, customerApi, cartPage, page }) => {
    const [product] = await purchasableProducts(api, 1);
    await customerApi.cart.seed([{ productId: product.id, quantity: 2 }]);
    await cartPage.open();
    await page.route(`${env.apiUrl}/cart/update`, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"statusCode":500,"message":"Internal server error"}' }),
    );
    await cartPage.lines.increase(product.name).click();
    // After the failure settles, the screen must not claim a quantity the server never saved.
    await expect.poll(() => cartPage.lines.quantity(product.name), { timeout: 10_000 }).toBe(2);
    await page.unroute(`${env.apiUrl}/cart/update`);
    expect((await customerApi.cart.current()).items[0].quantity).toBe(2);
  });
});

test.describe('Cart drawer', { tag: ['@cart'] }, () => {
  test('opens from the header with the lines, the count and a checkout link above the minimum', { tag: '@smoke' }, async ({ api, customerApi, homePage, page, storeInfo }) => {
    const { product, quantity } = await quantityForExactly(api, storeInfo.minOrderAmount);
    const cart: Cart = await customerApi.cart.seed([{ productId: product.id, quantity }]);
    await homePage.openForCustomer();
    const drawer = new CartDrawer(page);
    await homePage.header.clickUntil(homePage.header.cartButton, drawer.root, 'The cart drawer');
    await expect(drawer.countLabel).toHaveText('1 item');
    await drawer.lines.expectQuantity(product.name, quantity);
    await expect(drawer.goToCheckout).toBeVisible();
    expect(await drawer.checkoutAmount()).toBe(expectedTotals(cart.subTotal, storeInfo).total);
    await drawer.goToCheckout.click();
    await expect(page).toHaveURL(/\/checkout$/);
  });

  test('an empty cart drawer says so', { tag: '@states' }, async ({ homePage, page }) => {
    await homePage.openForCustomer();
    const drawer = new CartDrawer(page);
    await homePage.header.clickUntil(homePage.header.cartButton, drawer.root, 'The cart drawer');
    await expect(drawer.emptyMessage).toBeVisible();
    await expect(drawer.startShopping).toHaveAttribute('href', '/products');
    await expect(drawer.goToCheckout).toHaveCount(0);
    await drawer.closeButton.click();
    await expect(drawer.root).toBeHidden();
  });

  test('"Clear all" empties the cart', async ({ api, customerApi, homePage, page }) => {
    const products = await purchasableProducts(api, 2);
    await customerApi.cart.seed(products.map((p) => ({ productId: p.id, quantity: 1 })));
    await homePage.openForCustomer();
    const drawer = new CartDrawer(page);
    await homePage.header.clickUntil(homePage.header.cartButton, drawer.root, 'The cart drawer');
    await drawer.clearAllButton.click();
    // A confirmation may follow; accept it when it does.
    const confirm = page.getByRole('alertdialog').getByRole('button', { name: /Clear|Yes|Remove/ });
    if (await confirm.isVisible({ timeout: 2_000 }).catch(() => false)) await confirm.click();
    await expect(drawer.emptyMessage).toBeVisible();
    await expect.poll(async () => (await customerApi.cart.current()).items.length).toBe(0);
    await drawer.closeButton.click();
    await homePage.header.expectCart(0, 0);
  });

  test('Escape closes the drawer', { tag: '@a11y' }, async ({ homePage, page }) => {
    await homePage.openForCustomer();
    const drawer = new CartDrawer(page);
    await homePage.header.clickUntil(homePage.header.cartButton, drawer.root, 'The cart drawer');
    await page.keyboard.press('Escape');
    await expect(drawer.root).toBeHidden();
  });
});
