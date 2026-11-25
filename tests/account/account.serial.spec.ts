/**
 * Profile, addresses and wishlist pages, as the signed-in customer.
 *
 * Changes the shared customer (names are put back, test addresses carry the `qa######` marker and are
 * deleted), so it runs in the `customer` project.
 */
import { json, type Address, type User } from '../../api';
import { env } from '../../config/env';
import { expect, test } from '../../fixtures/test';
import { AddressesPage, CouponsPage, ProfilePage, WishlistPage } from '../../pages/account/AccountPages';
import { recordApiCalls, waitForApi } from '../../utils/network';
import { HOSTILE_STRINGS, outOfStockProduct, purchasableProducts } from '../../utils/shop';
import { buildAddress, isQaMarked, qaName } from '../../utils/testData';

test.use({ storageState: env.storageState.customer });
test.describe.configure({ mode: 'default' });

test.describe('Profile page', { tag: ['@account'] }, () => {
  let original: User;

  test.beforeEach(async ({ customerApi }) => {
    original = await json<User>(customerApi.users.me());
  });
  test.afterEach(async ({ customerApi }) => {
    await customerApi.users.updateProfile({
      firstName: original.firstName ?? '',
      lastName: original.lastName ?? '',
      email: original.email ?? '',
      language: (original.language as 'en' | 'ar') ?? 'en',
    });
  });

  test('shows the saved names and the verified mobile number, which cannot be edited', async ({ page }) => {
    const profile = new ProfilePage(page);
    await profile.open();
    await expect(profile.firstName).toHaveValue(original.firstName ?? '');
    await expect(profile.lastName).toHaveValue(original.lastName ?? '');
    await expect(profile.mobile).not.toBeEditable();
    await expect(profile.main.getByText('Verified')).toBeVisible();
  });

  test(
    'a changed name is saved, kept after a reload, and greets the customer in the header',
    { tag: '@smoke' },
    async ({ page, customerApi }) => {
      const profile = new ProfilePage(page);
      await profile.open();
      const firstName = `Qa${Date.now().toString().slice(-6)}`;
      const lastName = qaName('Tester');
      await profile.firstName.fill(firstName);
      await profile.lastName.fill(lastName);
      const saved = waitForApi(page, 'PATCH', '/users/profile');
      await profile.save.click();
      expect((await saved).ok()).toBe(true);
      await expect.poll(async () => (await json<User>(customerApi.users.me())).firstName).toBe(firstName);
      await page.reload();
      await expect(profile.firstName).toHaveValue(firstName);
      await expect(profile.lastName).toHaveValue(lastName);
      // The button also holds the initials avatar ("QT"), and its text runs together: "QTHello,Qa123456".
      await expect(profile.header.accountButton).toContainText(new RegExp(`Hello,\\s*${firstName}`));
    },
  );

  for (const [label, field, value] of [
    ['an empty first name', 'firstName', ''],
    ['a first name of only spaces', 'firstName', '   '],
    ['an empty last name', 'lastName', ''],
    ['an email without @', 'email', 'not-an-email'],
  ] as const) {
    test(
      `${label} is not saved and the field says what is wrong`,
      { tag: '@negative' },
      async ({ page, customerApi }) => {
        const profile = new ProfilePage(page);
        await profile.open();
        const input = profile[field];
        await input.fill(value);
        const calls = recordApiCalls(page);
        await profile.save.click();
        await expect(input, `${field} should be marked invalid`).toHaveAttribute('aria-invalid', 'true');
        calls.stop();
        const patched = calls.calls.filter((c) => c.method === 'PATCH' && c.path === '/users/profile');
        expect(
          patched.every((c) => c.status >= 400),
          'An invalid profile was accepted by the server',
        ).toBe(true);
        const me = await json<User>(customerApi.users.me());
        expect(me[field === 'email' ? 'email' : field]).toBe(original[field === 'email' ? 'email' : field]);
      },
    );
  }

  test(
    'a name that looks like code is shown as text and never runs',
    { tag: '@security' },
    async ({ page, customerApi }) => {
      await json(
        customerApi.users.updateProfile({
          firstName: HOSTILE_STRINGS.xss,
          lastName: original.lastName ?? 'x',
          email: original.email ?? '',
          language: 'en',
        }),
      );
      const profile = new ProfilePage(page);
      await profile.open();
      await expect(profile.firstName).toHaveValue(HOSTILE_STRINGS.xss);
      expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    },
  );

  test(
    '"Delete account" asks for confirmation, and Cancel keeps the account',
    { tag: '@negative' },
    async ({ page, customerApi }) => {
      const profile = new ProfilePage(page);
      await profile.open();
      await profile.deleteAccount.click();
      const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog')).first();
      await expect(confirm, 'Deleting an account must ask first').toBeVisible();
      await confirm.getByRole('button', { name: /Cancel|Keep|No/ }).click();
      await expect(confirm).toBeHidden();
      expect((await customerApi.users.me()).status(), 'The account is gone after Cancel').toBe(200);
    },
  );
});

