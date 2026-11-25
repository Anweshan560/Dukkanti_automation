/**
 * Profile, address and wishlist API: positive, validation, ownership and permission tests.
 *
 * Changes the shared customer (its name is put back after every test, test addresses carry the
 * `qa######` marker and are deleted), so it runs in the `customer` project.
 */
import { buildApi, errorMessage, json, type Address, type Page, type Product, type User } from '../../api';
import { env } from '../../config/env';
import { knownBug } from '../../utils/knownBug';
import { expect, test } from '../../fixtures/test';
import { HOSTILE_STRINGS, MISSING_ID, purchasableProducts } from '../../utils/shop';
import { buildAddress, buildCustomer, qaName } from '../../utils/testData';

test.describe.configure({ mode: 'default' });

test.describe('Profile API', { tag: ['@account', '@api'] }, () => {
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

  test('a valid update is saved and returned by "who am I"', async ({ customerApi }) => {
    const profile = buildCustomer();
    const response = await customerApi.users.updateProfile(profile);
    expect(response.ok(), await errorMessage(response)).toBe(true);
    const me = await json<User>(customerApi.users.me());
    expect(me).toMatchObject({
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
    });
  });

  test(
    'the phone number, role and test flag cannot be changed through the profile',
    { tag: '@security' },
    async ({ customerApi }) => {
      const response = await customerApi.users.raw('PATCH', '/profile', {
        ...buildCustomer(),
        phoneNumber: '+971500000001',
        role: 'admin',
        isTest: true,
        id: MISSING_ID,
      });
      expect(response.status(), 'Unknown fields should be ignored or refused, never crash').toBeLessThan(500);
      const me = await json<User>(customerApi.users.me());
      expect(me.phoneNumber).toBe(original.phoneNumber);
      expect(me.role).toBe(original.role);
      expect(me.isTest).toBe(original.isTest);
      expect(me.id).toBe(original.id);
    },
  );

  for (const [label, change, field] of [
    ['an email without @', { email: 'not-an-email' }, 'email'],
    ['a language other than en/ar', { language: 'fr' }, 'language'],
    ['an empty first name', { firstName: '' }, 'firstName'],
    ['a first name that is not text', { firstName: 12345 }, 'firstName'],
  ] as const) {
    test(
      `${label} is refused with 400 and the profile is unchanged`,
      { tag: '@negative' },
      async ({ customerApi }) => {
        const response = await customerApi.users.raw('PATCH', '/profile', { ...buildCustomer(), ...change });
        expect(response.status(), `PATCH /users/profile with ${JSON.stringify(change)}`).toBe(400);
        expect(await errorMessage(response)).toContain(field);
        const me = await json<User>(customerApi.users.me());
        expect(me.firstName).toBe(original.firstName);
      },
    );
  }

  test('an empty profile update changes nothing', { tag: '@negative' }, async ({ customerApi }) => {
    const before = await json<Record<string, unknown>>(customerApi.users.me());
    const response = await customerApi.users.raw('PATCH', '/profile', {});
    // PATCH only changes the fields it is sent, so an empty body is a valid no-op (200) or a 400.
    expect([200, 400]).toContain(response.status());
    const after = await json<Record<string, unknown>>(customerApi.users.me());
    for (const field of ['firstName', 'lastName', 'email', 'phoneNumber'])
      expect(after[field], field).toEqual(before[field]);
  });

  test(
    'a 300-character name is refused or cut, never a server error',
    { tag: '@negative' },
    async ({ customerApi }) => {
      const response = await customerApi.users.updateProfile({
        ...buildCustomer(),
        firstName: 'A'.repeat(300),
      });
      expect(response.status()).toBeLessThan(500);
    },
  );

  test(
    'a name that looks like code is stored as plain text',
    { tag: '@security' },
    async ({ customerApi }) => {
      const response = await customerApi.users.updateProfile({
        ...buildCustomer(),
        firstName: HOSTILE_STRINGS.xss,
      });
      expect(response.status()).toBeLessThan(500);
      if (response.ok())
        expect((await json<User>(customerApi.users.me())).firstName).toBe(HOSTILE_STRINGS.xss);
    },
  );

  test('a guest cannot read or change a profile', { tag: '@security' }, async ({ api }) => {
    expect((await api.users.me()).status()).toBe(401);
    expect((await api.users.updateProfile(buildCustomer())).status()).toBe(401);
    expect((await api.users.raw('DELETE', '/me')).status()).toBe(401);
  });
});

