/**
 * Buying a basket as the signed-in customer.
 *
 * Baskets with `showAddAll` get a "Buy" button on /baskets. One tap sends POST /cart/add/bulk with every
 * in-stock product of the basket (quantity 1 each) and opens the "N items added to your cart" dialog.
 * "Customize" opens the basket page, where products are added one by one.
 *
 * Customer project: these tests change the cart, which is emptied before and after each one.
 * The guest side (Buy fills a guest's own cart, the pages themselves) is in deals-baskets.spec.ts.
 */
import type { Locator, Page } from '@playwright/test';
import { json, type Api, type Basket, type Product } from '../../api';
import { env } from '../../config/env';
import { expect, test } from '../../fixtures/test';
import { Header } from '../../pages/Header';
import { waitForApi } from '../../utils/network';

test.use({ storageState: env.storageState.customer });
test.describe.configure({ mode: 'default' });

test.beforeEach(async ({ customerApi }) => {
  await json(customerApi.cart.clear());
});
test.afterEach(async ({ customerApi }) => {
  await customerApi.cart.clear();
});

/** Opens /baskets and waits until the page knows the customer is signed in; an earlier Buy asks to sign in. */
async function openBaskets(page: Page): Promise<void> {
  await page.goto('/baskets');
  await expect(new Header(page).accountButton, 'The saved customer session was not picked up').toBeAttached();
}

const shownBaskets = async (api: Api): Promise<Basket[]> =>
  (await json<Basket[]>(api.baskets.list())).filter((b) => b.isActive && !b.isPrivate);

/** The basket's fixed products as the API has them now; deleted ones are left out. */
async function basketProducts(
  api: Api,
  basket: Basket,
): Promise<{ inStock: Product[]; notBuyable: string[] }> {
  const inStock: Product[] = [];
  const notBuyable: string[] = [];
  for (const id of basket.filters?.productIds ?? []) {
    const response = await api.products.getById(id);
    const product = response.ok() ? ((await response.json()) as Product) : null;
    if (product?.inStock) inStock.push(product);
    else notBuyable.push(product ? `${product.name} (out of stock)` : `${id} (HTTP ${response.status()})`);
  }
  return { inStock, notBuyable };
}

/** A Buy basket with a fixed product list, preferring one with (or without) products that cannot be bought. */
async function buyableBasket(api: Api, withUnbuyable?: boolean) {
  for (const basket of (await shownBaskets(api)).filter(
    (b) => b.showAddAll && b.filters?.productIds?.length,
  )) {
    const products = await basketProducts(api, basket);
    if (!products.inStock.length) continue;
    if (withUnbuyable === undefined || withUnbuyable === products.notBuyable.length > 0)
      return { basket, ...products };
  }
  test.skip(
    true,
    `No "Buy" basket with a fixed product list${withUnbuyable ? ' that holds an out-of-stock or deleted product' : ''}`,
  );
  throw new Error('unreachable');
}

/** The "Buy" button on this basket's card on /baskets. */
function buyButton(page: Page, basket: Basket): Locator {
  // The card is the innermost block that holds both the basket's link and a Buy button.
  return page
    .getByRole('main')
    .locator('div, li, article')
    .filter({ has: page.locator(`a[href="/baskets/${basket.slug}"]`) })
    .filter({ has: page.getByRole('button', { name: 'Buy', exact: true }) })
    .last()
    .getByRole('button', { name: 'Buy', exact: true });
}

const addedDialog = (page: Page) => page.getByRole('dialog', { name: /^\d+ items? added to your cart$/ });

/** Taps Buy and returns the product ids sent to /cart/add/bulk. */
async function buy(page: Page, basket: Basket): Promise<{ productId: string; quantity: number }[]> {
  const sent = waitForApi(page, 'POST', '/cart/add/bulk');
  await buyButton(page, basket).click();
  const request = (await sent).request();
  return (request.postDataJSON() as { items: { productId: string; quantity: number }[] }).items;
}

