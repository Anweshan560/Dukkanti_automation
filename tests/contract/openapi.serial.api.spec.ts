/**
 * Contract check: what the storefront API really returns, against the backend's own OpenAPI spec
 * (GET /v1/api-json, fetched at run time).
 *
 * A mismatch means the spec and the backend disagree. Either may be wrong, but anyone building on the
 * spec (the mobile app, a new client, generated types) would break. Admin endpoints are out of scope.
 *
 * Customer project: half of these endpoints need the signed-in test customer. Read-only.
 */
import { json, type Api, type OrderSummary, type Page, type Product } from '../../api';
import { env } from '../../config/env';
import { expect, test } from '../../fixtures/test';
import { knownBug } from '../../utils/knownBug';
import { ContractChecker, fetchSpec } from '../../utils/openapi';

let contract: ContractChecker;

test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext();
  contract = new ContractChecker(await fetchSpec(request, env.apiUrl));
  await request.dispose();
});

/** Every endpoint the storefront and these tests call, as the spec should list it. */
const STOREFRONT_ENDPOINTS = [
  'GET /v1/info',
  'GET /v1/categories',
  'GET /v1/brands',
  'GET /v1/countries',
  'GET /v1/baskets',
  'GET /v1/promotions',
  'GET /v1/products',
  'GET /v1/products/slug/{slug}',
  'GET /v1/products/{id}',
  'GET /v1/products/{id}/similar',
  'POST /v1/users/request-otp',
  'POST /v1/users/login',
  'GET /v1/users/me',
  'PATCH /v1/users/profile',
  'GET /v1/users/addresses',
  'POST /v1/users/address',
  'PATCH /v1/users/address/{addressId}',
  'DELETE /v1/users/address/{addressId}',
  'GET /v1/cart',
  'POST /v1/cart/add',
  'POST /v1/cart/add/bulk',
  'PATCH /v1/cart/update',
  'DELETE /v1/cart/clear',
  'DELETE /v1/cart/{itemId}',
  'POST /v1/cart/checkout',
  'POST /v1/cart/copy-order',
  'GET /v1/coupons',
  'POST /v1/coupons',
  'POST /v1/coupons/apply',
  'POST /v1/coupons/remove',
  'GET /v1/wishlist',
  'POST /v1/wishlist/add',
  'DELETE /v1/wishlist/{itemId}',
  'GET /v1/orders',
  'GET /v1/orders/{id}',
  'POST /v1/payment/customer-session',
  'POST /v1/payment/orders/{orderId}/confirm',
  'POST /v1/forms/contact',
  'POST /v1/forms/business',
];

test.describe('OpenAPI contract', { tag: ['@api', '@contract'] }, () => {
  test('the spec documents every endpoint the storefront calls', async () => {
    knownBug('openapi-baskets-undocumented');
    const missing = STOREFRONT_ENDPOINTS.filter((endpoint) => {
      const [method, path] = endpoint.split(' ');
      return !contract.operation(method, path);
    });
    expect(missing, 'Called by the storefront but not in the spec').toEqual([]);
  });

  test('endpoints that need a signed-in user are marked as such in the spec', async ({ api }) => {
    // Checked live: each of these answers 401 without a token. The spec should say "bearer" for them.
    const unmarked: string[] = [];
    for (const [method, path, call] of [
      ['GET', '/v1/cart', () => api.cart.getCart()],
      ['GET', '/v1/orders', () => api.orders.list({ page: 1, limit: 10 })],
      ['GET', '/v1/users/me', () => api.users.me()],
      ['GET', '/v1/wishlist', () => api.wishlist.getWishlist()],
      ['GET', '/v1/coupons', () => api.coupons.list()],
      ['GET', '/v1/users/addresses', () => api.users.listAddresses()],
    ] as const) {
      const response = await call();
      expect(response.status(), `${method} ${path} without a token`).toBe(401);
      if (!contract.operation(method, path)?.security?.length) unmarked.push(`${method} ${path}`);
    }
    expect(unmarked, 'Need a token but the spec does not say so').toEqual([]);
  });
});

