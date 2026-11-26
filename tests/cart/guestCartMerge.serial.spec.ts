/**
 * A guest's cart (kept in the browser, `localStorage.guest_cart`) moves into the customer's account when they
 * sign in, whether from the header or from the phone step at checkout. If this breaks, a shopper loses what
 * they picked at the moment they check out.
 *
 * Runs in the `customer` project (one test at a time): each test starts as a guest, signs the shared test
 * customer in, and reads and empties their server cart.
 */
import type { Page } from '@playwright/test';
import { json, type Cart, type Product } from '../../api';
import { env, requireCustomer } from '../../config/env';
import { expect, test } from '../../fixtures/test';
import { ProductPage } from '../../pages/product/ProductPage';
import { purchasableProducts } from '../../utils/shop';

test.use({ storageState: env.storageState.guest });
test.describe.configure({ mode: 'default' });

test.beforeEach(async ({ customerApi }) => {
  await json(customerApi.cart.clear());
});
test.afterEach(async ({ customerApi }) => {
  await customerApi.cart.clear();
});

/** Adds `quantity` of a product to the guest cart from its product page. */
async function addAsGuest(page: Page, product: Product, quantity = 1): Promise<ProductPage> {
  const productPage = new ProductPage(page);
  await productPage.openSlug(product.slugEn);
  for (let n = 1; n < quantity; n++) {
    await productPage.clickUntil(productPage.increase, () =>
      expect(productPage.quantity).toHaveText(String(n + 1), { timeout: 2_000 }),
    );
  }
  await productPage.clickUntil(productPage.addToCart, () =>
    expect(productPage.header.cartButtonWithLines).toBeVisible({ timeout: 2_000 }),
  );
  return productPage;
}

const guestCartLines = (page: Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem('guest_cart') ?? '[]') as unknown[]).length);

/** productId -> quantity, as the server holds the cart. */
const quantities = (cart: Cart) => Object.fromEntries(cart.items.map((i) => [i.product.id, i.quantity]));

test.describe('Guest cart on sign-in', { tag: ['@cart', '@auth', '@guest'] }, () => {
  test(
    'signing in from the header adds the guest cart to the cart the account already had',
    { tag: '@smoke' },
    async ({ api, customerApi, page, signInDialog }) => {
      const [guestProduct, accountProduct] = await purchasableProducts(api, 2);

      await test.step('The account already has one product in its cart', async () => {
        await customerApi.cart.seed([{ productId: accountProduct.id, quantity: 1 }]);
      });
      const productPage = await test.step('As a guest, add another product', async () => {
        const added = await addAsGuest(page, guestProduct);
        expect(await guestCartLines(page), 'Lines in the guest cart').toBe(1);
        return added;
      });
      await test.step('Sign in from the header', async () => {
        await productPage.header.clickUntil(
          productPage.header.signInButton,
          signInDialog.phoneStep,
          'The sign-in dialog',
        );
        await signInDialog.signIn(requireCustomer());
        await expect(productPage.header.accountButton).toBeVisible();
      });
      await test.step('The account cart holds both products, and the browser copy is gone', async () => {
        await expect(async () => {
          const cart = await json<Cart>(customerApi.cart.getCart());
          expect(quantities(cart)).toEqual({ [guestProduct.id]: 1, [accountProduct.id]: 1 });
        }, 'The guest product did not reach the account cart').toPass({ timeout: 10_000 });
        await expect(productPage.header.cartItemsLabel).toHaveText('2 items');
        expect(await guestCartLines(page), 'Lines left in the guest cart').toBe(0);
      });
    },
  );

  test('a product in both carts ends up once, with the quantities added together', async ({
    api,
    customerApi,
    page,
    signInDialog,
  }) => {
    const [product] = await purchasableProducts(api, 1);
    await customerApi.cart.seed([{ productId: product.id, quantity: 1 }]);
    const productPage = await addAsGuest(page, product, 2);

    await productPage.header.clickUntil(
      productPage.header.signInButton,
      signInDialog.phoneStep,
      'The sign-in dialog',
    );
    await signInDialog.signIn(requireCustomer());
    await expect(productPage.header.accountButton).toBeVisible();

    await expect(async () => {
      const cart = await json<Cart>(customerApi.cart.getCart());
      expect(cart.items, 'Lines in the account cart').toHaveLength(1);
      expect(quantities(cart)).toEqual({ [product.id]: 3 });
    }, 'Account 1 + guest 2 should make 3').toPass({ timeout: 10_000 });
  });

  test(
    'verifying the phone at checkout keeps the guest cart and opens the delivery address',
    { tag: '@checkout' },
    async ({ api, customerApi, page }) => {
      const customer = requireCustomer();
      const [guestProduct, accountProduct] = await purchasableProducts(api, 2);
      await customerApi.cart.seed([{ productId: accountProduct.id, quantity: 1 }]);
      await addAsGuest(page, guestProduct);

      const main = page.getByRole('main');
      await test.step('At checkout, enter the phone number and the code', async () => {
        await page.goto('/checkout');
        const phoneStep = main.getByRole('region', { name: 'Your phone number' });
        const countryCode = phoneStep.getByRole('combobox', { name: 'Country code' });
        if (!((await countryCode.textContent()) ?? '').includes(customer.dialCode)) {
          await countryCode.click();
          await page.getByRole('option', { name: customer.dialCode }).click();
        }
        await phoneStep.getByRole('textbox', { name: 'Mobile number' }).fill(customer.localNumber);
        await phoneStep.getByRole('button', { name: 'Send code' }).click();
        const codeStep = main.getByRole('region', { name: 'Enter the code' });
        await codeStep.getByRole('group').getByRole('textbox').first().click();
        await page.keyboard.type(customer.otp);
        await expect(codeStep).toBeHidden({ timeout: 15_000 });
      });

      await test.step('Still on checkout, with the address open and both products in the delivery', async () => {
        await expect(page).toHaveURL(/\/checkout/);
        await expect(main.getByRole('button', { name: /^Deliver to / })).toBeVisible();
        await expect(main.getByRole('region', { name: 'Delivery' })).toContainText('2 items');
        const cart = await json<Cart>(customerApi.cart.getCart());
        expect(quantities(cart)).toEqual({ [guestProduct.id]: 1, [accountProduct.id]: 1 });
      });
    },
  );
});
