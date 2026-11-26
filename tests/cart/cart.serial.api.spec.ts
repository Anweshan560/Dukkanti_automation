/**
 * Cart API: positive, boundary, negative and permission tests.
 *
 * Runs in the `customer` project (one test at a time): every test changes the shared customer's cart.
 * Each test starts from an empty cart and empties it again afterwards.
 */
import { buildApi, errorMessage, json, type Api, type Cart, type Product } from '../../api';
import { expect, test } from '../../fixtures/test';
import { sameMoney } from '../../utils/dom';
import { knownBug } from '../../utils/knownBug';
import { CHECKOUT_TEST_TIMEOUT, retryOn429 } from '../../utils/rateLimit';
import { env } from '../../config/env';
import {
  expectedTotals,
  HOSTILE_STRINGS,
  MISSING_ID,
  outOfStockProduct,
  purchasableProducts,
  quantityForExactly,
  round2,
} from '../../utils/shop';
import { qaName } from '../../utils/testData';

test.describe.configure({ mode: 'default' });

test.beforeEach(async ({ customerApi }) => {
  await json(customerApi.cart.clear());
});
test.afterEach(async ({ customerApi }) => {
  await customerApi.cart.clear();
});

const line = (cart: Cart, product: Product) => cart.items.find((item) => item.product.id === product.id);