test.describe('Responses match the spec: public endpoints', { tag: ['@api', '@contract'] }, () => {
  const simple: [string, string, (api: Api) => Promise<import('@playwright/test').APIResponse>][] = [
    ['/v1/info', 'info', (api) => api.info.getInfo()],
    ['/v1/categories', 'categories', (api) => api.categories.list()],
    ['/v1/brands', 'brands', (api) => api.brands.list()],
    ['/v1/countries', 'countries', (api) => api.countries.list()],
    ['/v1/promotions', 'promotions', (api) => api.promotions.list()],
    ['/v1/products', 'products', (api) => api.products.list({ limit: 50 })],
  ];

  for (const [path, name, call] of simple) {
    test(`GET ${path}`, async ({ api }) => {
      if (['brands', 'promotions', 'products'].includes(name)) knownBug('openapi-response-schemas-wrong');
      const response = await call(api);
      expect(response.status()).toBe(200);
      const body = await response.json();
      // The spec types campaignOffer.minimumSubtotal as an object; the API sends a number. Only seen while a
      // campaign with a minimum subtotal is running, so mark it only then.
      if (name === 'info' && typeof body?.campaignOffer?.minimumSubtotal === 'number') {
        knownBug('openapi-response-schemas-wrong');
      }
      expect(contract.check('get', path, 200, body), `GET ${path} differs from the spec`).toEqual([]);
    });
  }

  test('GET /v1/products/{id} and /v1/products/slug/{slug}', async ({ api }) => {
    const [product] = (await json<Page<Product>>(api.products.list({ limit: 1 }))).data;
    const byId = await api.products.getById(product.id);
    const bySlug = await api.products.getBySlug(product.slugEn);
    expect.soft(contract.check('get', '/v1/products/{id}', 200, await byId.json()), 'by id').toEqual([]);
    expect
      .soft(contract.check('get', '/v1/products/slug/{slug}', 200, await bySlug.json()), 'by slug')
      .toEqual([]);
  });

  test('an unknown product answers a status the spec documents', { tag: '@negative' }, async ({ api }) => {
    const response = await api.products.getById('00000000-0000-4000-8000-000000000000');
    expect(response.status()).toBe(404);
    knownBug('openapi-error-responses-undocumented');
    expect(contract.documentedStatuses('get', '/v1/products/{id}')).toContain('404');
  });
});

test.describe('Responses match the spec: signed-in endpoints', { tag: ['@api', '@contract'] }, () => {
  const simple: [string, (api: Api) => Promise<import('@playwright/test').APIResponse>][] = [
    ['/v1/users/me', (api) => api.users.me()],
    ['/v1/users/addresses', (api) => api.users.listAddresses()],
    ['/v1/cart', (api) => api.cart.getCart()],
    ['/v1/wishlist', (api) => api.wishlist.getWishlist()],
    ['/v1/coupons', (api) => api.coupons.list()],
    ['/v1/orders', (api) => api.orders.list({ page: 1, limit: 10 })],
  ];

  for (const [path, call] of simple) {
    test(`GET ${path}`, async ({ customerApi }) => {
      if (['/v1/users/addresses', '/v1/cart', '/v1/orders'].includes(path))
        knownBug('openapi-response-schemas-wrong');
      const response = await call(customerApi);
      expect(response.status()).toBe(200);
      expect(
        contract.check('get', path, 200, await response.json()),
        `GET ${path} differs from the spec`,
      ).toEqual([]);
    });
  }

  test('GET /v1/orders/{id}', async ({ customerApi }) => {
    const orders = await json<Page<OrderSummary>>(customerApi.orders.list({ page: 1, limit: 10 }));
    test.skip(!orders.data.length, 'The test customer has no orders yet');
    knownBug('openapi-response-schemas-wrong');
    const response = await customerApi.orders.getById(orders.data[0].id);
    expect(response.status()).toBe(200);
    expect(contract.check('get', '/v1/orders/{id}', 200, await response.json())).toEqual([]);
  });
});
