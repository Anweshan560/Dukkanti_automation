/**
 * Dialogs, drawers and menus of the signed-in customer: keyboard and screen-reader basics
 * (see dialogCheck.ts). Opens nothing that saves: every dialog is closed with Escape.
 *
 * Cart, checkout and "Order again" need a filled cart or an order, so this runs in the `customer` project.
 */
import { json, type OrderSummary, type Page as ApiPage } from '../../api';
import { env } from '../../config/env';
import { expect, test } from '../../fixtures/test';
import { AddressesPage, OrderDetailPage } from '../../pages/account/AccountPages';
import { knownBug } from '../../utils/knownBug';
import { quantityForExactly } from '../../utils/shop';
import { checkDialog } from './dialogCheck';

test.use({ storageState: env.storageState.customer });
test.describe.configure({ mode: 'default' });

test.describe('Dialogs for a customer', { tag: ['@sweep', '@a11y', '@nonfunctional'] }, () => {
  test.afterEach(async ({ customerApi }) => {
    await customerApi.cart.clear();
  });

  async function fillCart(
    api: import('../../api').Api,
    customerApi: import('../../api').Api,
    minOrder: number,
  ) {
    const { product, quantity } = await quantityForExactly(api, minOrder);
    await customerApi.cart.seed([{ productId: product.id, quantity: quantity + 1 }]);
  }

  test('the cart drawer', async ({ api, customerApi, storeInfo, page, homePage }) => {
    await fillCart(api, customerApi, storeInfo.minOrderAmount);
    await homePage.open();
    // Until the session has loaded, the header is the guest one and the cart button opens sign-in instead.
    await expect(homePage.header.accountButton).toBeVisible();
    const trigger = homePage.header.cartButton;
    await checkDialog(
      page,
      'cart drawer',
      () => trigger.click(),
      page.getByRole('dialog', { name: 'Your cart' }),
      trigger,
    );
  });

  test(
    'tapping the cart while the page is still loading opens the cart, not sign-in',
    { tag: '@states' },
    async ({ api, customerApi, storeInfo, page, homePage, signInDialog }) => {
      knownBug('signed-in-header-starts-as-guest');
      await fillCart(api, customerApi, storeInfo.minOrderAmount);
      // A slow connection: the customer's profile takes 3 s to arrive.
      await page.route(/\/v1\/users\/me$/, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        await route.continue();
      });
      await homePage.open();
      await homePage.header.cartButton.click();
      await expect(
        page.getByRole('dialog', { name: 'Your cart' }).or(signInDialog.phoneStep).first(),
      ).toBeVisible();
      await expect(signInDialog.phoneStep, 'A signed-in customer was asked to sign in').toBeHidden();
      await expect(page.getByRole('dialog', { name: 'Your cart' })).toBeVisible();
    },
  );

  test('the account menu', async ({ page, homePage }) => {
    await homePage.open();
    const trigger = homePage.header.accountButton;
    await checkDialog(page, 'account menu', () => trigger.click(), homePage.header.accountMenu, trigger);
  });

  test('the "Sign out?" confirmation', async ({ page, homePage }) => {
    await homePage.open();
    const header = homePage.header;
    // The menu item that opened it is gone once the menu closes, so the focus goes back to the account button.
    await checkDialog(
      page,
      '"Sign out?" confirmation',
      () => header.chooseSignOut(),
      header.signOutConfirmation,
      header.accountButton,
    );
    await expect(header.accountButton, 'Escape on "Sign out?" must not sign the customer out').toBeVisible();
  });

  test('the add-address form', async ({ page }) => {
    const addresses = new AddressesPage(page);
    await addresses.open();
    await checkDialog(
      page,
      'address form',
      () => addresses.addNew.click(),
      addresses.dialog.root,
      addresses.addNew,
    );
  });

  test('the "Order again" choice', async ({ customerApi, page }) => {
    const [order] = (await json<ApiPage<OrderSummary>>(customerApi.orders.list({ page: 1, limit: 1 }))).data;
    test.skip(!order, 'The test customer has no orders');
    const detail = new OrderDetailPage(page);
    await detail.openOrder(order.id);
    await checkDialog(
      page,
      '"Order again" dialog',
      () => detail.orderAgain.click(),
      detail.orderAgainDialog,
      detail.orderAgain,
    );
  });

  test('the checkout address picker and coupon list', async ({
    api,
    customerApi,
    storeInfo,
    page,
    checkoutPage,
  }) => {
    await fillCart(api, customerApi, storeInfo.minOrderAmount);
    await checkoutPage.open();
    await checkoutPage.waitUntilReady();
    await checkDialog(
      page,
      'address picker',
      () => checkoutPage.deliverTo.click(),
      checkoutPage.addressPicker,
      checkoutPage.deliverTo,
    );
    await checkDialog(
      page,
      'coupon list',
      () => checkoutPage.viewCoupons.click(),
      page.getByRole('dialog', { name: 'My coupons' }),
      checkoutPage.viewCoupons,
    );
  });
});