test.describe('Cart API: adding, changing and removing lines', { tag: ['@cart', '@api'] }, () => {
  test(
    'adding a product creates one line at the product price',
    { tag: '@smoke' },
    async ({ api, customerApi }) => {
      const [product] = await purchasableProducts(api, 1);
      const response = await customerApi.cart.add(product.id, 2);
      expect(response.status()).toBe(201);
      const cart = (await response.json()) as Cart;
      const added = line(cart, product);
      expect(added, 'The product is not in the cart the API returned').toBeTruthy();
      expect(added?.quantity).toBe(2);
      expect(added?.price).toBe(product.price);
      expect(sameMoney(added?.lineTotal ?? NaN, round2(product.price * 2))).toBe(true);
      // The response and a fresh read agree.
      expect((await customerApi.cart.current()).items.map((i) => [i.product.id, i.quantity])).toEqual([
        [product.id, 2],
      ]);
    },
  );

  test('adding the same product again adds to the quantity instead of making a second line', async ({
    api,
    customerApi,
  }) => {
    const [product] = await purchasableProducts(api, 1);
    await json(customerApi.cart.add(product.id, 2));
    const cart = await json<Cart>(customerApi.cart.add(product.id, 3));
    expect(cart.items).toHaveLength(1);
    expect(line(cart, product)?.quantity).toBe(5);
  });

  test('update sets the exact quantity and the line total follows', async ({ api, customerApi }) => {
    const [product] = await purchasableProducts(api, 1);
    await json(customerApi.cart.add(product.id, 1));
    const response = await customerApi.cart.update(product.id, 4);
    expect(response.status()).toBe(200);
    const cart = await customerApi.cart.current();
    expect(line(cart, product)?.quantity).toBe(4);
    expect(sameMoney(line(cart, product)?.lineTotal ?? NaN, round2(product.price * 4))).toBe(true);
  });

  test('update to 0 removes the line', async ({ api, customerApi }) => {
    const [product] = await purchasableProducts(api, 1);
    await customerApi.cart.seed([{ productId: product.id, quantity: 2 }]);
    expect((await customerApi.cart.update(product.id, 0)).ok()).toBe(true);
    expect((await customerApi.cart.current()).items).toEqual([]);
  });

  test('removing a line by its id leaves the other lines alone', async ({ api, customerApi }) => {
    const [first, second] = await purchasableProducts(api, 2);
    const cart = await customerApi.cart.seed([
      { productId: first.id, quantity: 1 },
      { productId: second.id, quantity: 2 },
    ]);
    const response = await customerApi.cart.remove(line(cart, first)?.id ?? '');
    expect(response.ok()).toBe(true);
    const after = await customerApi.cart.current();
    expect(after.items.map((i) => [i.product.id, i.quantity])).toEqual([[second.id, 2]]);
  });

  test('clearing empties products, requested items and totals', async ({ api, customerApi }) => {
    const [product] = await purchasableProducts(api, 1);
    await customerApi.cart.seed([{ productId: product.id, quantity: 3 }]);
    await json(
      customerApi.cart.addSpecial({
        name: qaName('Nabulsi cheese'),
        description: 'test',
        quantity: 1,
        minPrice: 10,
        maxPrice: 49,
      }),
    );
    const response = await customerApi.cart.clear();
    expect(response.ok()).toBe(true);
    const cart = await customerApi.cart.current();
    expect(cart.items).toEqual([]);
    expect(cart.specialItems).toEqual([]);
    expect(cart.subTotal ?? 0).toBe(0);
  });

  test('the subtotal is the sum of every line', async ({ api, customerApi }) => {
    const products = await purchasableProducts(api, 3);
    const cart = await customerApi.cart.seed(
      products.map((p, index) => ({ productId: p.id, quantity: index + 1 })),
    );
    const sum = round2(products.reduce((total, p, index) => total + p.price * (index + 1), 0));
    expect(cart.items).toHaveLength(3);
    expect(sameMoney(cart.subTotal, sum), `Subtotal ${cart.subTotal}, lines add up to ${sum}`).toBe(true);
  });

  test('bulk add puts several products in at once', async ({ api, customerApi }) => {
    const [first, second] = await purchasableProducts(api, 2);
    const response = await customerApi.cart.addBulk([
      { productId: first.id, quantity: 1 },
      { productId: second.id, quantity: 3 },
    ]);
    expect(response.ok()).toBe(true);
    const cart = await customerApi.cart.current();
    expect(cart.items.map((i) => [i.product.id, i.quantity]).sort()).toEqual(
      [
        [first.id, 1],
        [second.id, 3],
      ].sort(),
    );
  });

  test('a requested item is kept as a special line and counts its lowest price toward the subtotal', async ({
    customerApi,
  }) => {
    const name = qaName('Halabi zaatar');
    const response = await customerApi.cart.addSpecial({
      name,
      description: '500 g bag',
      quantity: 2,
      minPrice: 10,
      maxPrice: 49,
    });
    expect(response.status()).toBe(201);
    const cart = await customerApi.cart.current();
    const special = cart.specialItems.find((item) => item.name === name);
    expect(special, 'The requested item is not in specialItems').toMatchObject({
      quantity: 2,
      minPrice: 10,
      maxPrice: 49,
    });
    expect(cart.items).toEqual([]);
    expect(sameMoney(cart.subTotal, 20), `Subtotal ${cart.subTotal}: expected 2 × the lowest price 10`).toBe(
      true,
    );
  });

  test('the cart is the same from a second session of the same customer', async ({
    api,
    customerApi,
    customerToken,
    playwright,
  }) => {
    const [product] = await purchasableProducts(api, 1);
    await customerApi.cart.seed([{ productId: product.id, quantity: 2 }]);
    const other = await playwright.request.newContext();
    try {
      const cart = await buildApi(other, customerToken).cart.current();
      expect(cart.items.map((i) => [i.product.id, i.quantity])).toEqual([[product.id, 2]]);
    } finally {
      await other.dispose();
    }
  });
});