test.describe('Address API', { tag: ['@account', '@api'] }, () => {
  const created: string[] = [];

  test.afterEach(async ({ customerApi }) => {
    for (const id of created.splice(0)) await customerApi.users.deleteAddress(id);
  });

  const create = async (customerApi: import('../../api').Api, overrides = {}) => {
    const input = buildAddress(overrides);
    const response = await customerApi.users.createAddress(input);
    // Playwright keeps the body, so reading it here does not stop the test from reading it again.
    if (response.ok()) created.push(((await response.json()) as Address).id);
    return { input, response };
  };

  test('a new address is saved with every field and listed', async ({ customerApi }) => {
    const input = buildAddress({ addressType: 'Office', city: 'Sharjah', phoneNumber: '+971501234567' });
    const response = await customerApi.users.createAddress(input);
    expect(response.status(), await response.text()).toBe(201);
    const address = (await response.json()) as Address;
    created.push(address.id);
    expect(address).toMatchObject({
      city: 'Sharjah',
      area: input.area,
      street: input.street,
      buildingName: input.buildingName,
      unitNumber: input.unitNumber,
      nickName: input.nickName,
      addressType: 'Office',
    });
    const list = await json<Address[]>(customerApi.users.listAddresses());
    expect(list.map((a) => a.id)).toContain(address.id);
  });

  test('an address can be changed and the change is kept', async ({ customerApi }) => {
    const address = await json<Address>(customerApi.users.createAddress(buildAddress()));
    created.push(address.id);
    const nickName = qaName('Office');
    const response = await customerApi.users.updateAddress(address.id, {
      ...buildAddress(),
      nickName,
      city: 'Ajman',
      unitNumber: '42',
    });
    expect(response.ok(), await errorMessage(response)).toBe(true);
    const saved = (await json<Address[]>(customerApi.users.listAddresses())).find((a) => a.id === address.id);
    expect(saved).toMatchObject({ nickName, city: 'Ajman', unitNumber: '42' });
  });

  test('a deleted address is gone from the list', async ({ customerApi }) => {
    const address = await json<Address>(customerApi.users.createAddress(buildAddress()));
    const response = await customerApi.users.deleteAddress(address.id);
    expect(response.ok()).toBe(true);
    expect((await json<Address[]>(customerApi.users.listAddresses())).map((a) => a.id)).not.toContain(
      address.id,
    );
  });

  test('a city outside the delivery area is refused', { tag: '@negative' }, async ({ customerApi }) => {
    knownBug('address-city-outside-delivery-area');
    const { response } = await create(customerApi, { city: 'Abu Dhabi' });
    expect(response.status(), 'The store only delivers to Dubai, Sharjah and Ajman').toBe(400);
  });

  for (const [label, overrides] of [
    ['an unknown address type', { addressType: 'Castle' }],
    ['an empty area', { area: '' }],
    ['an empty building name', { buildingName: '' }],
    ['an empty unit number', { unitNumber: '' }],
    ['a location that is not a point', { geoPoint: { type: 'Point', coordinates: ['north', 'east'] } }],
  ] as const) {
    test(`${label} is refused with 400`, { tag: '@negative' }, async ({ customerApi }) => {
      if ('geoPoint' in overrides) knownBug('address-geopoint-not-validated');
      const { response } = await create(customerApi, overrides);
      expect(response.status(), `POST /users/address with ${JSON.stringify(overrides)}`).toBe(400);
    });
  }

  test(
    'an address without its required fields is refused with 400 naming them',
    { tag: '@negative' },
    async ({ customerApi }) => {
      const response = await customerApi.users.raw('POST', '/address', { nickName: qaName('Empty') });
      expect(response.status()).toBe(400);
      const message = await errorMessage(response);
      for (const field of ['city', 'area', 'buildingName', 'unitNumber', 'addressType'])
        expect(message).toContain(field);
    },
  );

  test(
    'changing or deleting an address that does not exist answers 404',
    { tag: '@negative' },
    async ({ customerApi }) => {
      expect((await customerApi.users.updateAddress(MISSING_ID, buildAddress())).status()).toBe(404);
      expect((await customerApi.users.deleteAddress(MISSING_ID)).status()).toBe(404);
    },
  );

  test(
    'an address id that is not a UUID is refused without a server error',
    { tag: '@negative' },
    async ({ customerApi }) => {
      knownBug('address-invalid-id-500');
      expect((await customerApi.users.updateAddress('not-a-uuid', buildAddress())).status()).toBeLessThan(
        500,
      );
      expect((await customerApi.users.deleteAddress('not-a-uuid')).status()).toBeLessThan(500);
    },
  );

  test(
    'address text that looks like code is stored as plain text',
    { tag: '@security' },
    async ({ customerApi }) => {
      const response = await customerApi.users.createAddress(
        buildAddress({ street: HOSTILE_STRINGS.xss, buildingName: HOSTILE_STRINGS.sql }),
      );
      expect(response.status()).toBe(201);
      const address = (await response.json()) as Address;
      created.push(address.id);
      expect(address.street).toBe(HOSTILE_STRINGS.xss);
      expect(address.buildingName).toBe(HOSTILE_STRINGS.sql);
    },
  );

  test('a guest cannot list, add, change or delete addresses', { tag: '@security' }, async ({ api }) => {
    for (const response of await Promise.all([
      api.users.listAddresses(),
      api.users.createAddress(buildAddress()),
      api.users.updateAddress(MISSING_ID, buildAddress()),
      api.users.deleteAddress(MISSING_ID),
    ])) {
      expect(response.status(), response.url()).toBe(401);
    }
  });

  test(
    "another customer cannot see, change, delete or deliver to this customer's address",
    { tag: '@security' },
    async ({ customerApi, playwright }) => {
      test.skip(
        !env.customer2,
        'Set CUSTOMER2_PHONE and CUSTOMER2_OTP in .env to test access between customers.',
      );
      const mine = await json<Address>(customerApi.users.createAddress(buildAddress()));
      created.push(mine.id);
      const context = await playwright.request.newContext();
      try {
        const { token } = await buildApi(context).users.loginAs(env.customer2!);
        const other = buildApi(context, token);
        const theirs = await json<Address[]>(other.users.listAddresses());
        expect(
          theirs.map((a) => a.id),
          'The other customer can list this address',
        ).not.toContain(mine.id);
        expect([403, 404]).toContain(
          (await other.users.updateAddress(mine.id, { street: 'changed by someone else' })).status(),
        );
        expect([403, 404]).toContain((await other.users.deleteAddress(mine.id)).status());
        // No checkout call here (rate limited): the cart is empty, so a checkout could not prove anything.
      } finally {
        await context.dispose();
      }
      const after = (await json<Address[]>(customerApi.users.listAddresses())).find((a) => a.id === mine.id);
      expect(after, 'The address was deleted by another customer').toBeDefined();
      expect(after!.street).toBe(mine.street);
    },
  );
});