test.describe('Addresses page', { tag: ['@account'] }, () => {
  test.afterEach(async ({ customerApi }) => {
    for (const address of await json<Address[]>(customerApi.users.listAddresses())) {
      if (isQaMarked(address.nickName)) await customerApi.users.deleteAddress(address.id);
    }
  });

  test('lists every saved address and the summary counts them', async ({ page, customerApi }) => {
    const addresses = await json<Address[]>(customerApi.users.listAddresses());
    const addressesPage = new AddressesPage(page);
    await addressesPage.open();
    await expect(addressesPage.cards).toHaveCount(addresses.length);
    await addressesPage.sidebar.expectCount('Addresses', addresses.length);
  });

  test(
    'a new address typed into the form is saved and listed',
    { tag: '@smoke' },
    async ({ page, customerApi }) => {
      const input = buildAddress();
      const addressesPage = new AddressesPage(page);
      await addressesPage.open();
      await addressesPage.addNew.click();
      await expect(addressesPage.dialog.root).toBeVisible();
      await addressesPage.dialog.fill({
        type: 'House',
        nickname: input.nickName,
        city: 'Sharjah',
        area: input.area,
        street: input.street,
        building: input.buildingName,
        unit: input.unitNumber,
      });
      const created = waitForApi(page, 'POST', '/users/address');
      await addressesPage.dialog.save.click();
      expect((await created).status()).toBe(201);
      await expect(addressesPage.dialog.root).toBeHidden();
      await expect(addressesPage.card(input.nickName)).toBeVisible();
      const saved = (await json<Address[]>(customerApi.users.listAddresses())).find(
        (a) => a.nickName === input.nickName,
      );
      expect(saved).toMatchObject({
        city: 'Sharjah',
        addressType: 'House',
        buildingName: input.buildingName,
        unitNumber: input.unitNumber,
      });
    },
  );

  test(
    'saving an empty form marks the required fields and saves nothing',
    { tag: '@negative' },
    async ({ page }) => {
      const addressesPage = new AddressesPage(page);
      await addressesPage.open();
      await addressesPage.addNew.click();
      const calls = recordApiCalls(page);
      await addressesPage.dialog.save.click();
      await expect(addressesPage.dialog.root).toBeVisible();
      for (const field of [
        addressesPage.dialog.area,
        addressesPage.dialog.building,
        addressesPage.dialog.unit,
      ]) {
        await expect(field).toHaveAttribute('aria-invalid', 'true');
      }
      calls.stop();
      expect(calls.calls.filter((c) => c.method === 'POST' && c.path === '/users/address')).toEqual([]);
    },
  );

  test('Cancel on an untouched form closes it at once', { tag: '@negative' }, async ({ page }) => {
    const addressesPage = new AddressesPage(page);
    await addressesPage.open();
    await addressesPage.addNew.click();
    await addressesPage.dialog.cancel.click();
    await expect(addressesPage.dialog.root).toBeHidden();
    await expect(addressesPage.dialog.discardConfirmation).toHaveCount(0);
  });

  test(
    'Cancel on a filled form asks first: Discard closes without saving',
    { tag: '@negative' },
    async ({ page, customerApi }) => {
      const before = (await json<Address[]>(customerApi.users.listAddresses())).length;
      const addressesPage = new AddressesPage(page);
      await addressesPage.open();
      await addressesPage.addNew.click();
      await addressesPage.dialog.fill({
        nickname: qaName('Cancelled'),
        area: 'Downtown',
        building: 'X',
        unit: '1',
      });
      await addressesPage.dialog.cancel.click();
      await expect(addressesPage.dialog.discardConfirmation).toBeVisible();
      await addressesPage.dialog.discard.click();
      await expect(addressesPage.dialog.root).toBeHidden();
      expect((await json<Address[]>(customerApi.users.listAddresses())).length).toBe(before);
    },
  );

  test(
    'Cancel on a filled form asks first: keeping on editing keeps what was typed',
    { tag: '@negative' },
    async ({ page, customerApi }) => {
      const before = (await json<Address[]>(customerApi.users.listAddresses())).length;
      const addressesPage = new AddressesPage(page);
      await addressesPage.open();
      await addressesPage.addNew.click();
      await addressesPage.dialog.fill({ area: 'Downtown', building: 'Tower Q' });
      await addressesPage.dialog.cancel.click();
      await addressesPage.dialog.keepEditing.click();
      await expect(addressesPage.dialog.discardConfirmation).toBeHidden();
      await expect(addressesPage.dialog.root).toBeVisible();
      await expect(addressesPage.dialog.area).toHaveValue('Downtown');
      await expect(addressesPage.dialog.building).toHaveValue('Tower Q');
      await addressesPage.dialog.cancel.click();
      await addressesPage.dialog.discard.click();
      expect((await json<Address[]>(customerApi.users.listAddresses())).length).toBe(before);
    },
  );

  test('editing an address saves the change', async ({ page, customerApi }) => {
    const address = await json<Address>(customerApi.users.createAddress(buildAddress()));
    const addressesPage = new AddressesPage(page);
    await addressesPage.open();
    await addressesPage.card(address.nickName).getByRole('button', { name: 'Edit' }).click();
    await expect(addressesPage.dialog.root).toBeVisible();
    await expect(addressesPage.dialog.building).toHaveValue(address.buildingName);
    await addressesPage.dialog.unit.fill('7777');
    const saved = waitForApi(page, 'PATCH', new RegExp(`/users/address/${address.id}`));
    await addressesPage.dialog.save.click();
    expect((await saved).ok()).toBe(true);
    await expect
      .poll(
        async () =>
          (await json<Address[]>(customerApi.users.listAddresses())).find((a) => a.id === address.id)
            ?.unitNumber,
      )
      .toBe('7777');
  });

  test('Remove deletes the address', async ({ page, customerApi }) => {
    const address = await json<Address>(customerApi.users.createAddress(buildAddress()));
    const addressesPage = new AddressesPage(page);
    await addressesPage.open();
    await addressesPage.card(address.nickName).getByRole('button', { name: 'Remove' }).click();
    const confirm = page.getByRole('alertdialog');
    if (await confirm.isVisible({ timeout: 2_000 }).catch(() => false))
      await confirm.getByRole('button', { name: /Remove|Delete|Yes/ }).click();
    await expect(addressesPage.card(address.nickName)).toHaveCount(0);
    await expect
      .poll(async () =>
        (await json<Address[]>(customerApi.users.listAddresses())).some((a) => a.id === address.id),
      )
      .toBe(false);
  });

  test(
    'an address text that looks like code is shown as text',
    { tag: '@security' },
    async ({ page, customerApi }) => {
      await json(customerApi.users.createAddress(buildAddress({ street: HOSTILE_STRINGS.xss })));
      const addressesPage = new AddressesPage(page);
      await addressesPage.open();
      await expect(addressesPage.main.getByText(HOSTILE_STRINGS.xss, { exact: false }).first()).toBeVisible();
      expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    },
  );
});

