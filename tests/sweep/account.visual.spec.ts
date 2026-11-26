/**
 * Screenshots of the signed-in pages: cart, checkout and account (opt-in: npm run test:visual).
 *
 * The cart is seeded with one product so the cart and checkout always have the same shape; personal
 * details (name, phone, e-mail, addresses) are masked as well as changing content, so the baselines in
 * the repository hold no customer data. Runs one test at a time because it changes the cart.
 */
import { json } from '../../api';
import { env } from '../../config/env';
import { expect, test } from '../../fixtures/test';
import { AddressesPage, CouponsPage, OrdersPage, ProfilePage } from '../../pages/account/AccountPages';
import { purchasableProducts } from '../../utils/shop';
import type { Page } from '@playwright/test';
import { settle, volatileContent } from './visualMasks';

/** The sidebar card on every account page: the customer's name, phone and order/wishlist/address counts. */
const accountCard = (page: Page) => {
  const sidebar = page.getByRole('main').getByRole('complementary').first();
  return [
    // The card at the top of the sidebar (initials, name, phone, "Member since") and its count links.
    sidebar.locator(':scope > *').first(),
    sidebar.getByRole('link', { name: /^\d+ (Orders|Wishlist|Addresses)$/ }),
    // The name and phone above the profile form; test customers are named "... qa123456".
    page.getByRole('main').getByText(/^\+\d|qa\d|^[A-Z]{2}$/),
  ];
};

test.use({ storageState: env.storageState.customer });
test.describe.configure({ mode: 'serial' });

test.describe('Page layouts when signed in', { tag: ['@visual', '@nonfunctional'] }, () => {
  test.afterAll(async ({ customerApi }) => {
    await customerApi.cart.clear();
  });

  test('empty cart', async ({ customerApi, page, cartPage }) => {
    await json(customerApi.cart.clear());
    await cartPage.open();
    await settle(page);
    await expect(page).toHaveScreenshot('cart-empty.png', { mask: volatileContent(page) });
  });

  test('cart with one product', async ({ api, customerApi, page, cartPage }) => {
    const [product] = await purchasableProducts(api, 1);
    await customerApi.cart.seed([{ productId: product.id, quantity: 1 }]);
    await cartPage.open();
    await settle(page);
    await expect(page).toHaveScreenshot('cart.png', {
      mask: [...volatileContent(page), cartPage.lines.root.getByRole('link'), cartPage.quickAdds],
    });
  });

  test('checkout', async ({ api, customerApi, page, checkoutPage }) => {
    const [product] = await purchasableProducts(api, 1);
    await customerApi.cart.seed([{ productId: product.id, quantity: 1 }]);
    await checkoutPage.open();
    await settle(page);
    await expect(page).toHaveScreenshot('checkout.png', {
      // The address, the delivery day and the line all change; the countdown ticks.
      mask: [...volatileContent(page), checkoutPage.deliverTo, checkoutPage.delivery.root],
    });
  });

  test('profile', async ({ page }) => {
    const profile = new ProfilePage(page);
    await profile.open();
    await settle(page);
    await expect(page).toHaveScreenshot('profile.png', {
      mask: [
        ...volatileContent(page),
        profile.firstName,
        profile.lastName,
        profile.mobile,
        profile.email,
        ...accountCard(page),
      ],
    });
  });

  test('orders', async ({ page }) => {
    const orders = new OrdersPage(page);
    await orders.open();
    await settle(page);
    await expect(page).toHaveScreenshot('orders.png', {
      mask: [...volatileContent(page), ...accountCard(page), orders.pendingPanel],
    });
  });

  test('addresses', async ({ page }) => {
    const addresses = new AddressesPage(page);
    await addresses.open();
    await settle(page);
    await expect(page).toHaveScreenshot('addresses.png', {
      mask: [...volatileContent(page), ...accountCard(page), addresses.cards],
    });
  });

  test('my coupons', async ({ page }) => {
    const coupons = new CouponsPage(page);
    await coupons.open();
    await settle(page);
    await expect(page).toHaveScreenshot('coupons.png', {
      mask: [...volatileContent(page), ...accountCard(page), coupons.main.getByRole('list')],
    });
  });
});
