/**
 * Cart API: positive, boundary, negative and permission tests.
 *
 * Runs in the `customer` project (one test at a time): every test changes the shared customer's cart.
 * Each test starts from an empty cart and empties it again afterwards.
 */
import { buildApi, errorMessage, json, type Cart, type Product } from '../../api';
import { expect, test } from '../../fixtures/test';
import { sameMoney } from '../../utils/dom';
import { knownBug } from '../../utils/knownBug';
import { expectedTotals, HOSTILE_STRINGS, MISSING_ID, purchasableProducts, quantityForExactly, round2 } from '../../utils/shop';
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
  test('adding a product creates one line at the product price', { tag: '@smoke' }, async ({ api, customerApi }) => {
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
    expect((await customerApi.cart.current()).items.map((i) => [i.product.id, i.quantity])).toEqual([[product.id, 2]]);
  });

  test('adding the same product again adds to the quantity instead of making a second line', async ({ api, customerApi }) => {
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
    await json(customerApi.cart.addSpecial({ name: qaName('Nabulsi cheese'), description: 'test', quantity: 1, minPrice: 10, maxPrice: 49 }));
    const response = await customerApi.cart.clear();
    expect(response.ok()).toBe(true);
    const cart = await customerApi.cart.current();
    expect(cart.items).toEqual([]);
    expect(cart.specialItems).toEqual([]);
    expect(cart.subTotal ?? 0).toBe(0);
  });

  test('the subtotal is the sum of every line', async ({ api, customerApi }) => {
    const products = await purchasableProducts(api, 3);
    const cart = await customerApi.cart.seed(products.map((p, index) => ({ productId: p.id, quantity: index + 1 })));
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

  test('a requested item is kept as a special line and counts its lowest price toward the subtotal', async ({ customerApi }) => {
    const name = qaName('Halabi zaatar');
    const response = await customerApi.cart.addSpecial({ name, description: '500 g bag', quantity: 2, minPrice: 10, maxPrice: 49 });
    expect(response.status()).toBe(201);
    const cart = await customerApi.cart.current();
    const special = cart.specialItems.find((item) => item.name === name);
    expect(special, 'The requested item is not in specialItems').toMatchObject({ quantity: 2, minPrice: 10, maxPrice: 49 });
    expect(cart.items).toEqual([]);
    expect(sameMoney(cart.subTotal, 20), `Subtotal ${cart.subTotal}: expected 2 × the lowest price 10`).toBe(true);
  });

  test('the cart is the same from a second session of the same customer', async ({ api, customerApi, customerToken, playwright }) => {
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

test.describe('Cart API: totals at the order thresholds (boundary values)', { tag: ['@cart', '@api', '@pricing'] }, () => {
  test('VAT, delivery fee, COD fee and total follow the store rules for a small cart', async ({ api, customerApi, storeInfo }) => {
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
      expect(cart.remainingToMinimum, 'Amount still needed to reach the minimum order').toBeCloseTo(want.remainingToMinimum, 2);
      expect(cart.deliveryFee, `Delivery fee at subtotal ${subTotal}`).toBe(want.deliveryFee);
      expect(sameMoney(cart.total, want.total), `Total ${cart.total}, expected ${want.total}`).toBe(true);
    });
  }
});

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

  test('an absurd quantity (9999) is refused', async ({ api, customerApi }) => {
    knownBug('cart-no-quantity-limit');
    const [product] = await purchasableProducts(api, 1);
    await customerApi.cart.seed([{ productId: product.id, quantity: 1 }]);
    expect((await customerApi.cart.update(product.id, 9999)).status(), 'The cart accepted 9999 of one product').toBe(400);
  });

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
    const response = await customerApi.cart.addSpecial({ name: '', description: 'x', quantity: 1, minPrice: 10, maxPrice: 49 });
    expect(response.status()).toBe(400);
  });

  test('a requested item with its lowest price above its highest price is refused', async ({ customerApi }) => {
    knownBug('special-item-price-range-not-validated');
    const response = await customerApi.cart.addSpecial({ name: qaName('Backwards range'), description: 'x', quantity: 1, minPrice: 49, maxPrice: 10 });
    expect(response.status()).toBe(400);
  });

  test('a requested item with a negative price is refused', async ({ customerApi }) => {
    knownBug('special-item-price-range-not-validated');
    const response = await customerApi.cart.addSpecial({ name: qaName('Negative price'), description: 'x', quantity: 1, minPrice: -5, maxPrice: 10 });
    expect(response.status()).toBe(400);
  });

  test('text that looks like code or SQL is stored as plain text', { tag: '@security' }, async ({ customerApi }) => {
    for (const value of Object.values(HOSTILE_STRINGS)) {
      const name = `${value} ${qaName('x')}`;
      const response = await customerApi.cart.addSpecial({ name, description: value, quantity: 1, minPrice: 10, maxPrice: 49 });
      expect(response.status(), `Adding "${value}" answered ${response.status()}`).toBe(201);
      const stored = (await customerApi.cart.current()).specialItems.find((item) => item.name === name);
      expect(stored?.name, 'The name came back changed').toBe(name);
    }
  });
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
  const couponCode = process.env.TEST_COUPON_CODE?.trim();

  test('the customer coupon list is a list', async ({ customerApi }) => {
    const response = await customerApi.coupons.list();
    expect(response.status()).toBe(200);
    expect(Array.isArray(await response.json())).toBe(true);
  });

  test('applying a code that does not exist is refused with 404 and the cart is unchanged', { tag: '@negative' }, async ({ api, customerApi }) => {
    const [product] = await purchasableProducts(api, 1);
    const before = await customerApi.cart.seed([{ productId: product.id, quantity: 2 }]);
    const response = await customerApi.coupons.apply('NOPE-DOES-NOT-EXIST-1');
    expect(response.status()).toBe(404);
    expect(await errorMessage(response)).toBe('Coupon not found');
    const after = await customerApi.cart.current();
    expect(after.appliedCoupons).toEqual([]);
    expect(after.total).toBe(before.total);
  });

  test('coupon errors use the same error shape as the rest of the API', { tag: '@negative' }, async ({ customerApi }) => {
    knownBug('coupon-error-shape');
    const body = await (await customerApi.coupons.apply('NOPE-DOES-NOT-EXIST-2')).json();
    expect(body).toMatchObject({ statusCode: 404, error: 'Not Found' });
  });

  for (const [label, body] of [
    ['an empty code', { code: '' }],
    ['no code', {}],
    ['a code that is not text', { code: 12345 }],
  ] as const) {
    test(`applying ${label} is refused with 400`, { tag: '@negative' }, async ({ customerApi }) => {
      const response = await customerApi.coupons.raw('POST', '/apply', body);
      expect(response.status()).toBe(400);
    });
  }

  test('a code that looks like SQL is treated as an unknown code, not an error', { tag: ['@negative', '@security'] }, async ({ api, customerApi }) => {
    const [product] = await purchasableProducts(api, 1);
    await customerApi.cart.seed([{ productId: product.id, quantity: 1 }]);
    const response = await customerApi.coupons.apply(HOSTILE_STRINGS.sql);
    expect(response.status()).toBe(404);
    expect(await errorMessage(response)).toBe('Coupon not found');
  });

  test('a coupon cannot be applied to an empty cart', { tag: '@negative' }, async ({ customerApi }) => {
    const response = await customerApi.coupons.apply('ANY-CODE');
    expect(response.status()).toBe(400);
    expect(await errorMessage(response)).toBe('Cart is empty');
  });

  test('saving an unknown code to the account is refused with 404', { tag: '@negative' }, async ({ customerApi }) => {
    expect((await customerApi.coupons.claim('NOPE-DOES-NOT-EXIST-3')).status()).toBe(404);
  });

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

  test('a valid coupon lowers the total and removing it restores the total', async ({ api, customerApi, storeInfo }) => {
    test.skip(!couponCode, 'Set TEST_COUPON_CODE in .env to a coupon that works on dev (tests cannot create coupons).');
    const { product, quantity } = await quantityForExactly(api, storeInfo.deliveryCutOff);
    const before = await customerApi.cart.seed([{ productId: product.id, quantity }]);
    const applied = await customerApi.coupons.apply(couponCode as string);
    expect(applied.ok(), await errorMessage(applied)).toBe(true);
    const withCoupon = await customerApi.cart.current();
    expect(withCoupon.appliedCoupons.length).toBe(1);
    expect(withCoupon.discount).toBeGreaterThan(0);
    expect(withCoupon.total).toBeLessThan(before.total);
    // Applying it twice does not double the discount.
    await customerApi.coupons.apply(couponCode as string);
    expect((await customerApi.cart.current()).discount).toBe(withCoupon.discount);
    expect((await customerApi.coupons.remove(couponCode as string)).ok()).toBe(true);
    const removed = await customerApi.cart.current();
    expect(removed.discount).toBe(0);
    expect(removed.total).toBe(before.total);
  });
});
