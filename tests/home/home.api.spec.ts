/**
 * The API endpoints that feed the home page. Read-only: nothing here changes data, so it runs in parallel.
 * Cart and wishlist calls are in home.customer.serial.spec.ts because they share the test customer's cart.
 */
import {
  isActive,
  json,
  promotionTitle,
  type Basket,
  type Brand,
  type Category,
  type Country,
  type OrderSummary,
  type Page,
  type Product,
  type Promotion,
  type StoreInfo,
} from '../../api';
import { expect, test } from '../../fixtures/test';
import { homeData } from '../../test-data/home';

const ID = expect.stringMatching(/^[a-z0-9-]+$/);

test.describe('Home page API', { tag: ['@home', '@api'] }, () => {
  test('GET /info returns the order thresholds and the store announcement', async ({ api }) => {
    const response = await api.info.getInfo();
    expect(response.status()).toBe(200);
    const info = (await response.json()) as StoreInfo;
    expect(info).toMatchObject({
      minOrderAmount: homeData.thresholds.minimumOrder,
      deliveryCutOff: homeData.thresholds.freeDelivery,
      deliveryFee: homeData.thresholds.deliveryFee,
    });
    expect(info.generalNotice === null || typeof info.generalNotice === 'string').toBe(true);
    expect(info.generalNoticeAr === null || typeof info.generalNoticeAr === 'string').toBe(true);
    if (info.generalNotice)
      expect(info.generalNoticeAr, 'English announcement without an Arabic one').toBeTruthy();
  });

  test('GET /categories starts with the six home categories, each with names, image and subcategories', async ({
    api,
  }) => {
    const response = await api.categories.list();
    expect(response.status()).toBe(200);
    const categories = (await response.json()) as Category[];
    expect(categories.slice(0, homeData.categories.length).map((c) => c.name)).toEqual([
      ...homeData.categories,
    ]);
    for (const category of categories) {
      expect.soft(category, category.name).toMatchObject({
        id: ID,
        name: expect.any(String),
        nameAr: expect.any(String),
        image: expect.stringMatching(/^https:\/\//),
        subCategories: expect.any(Array),
      });
    }
  });

  test('GET /countries returns the 13 visible countries, each with an image', async ({ api }) => {
    const countries = await json<Country[]>(api.countries.list());
    expect(countries.filter((c) => c.isVisible).map((c) => c.name)).toEqual([...homeData.countries]);
    for (const country of countries) {
      expect.soft(country.image, `${country.name} image`).toMatch(/^https:\/\//);
      expect.soft(country.nameAr, `${country.name} Arabic name`).toBeTruthy();
    }
  });

  test('GET /brands starts with the 12 home brands, active, each with a logo', async ({ api }) => {
    const brands = await json<Brand[]>(api.brands.list());
    expect(brands.slice(0, homeData.brands.length).map((b) => b.name)).toEqual([...homeData.brands]);
    for (const brand of brands.slice(0, homeData.brands.length)) {
      expect
        .soft(brand, brand.name)
        .toMatchObject({ isActive: true, isLocal: false, image: expect.stringMatching(/^https:\/\//) });
    }
  });

  test('GET /brands?localOnly=true starts with the three home local businesses', async ({ api }) => {
    const local = await json<Brand[]>(api.brands.list({ localOnly: true }));
    expect(local.slice(0, homeData.localBusinesses.length).map((b) => b.name)).toEqual([
      ...homeData.localBusinesses,
    ]);
    for (const brand of local) expect.soft(brand.isLocal, `${brand.name} isLocal`).toBe(true);
  });

  test('GET /promotions returns only running deals with valid settings for their type', async ({ api }) => {
    const promotions = await json<Promotion[]>(api.promotions.list());
    for (const promotion of promotions) {
      await test.step(promotion.name, async () => {
        expect
          .soft(isActive(promotion), `"${promotion.name}" ended at ${promotion.endsAt} but is still listed`)
          .toBe(true);
        expect.soft(() => promotionTitle(promotion), 'Unknown promotion type').not.toThrow();
        if (['buy_x_get_y', 'mix_and_match'].includes(promotion.type)) {
          expect.soft(promotion.buyQuantity ?? 0).toBeGreaterThan(0);
          expect.soft(promotion.getQuantity ?? 0).toBeGreaterThan(0);
        }
        if (promotion.type === 'bundle_price') {
          expect.soft(promotion.buyQuantity ?? 0).toBeGreaterThan(1);
          expect.soft(promotion.value).toBeGreaterThan(0);
        }
        if (promotion.type === 'percentage_off') {
          expect.soft(promotion.value).toBeGreaterThan(0);
          expect.soft(promotion.value).toBeLessThan(100);
        }
      });
    }
  });

  test('products in a percentage deal are priced at the original minus the percentage', async ({ api }) => {
    const deal = (await api.promotions.active()).find((p) => p.type === 'percentage_off');
    test.skip(!deal, 'No running percentage deal');
    if (!deal) return;
    const page = await json<Page<Product>>(api.products.list({ promotionId: deal.id, limit: 50 }));
    for (const product of page.data.filter((p) => p.compareAtPrice)) {
      const expected = Math.round((product.compareAtPrice ?? 0) * (1 - deal.value / 100) * 100) / 100;
      expect
        .soft(
          Math.abs(product.price - expected),
          `${product.name}: ${product.compareAtPrice} -> ${product.price}, expected ${expected}`,
        )
        .toBeLessThan(0.0051);
    }
  });

  test('featured and best-price rows return in-stock-ready product data', async ({ api }) => {
    for (const sort of ['featured:desc', 'price:asc']) {
      const products = await api.products.firstPage(sort, homeData.productRows.featured);
      expect(products, sort).toHaveLength(homeData.productRows.featured);
      for (const product of products) {
        expect.soft(product, `${sort}: ${product.name}`).toMatchObject({
          id: expect.any(String),
          name: expect.any(String),
          slugEn: expect.any(String),
          price: expect.any(Number),
          inStock: expect.any(Boolean),
          deliveryType: expect.stringMatching(/^(express|scheduled)$/),
          images: expect.arrayContaining([expect.stringMatching(/^https:\/\//)]),
        });
      }
    }
    const cheapest = await api.products.firstPage('price:asc', homeData.productRows.bestPrices);
    const prices = cheapest.map((p) => p.compareAtPrice ?? p.price);
    expect(prices, 'Best prices are not in ascending order of list price').toEqual(
      [...prices].sort((a, b) => a - b),
    );
  });

  test('GET /baskets returns active baskets with a name and slug', async ({ api }) => {
    const baskets = await json<Basket[]>(api.baskets.list());
    expect(baskets.length).toBeGreaterThan(0);
    for (const basket of baskets) {
      expect
        .soft(basket, basket.name)
        .toMatchObject({ id: expect.any(String), name: expect.any(String), slug: ID, isActive: true });
    }
  });

  test('every home country and brand filter returns only its own products', async ({ api }) => {
    test.slow();
    const [countries, brands] = await Promise.all([
      json<Country[]>(api.countries.list()),
      json<Brand[]>(api.brands.list()),
    ]);
    for (const country of countries.filter((c) => homeData.countries.includes(c.name as never))) {
      const page = await json<Page<Product>>(api.products.list({ countries: country.id, limit: 50 }));
      const wrong = page.data.filter(
        (p) => !p.countries.some((c) => c.id === country.id) && p.country?.id !== country.id,
      );
      expect
        .soft(
          wrong.map((p) => p.name),
          `Not from ${country.name}`,
        )
        .toEqual([]);
    }
    for (const brand of brands.filter((b) => homeData.brands.includes(b.name as never))) {
      const page = await json<Page<Product>>(api.products.list({ brands: brand.id, limit: 50 }));
      const wrong = page.data.filter((p) => p.brand?.id !== brand.id);
      expect
        .soft(
          wrong.map((p) => p.name),
          `Not from ${brand.name}`,
        )
        .toEqual([]);
    }
  });

  test('GET /orders?limit=1 gives the last order the hero card is built from', async ({ customerApi }) => {
    const response = await customerApi.orders.list({ page: 1, limit: 1 });
    expect(response.status()).toBe(200);
    const page = (await response.json()) as Page<OrderSummary>;
    expect(page).toMatchObject({ page: 1, limit: 1, total: expect.any(Number), data: expect.any(Array) });
    test.skip(!page.data.length, 'The test customer has no orders');
    const [order] = page.data;
    expect(order).toMatchObject({
      id: expect.any(String),
      displayId: expect.any(String),
      totalAmount: expect.any(Number),
      itemsCount: expect.any(Number),
      status: expect.any(String),
    });
    const detail = await customerApi.orders.latest();
    const units = detail?.items.reduce((sum, item) => sum + item.quantity, 0);
    expect(order.itemsCount, 'itemsCount is the number of units across the order').toBe(units);
  });

  test('a guest cannot read the cart, wishlist or orders', async ({ api }) => {
    for (const response of [
      await api.cart.getCart(),
      await api.wishlist.getWishlist(),
      await api.orders.list({ page: 1, limit: 1 }),
    ]) {
      expect.soft(response.status(), response.url()).toBe(401);
    }
  });
});
