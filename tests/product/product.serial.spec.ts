/**
 * Product page as the signed-in customer: adding to the cart with a quantity, the deal pack, the in-cart
 * stepper and the wishlist heart. Changes the shared cart and wishlist, so it runs in `customer`.
 */
import { json } from '../../api';
import { env } from '../../config/env';
import { expect, test } from '../../fixtures/test';
import { ProductPage } from '../../pages/product/ProductPage';
import { waitForApi } from '../../utils/network';
import { dealWithProducts, purchasableProducts, round2 } from '../../utils/shop';

test.use({ storageState: env.storageState.customer });
test.describe.configure({ mode: 'default' });

test.beforeEach(async ({ customerApi }) => {
  await json(customerApi.cart.clear());
});
test.afterEach(async ({ customerApi }) => {
  await customerApi.cart.clear();
});

test.describe('Product page: buying', { tag: ['@product', '@cart'] }, () => {
  test(
    'choosing 3 and Add to cart puts 3 in the cart, then the button turns into "View cart"',
    { tag: '@smoke' },
    async ({ api, customerApi, page }) => {
      const [product] = await purchasableProducts(api, 1);
      const productPage = new ProductPage(page);
      await productPage.openSlug(product.slugEn);
      await productPage.clickUntil(productPage.increase, () =>
        expect(productPage.quantity).toHaveText('2', { timeout: 2_000 }),
      );
      await productPage.increase.click();
      await expect(productPage.quantity).toHaveText('3');
      const added = waitForApi(page, 'POST', '/cart/add');
      await productPage.addToCart.click();
      const request = (await added).request().postDataJSON() as { quantity: number };
      expect(request.quantity).toBe(3);
      await expect(productPage.viewCart).toBeVisible();
      await expect(productPage.viewCart).toContainText(round2(product.price * 3).toFixed(2));
      const cart = await customerApi.cart.current();
      expect(cart.items.map((i) => [i.product.id, i.quantity])).toEqual([[product.id, 3]]);
    },
  );

  test('once in the cart, + and - on the product page change the cart', async ({
    api,
    customerApi,
    page,
  }) => {
    const [product] = await purchasableProducts(api, 1);
    await customerApi.cart.seed([{ productId: product.id, quantity: 2 }]);
    const productPage = new ProductPage(page);
    await productPage.openSlug(product.slugEn);
    await expect(productPage.viewCart).toBeVisible();
    await expect(productPage.quantity).toHaveText('2');
    await productPage.increase.click();
    await expect.poll(async () => (await customerApi.cart.current()).items[0]?.quantity).toBe(3);
    await productPage.decrease.click();
    await expect.poll(async () => (await customerApi.cart.current()).items[0]?.quantity).toBe(2);
  });

  test(
    'the deal pack adds the whole pack and the deal discount is applied',
    { tag: '@pricing' },
    async ({ api, customerApi, page }) => {
      const { promotion, products } = await dealWithProducts(api, 'buy_x_get_y');
      const product = products[0];
      const productPage = new ProductPage(page);
      await productPage.openSlug(product.slugEn);
      const pack = (promotion.buyQuantity ?? 0) + (promotion.getQuantity ?? 0);
      await productPage.clickUntil(productPage.addPack, async () => {
        expect((await customerApi.cart.current()).items[0]?.quantity).toBe(pack);
      });
      const cart = await customerApi.cart.current();
      expect(cart.promotionDiscount).toBeCloseTo(round2((promotion.getQuantity ?? 0) * product.price), 2);
    },
  );

  test('the "View cart" button opens the cart', async ({ api, customerApi, page }) => {
    const [product] = await purchasableProducts(api, 1);
    await customerApi.cart.seed([{ productId: product.id, quantity: 1 }]);
    const productPage = new ProductPage(page);
    await productPage.openSlug(product.slugEn);
    await productPage.viewCart.click();
    await expect(
      page
        .getByRole('dialog', { name: 'Your cart' })
        .or(page.getByRole('region', { name: 'Your cart' }))
        .first(),
    ).toBeVisible();
  });
});

test.describe('Product page: wishlist heart', { tag: ['@product', '@wishlist'] }, () => {
  test.beforeEach(async ({ customerApi }) => {
    await json(customerApi.wishlist.clear());
  });
  test.afterEach(async ({ customerApi }) => {
    await customerApi.wishlist.clear();
  });

  test('the heart saves the product, shows it is saved, and a second tap unsaves it', async ({
    api,
    customerApi,
    page,
  }) => {
    const [product] = await purchasableProducts(api, 1);
    const productPage = new ProductPage(page);
    await productPage.openSlug(product.slugEn);
    await expect(productPage.heart).toHaveAttribute('aria-pressed', 'false');
    await productPage.clickUntil(productPage.heart, () =>
      expect(productPage.heart).toHaveAttribute('aria-pressed', 'true', { timeout: 3_000 }),
    );
    await expect
      .poll(async () => (await customerApi.wishlist.current()).items.map((i) => i.product.id))
      .toEqual([product.id]);
    await page.reload();
    await expect(productPage.heart, 'Saved state was lost after a reload').toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await productPage.heart.click();
    await expect(productPage.heart).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(async () => (await customerApi.wishlist.current()).items.length).toBe(0);
  });
});