test.describe('Wishlist API', { tag: ['@account', '@wishlist', '@api'] }, () => {
  test.beforeEach(async ({ customerApi }) => {
    await json(customerApi.wishlist.clear());
  });
  test.afterEach(async ({ customerApi }) => {
    await customerApi.wishlist.clear();
  });

  test('a saved product is listed and marked as saved in the catalog', async ({ api, customerApi }) => {
    knownBug('wishlist-flag-and-filter-ignored');
    const [product] = await purchasableProducts(api, 1);
    const response = await customerApi.wishlist.add(product.id);
    expect(response.status()).toBe(201);
    expect((await customerApi.wishlist.current()).items.map((i) => i.product.id)).toEqual([product.id]);
    const seen = await json<Product>(customerApi.products.getById(product.id));
    expect(seen.isInWishlist, 'The product does not say it is saved').toBe(true);
    const saved = await json<Page<Product>>(customerApi.products.list({ wishlist: true, limit: 50 }));
    expect(saved.data.map((p) => p.id)).toEqual([product.id]);
  });

  test('saving the same product twice keeps one entry', async ({ api, customerApi }) => {
    const [product] = await purchasableProducts(api, 1);
    await json(customerApi.wishlist.add(product.id));
    const again = await customerApi.wishlist.add(product.id);
    expect(again.status(), 'A repeat save should succeed or say it is already saved').toBeLessThan(500);
    expect((await customerApi.wishlist.current()).items).toHaveLength(1);
  });

  test('removing an entry and clearing the list both work', async ({ api, customerApi }) => {
    const [first, second] = await purchasableProducts(api, 2);
    await json(customerApi.wishlist.add(first.id));
    await json(customerApi.wishlist.add(second.id));
    const list = await customerApi.wishlist.current();
    expect(
      (await customerApi.wishlist.remove(list.items.find((i) => i.product.id === first.id)?.id ?? '')).ok(),
    ).toBe(true);
    expect((await customerApi.wishlist.current()).items.map((i) => i.product.id)).toEqual([second.id]);
    expect((await customerApi.wishlist.clear()).ok()).toBe(true);
    expect((await customerApi.wishlist.current()).items).toEqual([]);
  });

  test('a product that does not exist cannot be saved', { tag: '@negative' }, async ({ customerApi }) => {
    expect((await customerApi.wishlist.add(MISSING_ID)).status()).toBe(404);
    expect((await customerApi.wishlist.current()).items).toEqual([]);
  });

  test(
    'a product id that is not a UUID, or none at all, is refused without a server error',
    { tag: '@negative' },
    async ({ customerApi }) => {
      knownBug('wishlist-invalid-id-500');
      expect((await customerApi.wishlist.add('not-a-uuid')).status()).toBeLessThan(500);
      const empty = await customerApi.wishlist.raw('POST', '/add', {});
      expect(empty.status()).toBe(400);
    },
  );

  test('removing an entry that does not exist answers 404', { tag: '@negative' }, async ({ customerApi }) => {
    knownBug('wishlist-remove-missing-200');
    expect((await customerApi.wishlist.remove(MISSING_ID)).status()).toBe(404);
  });

  test('a guest cannot read or change a wishlist', { tag: '@security' }, async ({ api }) => {
    for (const response of await Promise.all([
      api.wishlist.getWishlist(),
      api.wishlist.add(MISSING_ID),
      api.wishlist.remove(MISSING_ID),
      api.wishlist.clear(),
    ])) {
      expect(response.status(), response.url()).toBe(401);
    }
  });
});