test.describe('Wishlist page', { tag: ['@account', '@wishlist'] }, () => {
  test.beforeEach(async ({ customerApi }) => {
    await json(customerApi.wishlist.clear());
  });
  test.afterEach(async ({ customerApi }) => {
    await customerApi.wishlist.clear();
  });

  test('an empty wishlist says so and links to the shop', { tag: '@states' }, async ({ page }) => {
    const wishlist = new WishlistPage(page);
    await wishlist.open();
    await expect(wishlist.emptyHeading).toBeVisible();
    await expect(wishlist.countLabel).toHaveText('0 saved items');
    await expect(wishlist.continueShopping).toHaveAttribute('href', '/products');
  });

  test('saved products are listed with the count, in the page and the summary', async ({
    api,
    customerApi,
    page,
  }) => {
    const products = await purchasableProducts(api, 2);
    for (const product of products) await json(customerApi.wishlist.add(product.id));
    const wishlist = new WishlistPage(page);
    await wishlist.open();
    await expect(wishlist.countLabel).toHaveText('2 saved items');
    for (const product of products) await expect(wishlist.productLink(product.name)).toBeVisible();
    await wishlist.sidebar.expectCount('Wishlist', 2);
  });

  test(
    'a saved product that is out of stock says so and offers no Add button',
    { tag: ['@stock', '@states'] },
    async ({ api, customerApi, page }) => {
      const product = await outOfStockProduct(api);
      await json(customerApi.wishlist.add(product.id));
      const wishlist = new WishlistPage(page);
      await wishlist.open();
      await expect(wishlist.productLink(product.name)).toBeVisible();
      await expect(wishlist.main.getByText('Out of stock', { exact: true })).toBeVisible();
      await expect(wishlist.main.getByRole('button', { name: `Add ${product.name} to cart` })).toHaveCount(0);
    },
  );

  test('unsaving from the wishlist removes the product', async ({ api, customerApi, page }) => {
    const [product] = await purchasableProducts(api, 1);
    await json(customerApi.wishlist.add(product.id));
    const wishlist = new WishlistPage(page);
    await wishlist.open();
    await wishlist.main.getByRole('button', { name: `Save or unsave ${product.name}` }).click();
    await expect.poll(async () => (await customerApi.wishlist.current()).items.length).toBe(0);
    await page.reload();
    await expect(wishlist.emptyHeading).toBeVisible();
  });
});