test.describe('Buying a basket', { tag: ['@content', '@cart', '@baskets'] }, () => {
  test('"Buy" is offered on exactly the baskets set up for it', async ({ api, page }) => {
    const baskets = await shownBaskets(api);
    await openBaskets(page);
    await expect(page.getByRole('main').getByRole('button', { name: 'Buy', exact: true })).toHaveCount(
      baskets.filter((b) => b.showAddAll).length,
    );
  });

  test(
    '"Buy" adds every product of the basket once and says how many',
    { tag: '@smoke' },
    async ({ api, customerApi, page }) => {
      const { basket, inStock } = await buyableBasket(api, false);
      await openBaskets(page);
      const sent = await buy(page, basket);

      expect(sent.map((i) => i.productId).sort(), 'Products sent to the cart').toEqual(
        inStock.map((p) => p.id).sort(),
      );
      expect(
        sent.every((i) => i.quantity === 1),
        'One of each',
      ).toBe(true);
      await expect(addedDialog(page)).toHaveAccessibleName(`${inStock.length} items added to your cart`);

      const cart = await customerApi.cart.current();
      expect(cart.items.map((i) => i.product.id).sort(), 'The cart holds the basket').toEqual(
        inStock.map((p) => p.id).sort(),
      );
      expect(cart.items.every((i) => i.quantity === 1)).toBe(true);
    },
  );

  test('"Go to cart" in the dialog opens the cart with the basket in it', async ({ api, page, cartPage }) => {
    const { basket, inStock } = await buyableBasket(api);
    await openBaskets(page);
    await buy(page, basket);
    await addedDialog(page).getByRole('link', { name: 'Go to cart' }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(cartPage.lines.heading).toHaveText(new RegExp(`· ${inStock.length} items?$`));
    expect((await cartPage.lines.names()).sort()).toEqual(inStock.map((p) => p.name).sort());
  });

  test('products that are out of stock or deleted are left out', async ({ api, customerApi, page }) => {
    const { basket, inStock, notBuyable } = await buyableBasket(api, true);
    await openBaskets(page);
    const sent = await buy(page, basket);
    expect(sent.map((i) => i.productId).sort(), `Left out: ${notBuyable.join(', ')}`).toEqual(
      inStock.map((p) => p.id).sort(),
    );
    await expect(addedDialog(page)).toHaveAccessibleName(`${inStock.length} items added to your cart`);
    expect((await customerApi.cart.current()).items).toHaveLength(inStock.length);
  });

  test('buying the same basket twice doubles the quantities instead of repeating the lines', async ({
    api,
    customerApi,
    page,
  }) => {
    const { basket, inStock } = await buyableBasket(api);
    await openBaskets(page);
    await buy(page, basket);
    await expect(addedDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(addedDialog(page)).toBeHidden();
    await buy(page, basket);
    await expect(addedDialog(page)).toBeVisible();

    const cart = await customerApi.cart.current();
    expect(cart.items).toHaveLength(inStock.length);
    expect(
      cart.items.map((i) => i.quantity),
      'Every line at quantity 2',
    ).toEqual(inStock.map(() => 2));
  });

  test('"Buy" keeps what was already in the cart', async ({ api, customerApi, page }) => {
    const { basket, inStock } = await buyableBasket(api);
    const ids = new Set(inStock.map((p) => p.id));
    const extra = (await json<{ data: Product[] }>(api.products.list({ limit: 50 }))).data.find(
      (p) => p.inStock && !ids.has(p.id),
    );
    test.skip(!extra, 'No in-stock product outside the basket');
    await customerApi.cart.seed([{ productId: extra!.id, quantity: 2 }]);

    await openBaskets(page);
    await buy(page, basket);
    await expect(addedDialog(page)).toBeVisible();
    const cart = await customerApi.cart.current();
    expect(
      cart.items.find((i) => i.product.id === extra!.id)?.quantity,
      'The earlier line is untouched',
    ).toBe(2);
    expect(cart.items).toHaveLength(inStock.length + 1);
  });

  test('"Customize" opens the basket page, where a single product can be added', async ({
    api,
    customerApi,
    page,
  }) => {
    const { basket, inStock } = await buyableBasket(api);
    await openBaskets(page);
    await page
      .getByRole('main')
      .locator(`a[href="/baskets/${basket.slug}"]`)
      .filter({ hasText: /^Customize$/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`/baskets/${basket.slug}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(basket.name);

    const product = inStock.find((p) => !p.promotion) ?? inStock[0];
    const added = waitForApi(page, 'POST', '/cart/add');
    await page
      .getByRole('main')
      .getByRole('button', { name: `Add ${product.name} to cart`, exact: true })
      .first()
      .click();
    await added;
    const cart = await customerApi.cart.current();
    expect(
      cart.items.map((i) => i.product.id),
      'Only the chosen product is in the cart',
    ).toEqual([product.id]);
  });
});