test.describe(
  'Cart API: totals at the order thresholds (boundary values)',
  { tag: ['@cart', '@api', '@pricing'] },
  () => {
    test('VAT, delivery fee, COD fee and total follow the store rules for a small cart', async ({
      api,
      customerApi,
      storeInfo,
    }) => {
      const [product] = await purchasableProducts(api, 1);
      const cart = await customerApi.cart.seed([{ productId: product.id, quantity: 1 }]);
      const want = expectedTotals(cart.subTotal, storeInfo);
      expect(cart.vat).toBeCloseTo(want.vat, 2);
      expect(cart.deliveryFee).toBe(want.deliveryFee);
      expect(cart.codFee).toBe(storeInfo.codFee);
      expect(cart.minimumOrder).toBe(storeInfo.minOrderAmount);
      expect(cart.deliveryCutOff).toBe(storeInfo.deliveryCutOff);
      expect(cart.remainingToMinimum).toBeCloseTo(want.remainingToMinimum, 2);
      expect(sameMoney(cart.total, want.total), `Total ${cart.total}, expected ${want.total}`).toBe(true);
    });

    for (const [label, threshold, offset] of [
      ['one item below the minimum order', 'minOrderAmount', -1],
      ['exactly the minimum order', 'minOrderAmount', 0],
      ['one item below free delivery', 'deliveryCutOff', -1],
      ['exactly the free-delivery amount', 'deliveryCutOff', 0],
      ['one item above free delivery', 'deliveryCutOff', 1],
    ] as const) {
      test(`subtotal ${label}`, async ({ api, customerApi, storeInfo }) => {
        const { product, quantity } = await quantityForExactly(api, storeInfo[threshold]);
        const cart = await customerApi.cart.seed([{ productId: product.id, quantity: quantity + offset }]);
        const subTotal = round2(product.price * (quantity + offset));
        const want = expectedTotals(subTotal, storeInfo);
        expect(sameMoney(cart.subTotal, subTotal)).toBe(true);
        expect(cart.remainingToMinimum, 'Amount still needed to reach the minimum order').toBeCloseTo(
          want.remainingToMinimum,
          2,
        );
        expect(cart.deliveryFee, `Delivery fee at subtotal ${subTotal}`).toBe(want.deliveryFee);
        expect(sameMoney(cart.total, want.total), `Total ${cart.total}, expected ${want.total}`).toBe(true);
      });
    }
  },
);