test.describe('My coupons page', { tag: ['@account', '@coupons'] }, () => {
  test('lists the coupons saved to the account, or says there are none', async ({ page, customerApi }) => {
    const coupons = await json<{ code: string }[]>(customerApi.coupons.list());
    const couponsPage = new CouponsPage(page);
    await couponsPage.open();
    await expect(couponsPage.sidebar.menu.getByRole('link', { name: 'My coupons' })).toBeVisible();
    if (!coupons.length) {
      await expect(couponsPage.emptyHeading).toBeVisible();
      await expect(couponsPage.emptyHint).toBeVisible();
    } else {
      await expect(couponsPage.emptyHeading).toHaveCount(0);
      for (const coupon of coupons)
        await expect(couponsPage.main.getByText(coupon.code).first(), coupon.code).toBeVisible();
    }
  });

  test('with an empty cart the page says coupons need products in the cart', async ({
    page,
    customerApi,
  }) => {
    await json(customerApi.cart.clear());
    const couponsPage = new CouponsPage(page);
    await couponsPage.open();
    await expect(couponsPage.cartHint).toBeVisible();
  });

  test('the account menu opens My coupons', async ({ page }) => {
    const profile = new ProfilePage(page);
    await profile.open();
    await profile.sidebar.menu.getByRole('link', { name: 'My coupons' }).click();
    await expect(page).toHaveURL(/\/account\/coupons$/);
    await expect(new CouponsPage(page).heading).toBeVisible();
  });
});
