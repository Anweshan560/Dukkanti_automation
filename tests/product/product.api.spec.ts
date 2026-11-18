/**
 * Product lookup API: by id, by English and Arabic slug, similar products, and refused lookups.
 * Read-only, so it runs in parallel in the `api` project.
 */
import { errorMessage, json, type Page, type Product } from '../../api';
import { expect, test } from '../../fixtures/test';
import { knownBug } from '../../utils/knownBug';
import { MISSING_ID } from '../../utils/shop';

const firstProducts = async (api: import('../../api').Api, limit = 20): Promise<Product[]> =>
  (await json<Page<Product>>(api.products.list({ limit }))).data;

test.describe('Product API', { tag: ['@product', '@api'] }, () => {
  test('a product is the same by id, by English slug and by Arabic slug', async ({ api }) => {
    const [listed] = await firstProducts(api, 1);
    const byId = await json<Product>(api.products.getById(listed.id));
    const bySlug = await json<Product>(api.products.getBySlug(listed.slugEn));
    const byArabicSlug = await json<Product>(api.products.getBySlug(listed.slugAr));
    for (const found of [byId, bySlug, byArabicSlug]) {
      expect(found.id).toBe(listed.id);
      expect(found.name).toBe(listed.name);
      expect(found.price).toBe(listed.price);
    }
  });

  test('every product in the list has what the product page needs', async ({ api }) => {
    for (const product of await firstProducts(api, 50)) {
      expect.soft(product.name?.trim(), `${product.id}: name`).toBeTruthy();
      expect.soft(product.nameAr?.trim(), `${product.name}: Arabic name`).toBeTruthy();
      expect.soft(product.slugEn, `${product.name}: slug`).toMatch(/^[a-z0-9-]+$/);
      expect.soft(product.price, `${product.name}: price`).toBeGreaterThan(0);
      expect.soft(product.images?.length, `${product.name}: images`).toBeGreaterThan(0);
      if (product.compareAtPrice !== null) {
        expect.soft(product.compareAtPrice, `${product.name}: old price must be above the price`).toBeGreaterThan(product.price);
      }
    }
  });

  test('slugs are unique', async ({ api }) => {
    const products = await firstProducts(api, 200);
    const seen = new Map<string, string>();
    for (const product of products) {
      expect.soft(seen.get(product.slugEn), `Slug "${product.slugEn}" is used twice`).toBeUndefined();
      seen.set(product.slugEn, product.id);
    }
  });

  test('similar products never include the product itself', async ({ api }) => {
    const [product] = await firstProducts(api, 1);
    const response = await api.products.similar(product.id, 10);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as Product[] | Page<Product>;
    const similar = Array.isArray(body) ? body : body.data;
    expect(similar.length).toBeGreaterThan(0);
    expect(similar.length).toBeLessThanOrEqual(10);
    expect(similar.map((p) => p.id)).not.toContain(product.id);
  });

  test('an unknown slug answers 404 "Product not found"', { tag: '@negative' }, async ({ api }) => {
    const response = await api.products.getBySlug('this-product-does-not-exist-qa');
    expect(response.status()).toBe(404);
    expect(await errorMessage(response)).toBe('Product not found');
  });

  test('an unknown product id answers 404', { tag: '@negative' }, async ({ api }) => {
    expect((await api.products.getById(MISSING_ID)).status()).toBe(404);
  });

  test('a product id that is not a UUID answers 400 or 404, not 500', { tag: '@negative' }, async ({ api }) => {
    knownBug('products-invalid-id-500');
    expect((await api.products.getById('not-a-uuid')).status()).toBeLessThan(500);
  });

  test('similar products of an unknown product answer 404', { tag: '@negative' }, async ({ api }) => {
    expect((await api.products.similar(MISSING_ID)).status()).toBeGreaterThanOrEqual(400);
    expect((await api.products.similar(MISSING_ID)).status()).toBeLessThan(500);
  });

  test('a slug with SQL or script in it is just not found', { tag: ['@negative', '@security'] }, async ({ api }) => {
    for (const slug of ["x' OR '1'='1", '<script>alert(1)</script>', '../../etc/passwd']) {
      const response = await api.products.getBySlug(slug);
      expect(response.status(), `Slug ${slug}`).toBe(404);
    }
  });
});