test.describe('Cart API: invalid input is refused', { tag: ['@cart', '@api', '@negative'] }, () => {
  test('a negative quantity is refused with 400', async ({ api, customerApi }) => {
    const [product] = await purchasableProducts(api, 1);
    const response = await customerApi.cart.add(product.id, -1);
    expect(response.status()).toBe(400);
    expect(await errorMessage(response)).toContain('quantity must not be less than 0');
    expect((await customerApi.cart.current()).items).toEqual([]);
  });

  test('a quantity sent as text is refused with 400', async ({ api, customerApi }) => {
    const [product] = await purchasableProducts(api, 1);
    const response = await customerApi.cart.raw('POST', '/add', { productId: product.id, quantity: '2' });
    expect(response.status()).toBe(400);
    expect(await errorMessage(response)).toMatch(/quantity must be a number/);
  });

  test('a quantity of 0 does not add a line', async ({ api, customerApi }) => {
    knownBug('cart-zero-quantity-line');
    const [product] = await purchasableProducts(api, 1);
    const response = await customerApi.cart.add(product.id, 0);
    expect(response.status(), 'Adding 0 should be refused or do nothing').toBeLessThan(500);
    expect((await customerApi.cart.current()).items).toEqual([]);
  });

  test('a fractional quantity is refused with 400 when adding', async ({ api, customerApi }) => {
    knownBug('cart-fractional-quantity-500');
    const [product] = await purchasableProducts(api, 1);
    expect((await customerApi.cart.add(product.id, 1.5)).status()).toBe(400);
  });

  test('a fractional quantity is refused with 400 when updating', async ({ api, customerApi }) => {
    knownBug('cart-fractional-quantity-500');
    const [product] = await purchasableProducts(api, 1);
    await customerApi.cart.seed([{ productId: product.id, quantity: 1 }]);
    expect((await customerApi.cart.update(product.id, 1.5)).status()).toBe(400);
  });

  // There is no maximum quantity per product (confirmed by the store owner 2026-11-20): large orders are fine,
  // so the check is that they are priced exactly, with no rounding drift.
  test(
    'a large quantity (9999) is accepted and priced exactly',
    { tag: '@pricing' },
    async ({ api, customerApi, storeInfo }) => {
      const [product] = await purchasableProducts(api, 1);
      await customerApi.cart.seed([{ productId: product.id, quantity: 1 }]);
      expect((await customerApi.cart.update(product.id, 9999)).status()).toBe(200);
      const cart = await customerApi.cart.current();
      expect(line(cart, product)?.quantity).toBe(9999);
      const want = expectedTotals(round2(product.price * 9999), storeInfo);
      expect(
        sameMoney(cart.subTotal, want.subTotal),
        `subtotal ${cart.subTotal}, expected ${want.subTotal}`,
      ).toBe(true);
      expect(sameMoney(cart.vat, want.vat), `VAT ${cart.vat}, expected ${want.vat}`).toBe(true);
      expect(cart.deliveryFee).toBe(0);
    },
  );

  test(
    'an out-of-stock product cannot be put in the cart by add, bulk add or update',
    { tag: '@stock' },
    async ({ api, customerApi }) => {
      knownBug('cart-accepts-out-of-stock');
      const product = await outOfStockProduct(api);
      const statuses = [
        (await customerApi.cart.add(product.id, 1)).status(),
        (await customerApi.cart.addBulk([{ productId: product.id, quantity: 1 }])).status(),
        (await customerApi.cart.update(product.id, 2)).status(),
      ];
      const cart = await customerApi.cart.current();
      expect(
        line(cart, product),
        `"${product.name}" is out of stock but landed in the cart (answers ${statuses.join(', ')})`,
      ).toBeUndefined();
      for (const status of statuses) expect(status, 'Expected a 4xx refusal').toBeGreaterThanOrEqual(400);
    },
  );

  test(
    'a price sent with the product is ignored: the line keeps the store price',
    { tag: '@security' },
    async ({ api, customerApi }) => {
      const [product] = await purchasableProducts(api, 1);
      const tampered = { price: 0.01, lineTotal: 0.01, compareAtPrice: 0.01, discount: product.price };
      const added = await customerApi.cart.raw('POST', '/add', {
        productId: product.id,
        quantity: 1,
        ...tampered,
      });
      expect(added.status(), 'Extra fields should be ignored or refused, never crash').toBeLessThan(500);
      await customerApi.cart.raw('PATCH', '/update', { productId: product.id, quantity: 2, ...tampered });

      const cart = await customerApi.cart.current();
      const item = line(cart, product);
      test.skip(!item, 'The API refused the extra fields, so nothing reached the cart');
      expect(item!.price).toBe(product.price);
      expect(
        sameMoney(item!.lineTotal, round2(product.price * item!.quantity)),
        `line total ${item!.lineTotal}`,
      ).toBe(true);
      expect(cart.discount).toBe(0);
    },
  );

  test('a product that does not exist is refused with 404', async ({ customerApi }) => {
    const response = await customerApi.cart.add(MISSING_ID, 1);
    expect(response.status()).toBe(404);
    expect(await errorMessage(response)).toBe('Products not found');
  });

  test('a product id that is not a UUID is refused with 400', async ({ customerApi }) => {
    knownBug('cart-malformed-product-id-500');
    expect((await customerApi.cart.add('not-a-uuid', 1)).status()).toBe(400);
  });

  test('a body without a product is refused with 400', async ({ customerApi }) => {
    const missingProduct = await customerApi.cart.raw('POST', '/add', { quantity: 1 });
    expect(missingProduct.status()).toBe(400);
    expect(await errorMessage(missingProduct)).toBe('Please provide product id or name');
    const empty = await customerApi.cart.raw('POST', '/add', {});
    expect(empty.status()).toBe(400);
  });

  test('updating with a negative quantity or an unknown product is refused', async ({ api, customerApi }) => {
    const [product] = await purchasableProducts(api, 1);
    await customerApi.cart.seed([{ productId: product.id, quantity: 2 }]);
    expect((await customerApi.cart.update(product.id, -3)).status()).toBe(400);
    expect((await customerApi.cart.update(MISSING_ID, 2)).status()).toBe(404);
    // Nothing changed.
    expect((await customerApi.cart.current()).items.map((i) => i.quantity)).toEqual([2]);
  });

  test('removing a line that is not in the cart answers 404', async ({ customerApi }) => {
    knownBug('cart-delete-missing-line-200');
    expect((await customerApi.cart.remove(MISSING_ID)).status()).toBe(404);
  });

  test('a requested item without a name is refused with 400', async ({ customerApi }) => {
    const response = await customerApi.cart.addSpecial({
      name: '',
      description: 'x',
      quantity: 1,
      minPrice: 10,
      maxPrice: 49,
    });
    expect(response.status()).toBe(400);
  });

  test('a requested item with its lowest price above its highest price is refused', async ({
    customerApi,
  }) => {
    knownBug('special-item-price-range-not-validated');
    const response = await customerApi.cart.addSpecial({
      name: qaName('Backwards range'),
      description: 'x',
      quantity: 1,
      minPrice: 49,
      maxPrice: 10,
    });
    expect(response.status()).toBe(400);
  });

  test('a requested item with a negative price is refused', async ({ customerApi }) => {
    knownBug('special-item-price-range-not-validated');
    const response = await customerApi.cart.addSpecial({
      name: qaName('Negative price'),
      description: 'x',
      quantity: 1,
      minPrice: -5,
      maxPrice: 10,
    });
    expect(response.status()).toBe(400);
  });

  test(
    'text that looks like code or SQL is stored as plain text',
    { tag: '@security' },
    async ({ customerApi }) => {
      for (const value of Object.values(HOSTILE_STRINGS)) {
        const name = `${value} ${qaName('x')}`;
        const response = await customerApi.cart.addSpecial({
          name,
          description: value,
          quantity: 1,
          minPrice: 10,
          maxPrice: 49,
        });
        expect(response.status(), `Adding "${value}" answered ${response.status()}`).toBe(201);
        const stored = (await customerApi.cart.current()).specialItems.find((item) => item.name === name);
        expect(stored?.name, 'The name came back changed').toBe(name);
      }
    },
  );
});

