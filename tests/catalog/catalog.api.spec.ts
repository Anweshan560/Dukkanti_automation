import {
  json,
  type ApiError,
  type Brand,
  type Category,
  type Country,
  type Page,
  type Product,
  type Promotion,
} from '../../api';
import { expect, test } from '../../fixtures/test';
import { knownBug } from '../../utils/knownBug';

/** A search term that matches nothing. */
const NO_MATCH = 'zzzzqqqxxx';

/** The price the store sorts by: the price before any discount. */
const listPrice = (product: Product): number => product.compareAtPrice ?? product.price;

const productShape = {
  id: expect.stringMatching(/^[0-9a-f-]{36}$/),
  name: expect.any(String),
  nameAr: expect.any(String),
  slugEn: expect.any(String),
  slugAr: expect.any(String),
  price: expect.any(Number),
  inStock: expect.any(Boolean),
  isInWishlist: false,
  images: expect.any(Array),
  deliveryType: expect.stringMatching(/^(express|scheduled)$/),
  categories: expect.any(Array),
  countries: expect.any(Array),
};

test.describe('Products list API', { tag: '@catalog' }, () => {
  test('should return a page of products with paging details to a guest', async ({ api }) => {
    const response = await test.step('GET /products?limit=5 without a token', () =>
      api.products.list({ limit: 5 }));

    await test.step('Responds 200 with 5 products and the paging details', async () => {
      expect(response.status()).toBe(200);
      const page = (await response.json()) as Page<Product>;
      expect(page).toEqual(
        expect.objectContaining({
          page: 1,
          limit: 5,
          total: expect.any(Number),
          totalPages: expect.any(Number),
        }),
      );
      expect(page.data).toHaveLength(5);
      expect(page.total).toBeGreaterThan(0);
      expect(page.totalPages).toBe(Math.ceil(page.total / 5));
    });

    await test.step('Every product has the fields the storefront shows', async () => {
      const page = (await response.json()) as Page<Product>;
      for (const product of page.data) {
        expect(product).toEqual(expect.objectContaining(productShape));
        expect(product.price).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test('should return different products on page 2 than on page 1', async ({ api }) => {
    const [first, second] = await test.step('GET page 1 and page 2 with limit=20', () =>
      Promise.all([
        json<Page<Product>>(api.products.list({ limit: 20, page: 1 })),
        json<Page<Product>>(api.products.list({ limit: 20, page: 2 })),
      ]));

    await test.step('Page 2 is marked as page 2 and shares no product with page 1', async () => {
      expect(second.page).toBe(2);
      const firstIds = new Set(first.data.map((product) => product.id));
      expect(second.data.filter((product) => firstIds.has(product.id))).toEqual([]);
    });
  });

  test('should return an empty page when the page number is past the last page', async ({ api }) => {
    const { totalPages } = await json<Page<Product>>(api.products.list({ limit: 20 }));

    const response = await test.step(`GET page ${totalPages + 1}`, () =>
      api.products.list({ limit: 20, page: totalPages + 1 }));

    await test.step('Responds 200 with no products', async () => {
      expect(response.status()).toBe(200);
      expect(((await response.json()) as Page<Product>).data).toEqual([]);
    });
  });

  test('should reject the request with 400 when limit is not a number', async ({ api }) => {
    const response = await test.step('GET /products?limit=abc', () => api.products.listRaw({ limit: 'abc' }));

    await test.step('Responds 400 with the validation message', async () => {
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({
        message: ['limit must be a number conforming to the specified constraints'],
        error: 'Bad Request',
        statusCode: 400,
      });
    });
  });

  const invalidPaging = [
    { name: 'page is 0', query: { page: 0 } },
    { name: 'page is negative', query: { page: -1 } },
    { name: 'limit is negative', query: { limit: -1 } },
  ];

  for (const { name, query } of invalidPaging) {
    test(`should reject the request with 400 when ${name}`, async ({ api }) => {
      knownBug('products-pagination-500');

      const response = await test.step(`GET /products?${new URLSearchParams(query as never)}`, () =>
        api.products.listRaw(query));

      await test.step('Responds 400, not a server error', async () => {
        expect(response.status()).toBe(400);
      });
    });
  }

  test('should reject the request with 400 when promotionId is not a UUID', async ({ api }) => {
    const response = await test.step('GET /products?promotionId=not-a-uuid', () =>
      api.products.list({ promotionId: 'not-a-uuid' }));

    await test.step('Responds 400 "promotionId must be a UUID"', async () => {
      expect(response.status()).toBe(400);
      expect(((await response.json()) as ApiError).message).toEqual(['promotionId must be a UUID']);
    });
  });
});

test.describe('Products sorting API', { tag: '@catalog' }, () => {
  test('should return the cheapest products first when sorted by price ascending', async ({ api }) => {
    const page = await test.step('GET /products?sort=price:asc', () =>
      json<Page<Product>>(api.products.list({ limit: 40, sort: 'price:asc' })));

    await test.step('Prices (before discount) never go down', async () => {
      const prices = page.data.map(listPrice);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
    });
  });

  test('should return the most expensive products first when sorted by price descending', async ({ api }) => {
    const page = await test.step('GET /products?sort=price:desc', () =>
      json<Page<Product>>(api.products.list({ limit: 40, sort: 'price:desc' })));

    await test.step('Prices (before discount) never go up', async () => {
      const prices = page.data.map(listPrice);
      expect(prices).toEqual([...prices].sort((a, b) => b - a));
    });
  });

  test('should return products in alphabetical order when sorted by name', async ({ api }) => {
    const [ascending, descending] = await test.step('GET /products sorted by name:asc and name:desc', () =>
      Promise.all([
        json<Page<Product>>(api.products.list({ limit: 40, sort: 'name:asc' })),
        json<Page<Product>>(api.products.list({ limit: 40, sort: 'name:desc' })),
      ]));
    const initials = (page: Page<Product>): string[] =>
      page.data.map((product) => product.name.trim()[0].toLowerCase());

    await test.step('A-to-Z starts at the beginning of the alphabet and never goes backwards', async () => {
      const letters = initials(ascending);
      expect(letters).toEqual([...letters].sort());
    });

    await test.step('Z-to-A never goes forwards and starts later in the alphabet than A-to-Z', async () => {
      const letters = initials(descending);
      expect(letters).toEqual([...letters].sort().reverse());
      expect(letters[0] > initials(ascending)[0]).toBe(true);
    });
  });
});

test.describe('Products search and filter API', { tag: ['@catalog', '@search'] }, () => {
  test('should find a product when searching for a word from its name', async ({ api }) => {
    const product = await api.products.findPurchasable();
    const word = product.name.split(/\s+/).find((part) => /^[A-Za-z]{4,}$/.test(part)) ?? product.name;

    const page = await test.step(`GET /products?searchTerm=${word}`, () =>
      json<Page<Product>>(api.products.list({ searchTerm: word, limit: 100 })));

    await test.step('There are results', async () => {
      expect(page.total).toBeGreaterThan(0);
    });

    await test.step('Searching for the full product name returns that product', async () => {
      const exact = await json<Page<Product>>(api.products.list({ searchTerm: product.name, limit: 20 }));
      expect(exact.data.map((found) => found.id)).toContain(product.id);
    });
  });

  test('should ignore upper and lower case in the search term', async ({ api }) => {
    const product = await api.products.findPurchasable();
    const word = product.name.split(/\s+/).find((part) => /^[A-Za-z]{4,}$/.test(part)) ?? product.name;

    const [lower, upper] =
      await test.step(`Search for "${word.toLowerCase()}" and "${word.toUpperCase()}"`, () =>
        Promise.all([
          json<Page<Product>>(api.products.list({ searchTerm: word.toLowerCase(), limit: 1 })),
          json<Page<Product>>(api.products.list({ searchTerm: word.toUpperCase(), limit: 1 })),
        ]));

    await test.step('Both find the same number of products', async () => {
      expect(upper.total).toBe(lower.total);
    });
  });

  test('should return no products when nothing matches the search term', async ({ api }) => {
    const response = await test.step(`GET /products?searchTerm=${NO_MATCH}`, () =>
      api.products.list({ searchTerm: NO_MATCH }));

    await test.step('Responds 200 with an empty list and a total of 0', async () => {
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual(expect.objectContaining({ data: [], total: 0, totalPages: 0 }));
    });
  });

  test('should return only products of the category when filtered by category', async ({ api }) => {
    const [category] = await json<Category[]>(api.categories.list());

    const page = await test.step(`GET /products?categories=${category.id}`, () =>
      json<Page<Product>>(api.products.list({ categories: category.id, limit: 100 })));

    await test.step('There are results and each one is in that category', async () => {
      expect(page.total).toBeGreaterThan(0);
      for (const product of page.data) {
        expect(
          product.categories.map((c) => c.id),
          product.name,
        ).toContain(category.id);
      }
    });
  });

  test('should return only products of the subcategory when filtered by subcategory', async ({ api }) => {
    const categories = await json<Category[]>(api.categories.list());
    const subCategory = categories.flatMap((category) => category.subCategories)[0];

    const page = await test.step(`GET /products?subCategories=${subCategory.id}`, () =>
      json<Page<Product>>(api.products.list({ subCategories: subCategory.id, limit: 100 })));

    await test.step('Each result is in that subcategory', async () => {
      for (const product of page.data) {
        expect(
          product.subCategories.map((s) => s.id),
          product.name,
        ).toContain(subCategory.id);
      }
    });
  });

  test('should return only products from the country when filtered by country', async ({ api }) => {
    const [country] = await json<Country[]>(api.countries.list());

    const page = await test.step(`GET /products?countries=${country.id}`, () =>
      json<Page<Product>>(api.products.list({ countries: country.id, limit: 100 })));

    await test.step('There are results and each one comes from that country', async () => {
      expect(page.total).toBeGreaterThan(0);
      for (const product of page.data) {
        expect(
          product.countries.map((c) => c.id),
          product.name,
        ).toContain(country.id);
      }
    });
  });

  test('should return only products of the brand when filtered by brand', async ({ api }) => {
    const { brand } = await api.products.findPurchasable();
    expect(brand, 'The chosen product has a brand').not.toBeNull();

    const page = await test.step(`GET /products?brands=${brand!.id}`, () =>
      json<Page<Product>>(api.products.list({ brands: brand!.id, limit: 100 })));

    await test.step('There are results and each one is of that brand', async () => {
      expect(page.total).toBeGreaterThan(0);
      for (const product of page.data) expect(product.brand?.id, product.name).toBe(brand!.id);
    });
  });

  test('should narrow the results when two filters are combined', async ({ api }) => {
    const product = await api.products.findPurchasable();
    const brandId = product.brand!.id;
    const countryId = product.countries[0].id;

    const [byBrand, byBoth] =
      await test.step(`Filter by brand ${brandId}, then by brand and country ${countryId}`, () =>
        Promise.all([
          json<Page<Product>>(api.products.list({ brands: brandId, limit: 1 })),
          json<Page<Product>>(api.products.list({ brands: brandId, countries: countryId, limit: 100 })),
        ]));

    await test.step('The combined filter returns no more than the brand alone, and every result matches both', async () => {
      expect(byBoth.total).toBeGreaterThan(0);
      expect(byBoth.total).toBeLessThanOrEqual(byBrand.total);
      for (const found of byBoth.data) {
        expect(found.brand?.id).toBe(brandId);
        expect(found.countries.map((c) => c.id)).toContain(countryId);
      }
    });
  });

  test('should return no products when the category does not exist', async ({ api }) => {
    const response = await test.step('GET /products?categories=no-such-category', () =>
      api.products.list({ categories: 'no-such-category' }));

    await test.step('Responds 200 with an empty list', async () => {
      expect(response.status()).toBe(200);
      expect(((await response.json()) as Page<Product>).total).toBe(0);
    });
  });

  test('should return only products in the deal when filtered by promotion', async ({ api }) => {
    const promotions = await json<Promotion[]>(api.promotions.list());
    test.skip(promotions.length === 0, 'The store has no active promotion right now.');
    const promotion = promotions[0];

    const page = await test.step(`GET /products?promotionId=${promotion.id}`, () =>
      json<Page<Product>>(api.products.list({ promotionId: promotion.id, limit: 50 })));

    await test.step('Each result carries that promotion', async () => {
      for (const product of page.data) expect(product.promotion?.id, product.name).toBe(promotion.id);
    });
  });

  // Used by "You may also like" and similar lists to leave out the product being looked at.
  test('should leave out the products named in excludeProductIds and count the rest', async ({ api }) => {
    const first = await json<Page<Product>>(api.products.list({ limit: 5, page: 1 }));
    const [a, b] = first.data.map((p) => p.id);

    const page = await test.step('GET /products?excludeProductIds=<first two ids>', () =>
      json<Page<Product>>(api.products.list({ limit: 5, page: 1, excludeProductIds: `${a},${b}` })));

    await test.step('Neither is listed, the next ones move up and the total drops by two', async () => {
      const ids = page.data.map((p) => p.id);
      expect(ids).not.toContain(a);
      expect(ids).not.toContain(b);
      expect(ids.slice(0, 3)).toEqual(first.data.slice(2, 5).map((p) => p.id));
      expect(page.total).toBe(first.total - 2);
    });
  });

  test('should ignore an excludeProductIds id that matches no product', async ({ api }) => {
    const all = await json<Page<Product>>(api.products.list({ limit: 1 }));
    const page = await json<Page<Product>>(
      api.products.list({ limit: 1, excludeProductIds: '00000000-0000-4000-8000-000000000000' }),
    );
    expect(page.total).toBe(all.total);
  });

  test('should reject an excludeProductIds value that is not a product id with 400', async ({ api }) => {
    const response = await api.products.list({ excludeProductIds: 'not-a-uuid' });
    expect(response.status()).toBe(400);
    expect(((await response.json()) as ApiError).message).toEqual([
      'each value in excludeProductIds must be a UUID',
    ]);
  });
});

test.describe('Categories, countries, brands and promotions API', { tag: '@catalog' }, () => {
  test('should return every category with its subcategories', async ({ api }) => {
    const response = await test.step('GET /categories', () => api.categories.list());

    await test.step('Responds 200 with categories that each have an id, both names and subcategories', async () => {
      expect(response.status()).toBe(200);
      const categories = (await response.json()) as Category[];
      expect(categories.length).toBeGreaterThan(0);
      for (const category of categories) {
        expect(category).toEqual(
          expect.objectContaining({
            id: expect.any(String),
            name: expect.any(String),
            nameAr: expect.any(String),
            subCategories: expect.any(Array),
          }),
        );
      }
      expect(new Set(categories.map((c) => c.id)).size, 'category ids are unique').toBe(categories.length);
    });
  });

  test('should return only visible countries', async ({ api }) => {
    const response = await test.step('GET /countries', () => api.countries.list());

    await test.step('Responds 200 and every country is marked visible', async () => {
      expect(response.status()).toBe(200);
      const countries = (await response.json()) as Country[];
      expect(countries.length).toBeGreaterThan(0);
      for (const country of countries) {
        expect(country).toEqual(
          expect.objectContaining({ id: expect.any(String), name: expect.any(String), isVisible: true }),
        );
      }
    });
  });

  test('should return active brands, and local businesses only when localOnly is set', async ({ api }) => {
    const [brands, local] = await test.step('GET /brands and GET /brands?localOnly=true', () =>
      Promise.all([json<Brand[]>(api.brands.list()), json<Brand[]>(api.brands.list({ localOnly: true }))]));

    await test.step('Brands are active, have an id and a name, and ids are unique', async () => {
      expect(brands.length).toBeGreaterThan(0);
      for (const brand of brands) {
        expect(brand).toEqual(
          expect.objectContaining({ id: expect.any(String), name: expect.any(String), isActive: true }),
        );
      }
      expect(new Set(brands.map((brand) => brand.id)).size).toBe(brands.length);
    });

    await test.step('With localOnly, every brand returned is a local business', async () => {
      for (const brand of local) expect(brand.isLocal, brand.name).toBe(true);
    });

    await test.step('Local businesses are kept out of the normal brand list', async () => {
      expect(brands.filter((brand) => brand.isLocal)).toEqual([]);
    });
  });

  test('should return only brands that sell in the category when filtered by category', async ({ api }) => {
    const [category] = await json<Category[]>(api.categories.list());

    const [all, filtered] = await test.step(`GET /brands and GET /brands?categoryId=${category.id}`, () =>
      Promise.all([
        json<Brand[]>(api.brands.list()),
        json<Brand[]>(api.brands.list({ categoryId: category.id })),
      ]));

    await test.step('The filtered list is shorter, and its first brand has products in that category', async () => {
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.length).toBeLessThan(all.length);
      const products = await json<Page<Product>>(
        api.products.list({ brands: filtered[0].id, categories: category.id, limit: 1 }),
      );
      expect(products.total).toBeGreaterThan(0);
    });
  });

  test('should return the active promotions with their rules', async ({ api }) => {
    const response = await test.step('GET /promotions', () => api.promotions.list());

    await test.step('Responds 200 and each promotion has a name, a type, a value and a link name', async () => {
      expect(response.status()).toBe(200);
      const promotions = (await response.json()) as Promotion[];
      for (const promotion of promotions) {
        expect(promotion).toEqual(
          expect.objectContaining({
            id: expect.stringMatching(/^[0-9a-f-]{36}$/),
            name: expect.any(String),
            slugEn: expect.any(String),
            type: expect.stringMatching(
              /^(buy_x_get_y|bundle_price|mix_and_match|percentage_off|amount_off|fixed_off)$/,
            ),
            value: expect.any(Number),
          }),
        );
        if (promotion.endsAt) {
          expect(Date.parse(promotion.endsAt), `${promotion.name} has not ended`).toBeGreaterThan(Date.now());
        }
      }
    });
  });
});