test.describe('Cart API: permissions', { tag: ['@cart', '@api', '@security'] }, () => {
  test('a guest cannot read or change any cart', async ({ api }) => {
    const [product] = await purchasableProducts(api, 1);
    const calls = [
      api.cart.getCart(),
      api.cart.add(product.id, 1),
      api.cart.update(product.id, 2),
      api.cart.remove(MISSING_ID),
      api.cart.clear(),
      api.cart.addBulk([{ productId: product.id, quantity: 1 }]),
      api.cart.checkout({ consentForSimilarProducts: 'false', paymentMethod: 'cod' }),
      api.cart.copyOrder(MISSING_ID),
    ];
    for (const response of await Promise.all(calls)) {
      expect(response.status(), `${response.url()} without a token`).toBe(401);
      expect(await errorMessage(response)).toBe('Authentication token is required');
    }
  });

  test('a made-up token is refused', async ({ playwright }) => {
    const context = await playwright.request.newContext();
    try {
      const response = await buildApi(context, 'not.a.real.token').cart.getCart();
      expect(response.status()).toBe(401);
      expect(await errorMessage(response)).toBe('Invalid or expired token');
    } finally {
      await context.dispose();
    }
  });
});

test.describe('Coupons API', { tag: ['@cart', '@api', '@pricing'] }, () => {
  // POST /coupons/apply allows 10 calls per customer per minute, refused calls included (measured
  // 2026-11-26). This block makes 15 in a few seconds, so every call waits out a 429 (about a minute).
  test.describe.configure({ timeout: CHECKOUT_TEST_TIMEOUT });
  const couponCode = env.testData.couponCode;
  const apply = (customerApi: Api, code: string) => retryOn429(() => customerApi.coupons.apply(code));

  test('the customer coupon list is a list', async ({ customerApi }) => {
    const response = await customerApi.coupons.list();
    expect(response.status()).toBe(200);
    expect(Array.isArray(await response.json())).toBe(true);
  });

  test(
    'applying a code that does not exist is refused with 404 and the cart is unchanged',
    { tag: '@negative' },
    async ({ api, customerApi }) => {
      const [product] = await purchasableProducts(api, 1);
      const before = await customerApi.cart.seed([{ productId: product.id, quantity: 2 }]);
      const response = await apply(customerApi, 'NOPE-DOES-NOT-EXIST-1');
      expect(response.status()).toBe(404);
      expect(await errorMessage(response)).toBe('Coupon not found');
      const after = await customerApi.cart.current();
      expect(after.appliedCoupons).toEqual([]);
      expect(after.total).toBe(before.total);
    },
  );

  test(
    'coupon errors use the same error shape as the rest of the API',
    { tag: '@negative' },
    async ({ customerApi }) => {
      knownBug('coupon-error-shape');
      const body = await (await apply(customerApi, 'NOPE-DOES-NOT-EXIST-2')).json();
      expect(body).toMatchObject({ statusCode: 404, error: 'Not Found' });
    },
  );

  for (const [label, body] of [
    ['an empty code', { code: '' }],
    ['no code', {}],
    ['a code that is not text', { code: 12345 }],
  ] as const) {
    test(`applying ${label} is refused with 400`, { tag: '@negative' }, async ({ customerApi }) => {
      const response = await retryOn429(() => customerApi.coupons.raw('POST', '/apply', body));
      expect(response.status()).toBe(400);
    });
  }

  test(
    'a code that looks like SQL is treated as an unknown code, not an error',
    { tag: ['@negative', '@security'] },
    async ({ api, customerApi }) => {
      const [product] = await purchasableProducts(api, 1);
      await customerApi.cart.seed([{ productId: product.id, quantity: 1 }]);
      const response = await apply(customerApi, HOSTILE_STRINGS.sql);
      expect(response.status()).toBe(404);
      expect(await errorMessage(response)).toBe('Coupon not found');
    },
  );

  test('a coupon cannot be applied to an empty cart', { tag: '@negative' }, async ({ customerApi }) => {
    const response = await apply(customerApi, 'ANY-CODE');
    expect(response.status()).toBe(400);
    expect(await errorMessage(response)).toBe('Cart is empty');
  });

  test(
    'saving an unknown code to the account is refused with 404',
    { tag: '@negative' },
    async ({ customerApi }) => {
      expect((await customerApi.coupons.claim('NOPE-DOES-NOT-EXIST-3')).status()).toBe(404);
    },
  );

  test('a guest cannot list, save, apply or remove coupons', { tag: '@security' }, async ({ api }) => {
    for (const response of await Promise.all([
      api.coupons.list(),
      api.coupons.claim('X'),
      api.coupons.apply('X'),
      api.coupons.remove('X'),
    ])) {
      expect(response.status(), response.url()).toBe(401);
    }
  });

  /** Applies the test coupon and returns the cart; fails with the API's reason when it is refused. */
  async function applyTestCoupon(customerApi: Api): Promise<Cart> {
    const applied = await apply(customerApi, couponCode);
    expect(applied.ok(), `${couponCode} was refused: ${await errorMessage(applied)}`).toBe(true);
    return customerApi.cart.current();
  }

  /** The share the applied test coupon takes off, e.g. 0.1 for 10%. Read from the cart, not assumed. */
  function couponRate(cart: Cart): number {
    const coupon = cart.appliedCoupons.find((c) => c.code === couponCode);
    expect(coupon?.discountType, `${couponCode} is not a percentage coupon`).toBe('percentage');
    return (coupon?.discountValue ?? 0) / 100;
  }

  test(`${couponCode} takes its percentage off the subtotal, VAT is charged on what is left, and removing it restores the total`, async ({
    api,
    customerApi,
    storeInfo,
  }) => {
    // Well above the free-delivery line, so the delivery fee stays 0 and only the coupon moves the total.
    const { product, quantity } = await quantityForExactly(api, storeInfo.deliveryCutOff + 100);
    const before = await customerApi.cart.seed([{ productId: product.id, quantity }]);
    const cart = await applyTestCoupon(customerApi);

    expect(cart.appliedCoupons).toHaveLength(1);
    const [coupon] = cart.appliedCoupons;
    expect(coupon.code).toBe(couponCode);
    const saving = round2(before.subTotal * couponRate(cart));
    expect(sameMoney(coupon.amount, saving), `saving ${coupon.amount}, expected ${saving}`).toBe(true);
    // The saving is reported as promotionDiscount and already taken off the subtotal.
    expect(sameMoney(cart.promotionDiscount, saving)).toBe(true);
    const want = expectedTotals(round2(before.subTotal - saving), storeInfo);
    expect(
      sameMoney(cart.subTotal, want.subTotal),
      `subtotal ${cart.subTotal}, expected ${want.subTotal}`,
    ).toBe(true);
    expect(
      sameMoney(cart.vat, want.vat),
      `VAT ${cart.vat}, expected ${want.vat} (5% of the lowered subtotal)`,
    ).toBe(true);
    expect(sameMoney(cart.total, want.total), `total ${cart.total}, expected ${want.total}`).toBe(true);

    expect((await customerApi.coupons.remove(couponCode)).ok()).toBe(true);
    const removed = await customerApi.cart.current();
    expect(removed.appliedCoupons).toEqual([]);
    expect(removed.promotionDiscount).toBe(0);
    expect(removed.total).toBe(before.total);
  });

  test(`applying ${couponCode} twice counts it once`, async ({ api, customerApi, storeInfo }) => {
    const { product, quantity } = await quantityForExactly(api, storeInfo.deliveryCutOff + 100);
    await customerApi.cart.seed([{ productId: product.id, quantity }]);
    const once = await applyTestCoupon(customerApi);
    const twice = await applyTestCoupon(customerApi);
    expect(twice.appliedCoupons).toHaveLength(1);
    expect(twice.total).toBe(once.total);
  });

  test('the coupon saving follows the cart when products are added', async ({ api, customerApi }) => {
    knownBug('coupon-saving-rounded-per-unit');
    const [first, second] = await purchasableProducts(api, 2);
    await customerApi.cart.seed([{ productId: first.id, quantity: 2 }]);
    const rate = couponRate(await applyTestCoupon(customerApi));
    await customerApi.cart.add(second.id, 3);
    const cart = await customerApi.cart.current();
    const full = round2(first.price * 2 + second.price * 3);
    expect(cart.appliedCoupons, 'The coupon fell off when the cart changed').toHaveLength(1);
    expect(
      sameMoney(cart.appliedCoupons[0].amount, round2(full * rate)),
      `saving ${cart.appliedCoupons[0].amount} on ${full}`,
    ).toBe(true);
    expect(sameMoney(cart.subTotal, round2(full - round2(full * rate)))).toBe(true);
  });

  // The free-delivery line and the minimum order are judged on the subtotal after the coupon (seen 2026-11-20).
  // At exactly the line, a 10% coupon saves 20 but brings the 20 delivery fee back: the shopper pays 1 less.
  test(
    'a coupon that takes the subtotal under the free-delivery line brings the delivery fee back',
    { tag: '@boundary' },
    async ({ api, customerApi, storeInfo }) => {
      knownBug('coupon-saving-rounded-per-unit');
      const { product, quantity } = await quantityForExactly(api, storeInfo.deliveryCutOff);
      const before = await customerApi.cart.seed([{ productId: product.id, quantity }]);
      expect(before.deliveryFee).toBe(0);
      const cart = await applyTestCoupon(customerApi);
      const want = expectedTotals(round2(storeInfo.deliveryCutOff * (1 - couponRate(cart))), storeInfo);
      expect(cart.deliveryFee).toBe(storeInfo.deliveryFee);
      expect(sameMoney(cart.total, want.total), `total ${cart.total}, expected ${want.total}`).toBe(true);
    },
  );

  test(
    'a coupon that takes the subtotal under the minimum order blocks checkout until more is added',
    { tag: '@boundary' },
    async ({ api, customerApi, storeInfo }) => {
      knownBug('coupon-saving-rounded-per-unit');
      const { product, quantity } = await quantityForExactly(api, storeInfo.minOrderAmount);
      const before = await customerApi.cart.seed([{ productId: product.id, quantity }]);
      expect(before.remainingToMinimum).toBe(0);
      const cart = await applyTestCoupon(customerApi);
      const lowered = round2(storeInfo.minOrderAmount * (1 - couponRate(cart)));
      expect(sameMoney(cart.subTotal, lowered)).toBe(true);
      expect(
        sameMoney(cart.remainingToMinimum, round2(storeInfo.minOrderAmount - lowered)),
        `remaining ${cart.remainingToMinimum}`,
      ).toBe(true);
    },
  );

  test(
    'coupon codes must be typed in capitals: a lowercase code is not found',
    { tag: '@negative' },
    async ({ api, customerApi }) => {
      const [product] = await purchasableProducts(api, 1);
      await customerApi.cart.seed([{ productId: product.id, quantity: 2 }]);
      const response = await apply(customerApi, couponCode.toLowerCase());
      expect(response.status()).toBe(404);
      expect((await customerApi.cart.current()).appliedCoupons).toEqual([]);
    },
  );

  test('emptying the cart drops the coupon', async ({ api, customerApi }) => {
    const [product] = await purchasableProducts(api, 1);
    await customerApi.cart.seed([{ productId: product.id, quantity: 2 }]);
    await applyTestCoupon(customerApi);
    await json(customerApi.cart.clear());
    await customerApi.cart.add(product.id, 1);
    expect((await customerApi.cart.current()).appliedCoupons).toEqual([]);
  });
});
