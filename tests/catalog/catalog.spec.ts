import { json, type Api, type Brand, type Category, type Country, type Page, type Product } from '../../api';
import { expect, test } from '../../fixtures/test';
import { DirectoryPage, type DirectoryKind } from '../../pages/catalog/DirectoryPage';
import { waitForApi } from '../../utils/network';

/** A search term that matches nothing. */
const NO_MATCH = 'zzzzqqqxxx';

/** A plain word from a product name, good for typing into search. */
const searchWord = (product: Product): string =>
  product.name.split(/\s+/).find((part) => /^[A-Za-z]{4,}$/.test(part)) ?? product.name;

test.describe('Search', { tag: ['@catalog', '@search'] }, () => {
  test('should suggest matching products while the visitor types in the search box', async ({
    page,
    homePage,
    api,
  }) => {
    const term = searchWord(await api.products.findPurchasable());

    await test.step('Open the home page', async () => {
      await homePage.open();
    });

    await test.step(`Type "${term}" in the search box`, async () => {
      const suggest = waitForApi(page, 'GET', /^\/products\?.*searchTerm=/);
      await homePage.header.typeSearch(term);
      expect((await suggest).status()).toBe(200);
    });

    await test.step('The suggestions offer to search for the term and list at least one product', async () => {
      await expect(homePage.header.suggestions.filter({ hasText: `Search for “${term}”` })).toBeVisible();
      await expect(homePage.header.productSuggestions.first()).toBeVisible();
    });
  });

  test('should open the product page when the visitor picks a product from the suggestions', async ({
    page,
    homePage,
    api,
  }) => {
    const product = await api.products.findPurchasable();

    await test.step('Open the home page and type the product name', async () => {
      await homePage.open();
      await homePage.header.typeSearch(product.name);
    });

    await test.step('Click the product in the suggestions', async () => {
      await homePage.header.productSuggestions.filter({ hasText: product.name }).first().click();
    });

    await test.step('The product page opens', async () => {
      await expect(page).toHaveURL(new RegExp(`/products/${product.slugEn}$`));
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(product.name);
    });
  });

  test('should show the same number of results as the API reports for the search', async ({
    productListPage,
    api,
  }) => {
    const term = searchWord(await api.products.findPurchasable());
    const expected = await json<Page<Product>>(api.products.list({ searchTerm: term, limit: 20 }));

    await test.step(`Open the results for "${term}"`, async () => {
      await productListPage.openSearch(term);
    });

    await test.step('The heading names the search and the count matches', async () => {
      await expect(productListPage.heading).toHaveText(`Results for “${term}”`);
      await productListPage.expectTotalResults(expected.total);
    });

    await test.step('The first products are the ones the API returns, in the same order', async () => {
      const shown = await productListPage.productNames();
      expect(shown).toEqual(expected.data.map((product) => product.name).slice(0, shown.length));
    });
  });

  test('should say nothing matches when the search has no results', async ({ productListPage }) => {
    await test.step(`Open the results for "${NO_MATCH}"`, async () => {
      await productListPage.openSearch(NO_MATCH);
    });

    await test.step('There are 0 products and a "nothing matches" message', async () => {
      await productListPage.expectTotalResults(0);
      await expect(productListPage.emptyMessage).toBeVisible();
      await expect(productListPage.addToCartButtons).toHaveCount(0);
    });
  });

  test('should offer no "Clear filters" button when only a search term is set', async ({
    productListPage,
  }) => {
    await test.step(`Open the results for "${NO_MATCH}"`, async () => {
      await productListPage.openSearch(NO_MATCH);
      await expect(productListPage.emptyMessage).toBeVisible();
    });

    await test.step('There is nothing to clear', async () => {
      await expect(productListPage.clearFiltersButton).toBeHidden();
    });
  });
});

test.describe('Product list', { tag: '@catalog' }, () => {
  test('should list all products with the total the API reports', async ({ productListPage, api }) => {
    const expected = await json<Page<Product>>(api.products.list({ limit: 1 }));

    await test.step('Open /products', async () => {
      await productListPage.open();
    });

    await test.step('The page is titled "All products", shows the total and a first batch of 20 products', async () => {
      await expect(productListPage.heading).toHaveText('All products');
      await productListPage.expectTotalResults(expected.total);
      await expect(productListPage.addToCartButtons).toHaveCount(20);
      await expect(productListPage.sortBy).toHaveText('Featured');
    });
  });

  test('should load the next 20 products when the visitor scrolls to the end of the list', async ({
    page,
    productListPage,
  }) => {
    await test.step('Open /products', async () => {
      await productListPage.open();
      await expect(productListPage.addToCartButtons).toHaveCount(20);
    });

    await test.step('Scroll to the end of the list', async () => {
      const nextPage = waitForApi(page, 'GET', /^\/products\?.*page=2/, 20_000);
      await productListPage.scrollToLoadMore();
      expect((await nextPage).status()).toBe(200);
    });

    await test.step('At least 40 products are now shown', async () => {
      expect(await productListPage.addToCartButtons.count()).toBeGreaterThanOrEqual(40);
    });
  });

  const sorts = [
    { option: 'Price: low to high', url: /sortBy=price&sortDirection=asc/, sort: 'price:asc' },
    { option: 'Price: high to low', url: /sortBy=price&sortDirection=desc/, sort: 'price:desc' },
    { option: 'Name: A to Z', url: /sortBy=name&sortDirection=asc/, sort: 'name:asc' },
  ] as const;

  for (const { option, url, sort } of sorts) {
    test(`should reorder the products when the visitor sorts by "${option}"`, async ({
      page,
      productListPage,
      api,
    }) => {
      const expected = await json<Page<Product>>(api.products.list({ limit: 20, sort }));

      await test.step('Open /products', async () => {
        await productListPage.open();
      });

      await test.step(`Choose "${option}" in Sort by`, async () => {
        await productListPage.sortByOption(option);
      });

      await test.step('The URL records the sort and the products are in the order the API returns', async () => {
        await expect(page).toHaveURL(url);
        await expect
          .poll(() => productListPage.productNames(), { message: `Products are not in "${option}" order` })
          .toEqual(expected.data.map((product) => product.name));
      });
    });
  }

  test('should keep the chosen sort when the page is opened from its link', async ({
    productListPage,
    api,
  }) => {
    const expected = await json<Page<Product>>(api.products.list({ limit: 20, sort: 'price:asc' }));

    await test.step('Open /products?sortBy=price&sortDirection=asc directly', async () => {
      await productListPage.openWithQuery('sortBy=price&sortDirection=asc');
    });

    await test.step('Sort by shows "Price: low to high" and the cheapest products come first', async () => {
      await expect(productListPage.sortBy).toHaveText('Price: low to high');
      expect(await productListPage.productNames()).toEqual(expected.data.map((product) => product.name));
    });
  });
});

test.describe('Filters', { tag: '@catalog' }, () => {
  test('should show only products from a country when the visitor ticks it in the filters', async ({
    productListPage,
    api,
  }) => {
    // The first countries of the API are the ones shown before "Show more".
    const [country] = await json<Country[]>(api.countries.list());
    const expected = await json<Page<Product>>(api.products.list({ countries: country.id, limit: 1 }));

    await test.step('Open /products', async () => {
      await productListPage.open();
    });

    await test.step(`Tick "${country.name}" under Country of origin`, async () => {
      await productListPage.applyFilter(
        productListPage.countryCheckbox(country.name),
        new RegExp(`/products/countries/${country.id}`),
      );
    });

    await test.step('The page is titled with the country and shows its product count', async () => {
      await expect(productListPage.heading).toHaveText(country.name);
      await productListPage.expectTotalResults(expected.total);
    });
  });

  test('should show only products of a brand when the visitor ticks it in the filters', async ({
    productListPage,
    api,
  }) => {
    const [brand] = await json<Brand[]>(api.brands.list());
    const expected = await json<Page<Product>>(api.products.list({ brands: brand.id, limit: 1 }));

    await test.step('Open /products', async () => {
      await productListPage.open();
    });

    await test.step(`Tick "${brand.name}" under Brand`, async () => {
      await productListPage.applyFilter(
        productListPage.brandCheckbox(brand.name),
        new RegExp(`/products/brands/${brand.id}`),
      );
    });

    await test.step('The page is titled with the brand and shows its product count', async () => {
      await expect(productListPage.heading).toHaveText(brand.name);
      await productListPage.expectTotalResults(expected.total);
    });
  });

  test('should show only products of a category when the visitor picks it in the filters', async ({
    productListPage,
    api,
  }) => {
    const [category] = await json<Category[]>(api.categories.list());
    const expected = await json<Page<Product>>(api.products.list({ categories: category.id, limit: 1 }));

    await test.step('Open /products', async () => {
      await productListPage.open();
    });

    await test.step(`Click the "${category.name}" category`, async () => {
      await productListPage.applyFilter(
        productListPage.categoryChip(category.name),
        new RegExp(`/products/categories/${category.id}`),
      );
    });

    await test.step('The page is titled with the category, shows its count and offers its subcategories', async () => {
      await expect(productListPage.heading).toHaveText(category.name);
      await productListPage.expectTotalResults(expected.total);
      await expect(productListPage.categoryChip(category.subCategories[0].name)).toBeVisible();
    });
  });

  test('should combine a country and a brand filter', async ({ page, productListPage, api }) => {
    const [country] = await json<Country[]>(api.countries.list());
    const [brand] = await json<Brand[]>(api.brands.list());
    const expected = await json<Page<Product>>(
      api.products.list({ countries: country.id, brands: brand.id, limit: 1 }),
    );

    await test.step(`Open the products from ${country.name}`, async () => {
      await productListPage.openCountry(country.id);
    });

    await test.step(`Also tick the brand "${brand.name}"`, async () => {
      await productListPage.applyFilter(productListPage.brandCheckbox(brand.name), /brands=/);
    });

    await test.step('The URL carries both filters and the count matches the API', async () => {
      await expect(page).toHaveURL(new RegExp(`countries=${country.id}`));
      await expect(page).toHaveURL(new RegExp(`brands=${brand.id}`));
      await productListPage.expectTotalResults(expected.total);
    });

    await test.step('Clear all returns to the full list', async () => {
      await productListPage.applyFilter(productListPage.clearAllButton.first(), /\/products$/);
      await expect(productListPage.heading).toHaveText('All products');
    });
  });
});

test.describe('Filters with no match', { tag: '@catalog' }, () => {
  test('should show all products again when the visitor clears filters that match nothing', async ({
    page,
    productListPage,
    api,
  }) => {
    // Find a country and a brand that have no product in common.
    const countries = (await json<Country[]>(api.countries.list())).slice(0, 4);
    const brands = (await json<Brand[]>(api.brands.list())).slice(0, 6);
    let pair: { country: Country; brand: Brand } | undefined;
    for (const country of countries) {
      for (const brand of brands) {
        if (pair) break;
        const found = await json<Page<Product>>(
          api.products.list({ countries: country.id, brands: brand.id, limit: 1 }),
        );
        if (found.total === 0) pair = { country, brand };
      }
    }
    test.skip(!pair, 'Every country/brand pair tried has products, so no empty combination was found.');
    const { country, brand } = pair!;
    const all = await json<Page<Product>>(api.products.list({ limit: 1 }));

    await test.step(`Open products filtered by country ${country.name} and brand ${brand.name}`, async () => {
      await productListPage.openWithQuery(`countries=${country.id}&brands=${brand.id}`);
    });

    await test.step('There are 0 products and a "nothing matches" message', async () => {
      await productListPage.expectTotalResults(0);
      await expect(productListPage.emptyMessage).toBeVisible();
    });

    await test.step('Click Clear filters', async () => {
      await productListPage.applyFilter(productListPage.clearFiltersButton, /\/products$/);
    });

    await test.step('All products are listed again', async () => {
      await expect(page).toHaveURL(/\/products$/);
      await expect(productListPage.heading).toHaveText('All products');
      await productListPage.expectTotalResults(all.total);
    });
  });
});

test.describe('Category, country and brand pages', { tag: '@catalog' }, () => {
  test(
    'should list the products of a category when its page is opened',
    { tag: '@smoke' },
    async ({ productListPage, api }) => {
      const [category] = await json<Category[]>(api.categories.list());
      const expected = await json<Page<Product>>(api.products.list({ categories: category.id, limit: 20 }));

      await test.step(`Open /products/categories/${category.id}`, async () => {
        await productListPage.openCategory(category.id);
      });

      await test.step('The category name, its product count and its products are shown', async () => {
        await expect(productListPage.heading).toHaveText(category.name);
        await productListPage.expectTotalResults(expected.total);
        await expect(productListPage.addToCartButtons).toHaveCount(Math.min(20, expected.total));
      });
    },
  );

  test('should list the products of a country when its page is opened', async ({ productListPage, api }) => {
    const [country] = await json<Country[]>(api.countries.list());
    const expected = await json<Page<Product>>(api.products.list({ countries: country.id, limit: 1 }));

    await test.step(`Open /products/countries/${country.id}`, async () => {
      await productListPage.openCountry(country.id);
    });

    await test.step('The country name and its product count are shown', async () => {
      await expect(productListPage.heading).toHaveText(country.name);
      await productListPage.expectTotalResults(expected.total);
    });
  });

  test('should list the products of a brand when its page is opened', async ({ productListPage, api }) => {
    const [brand] = await json<Brand[]>(api.brands.list());
    const expected = await json<Page<Product>>(api.products.list({ brands: brand.id, limit: 1 }));

    await test.step(`Open /products/brands/${brand.id}`, async () => {
      await productListPage.openBrand(brand.id);
    });

    await test.step('The brand name and its product count are shown', async () => {
      await expect(productListPage.heading).toHaveText(brand.name);
      await productListPage.expectTotalResults(expected.total);
    });
  });

  const directories: DirectoryKind[] = ['categories', 'countries', 'brands'];

  for (const kind of directories) {
    test(`should list every entry on the "all ${kind}" page and filter them with its search box`, async ({
      page,
      api,
    }) => {
      const directory = new DirectoryPage(page, kind);
      const all = await namesOf(api, kind);
      const wanted = all[0];

      await test.step(`Open /${kind}`, async () => {
        await directory.open();
      });

      await test.step('The entries are listed', async () => {
        // The brands page has hundreds of entries and adds them as the visitor scrolls.
        if (kind === 'brands') await expect(directory.entries.first()).toBeVisible();
        else await expect(directory.entries).toHaveCount(all.length);
      });

      await test.step(`Type "${wanted}" in the search box`, async () => {
        const before = await directory.entries.count();
        // Typing before the page has hydrated is lost (seen under a full parallel run), so clear and type
        // again until the list reacts.
        await expect(async () => {
          await directory.searchBox.clear();
          await directory.searchBox.fill(wanted);
          await expect.poll(() => directory.entries.count(), { timeout: 3_000 }).toBeLessThan(before);
        }, 'Typing in the search box did not narrow the list').toPass({ timeout: 30_000 });
      });

      await test.step('Only matching entries remain, and clicking one opens its products', async () => {
        await expect(directory.entry(wanted)).toBeVisible();
        await directory.entry(wanted).click();
        await expect(page).toHaveURL(new RegExp(`/products/${kind}/`));
        await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(wanted);
      });
    });
  }

  test('should list every local business on /local-businesses and filter them with its search box', async ({ page, api }) => {
    const local = await json<Brand[]>(api.brands.list({ localOnly: true }));
    test.skip(local.length < 2, 'Needs two local businesses to see the search narrow the list');
    const main = page.getByRole('main');
    const entries = main.locator('a[href^="/products/brands/"]');
    await page.goto('/local-businesses');
    await expect(main.getByRole('heading', { name: 'Local businesses', level: 1 })).toBeVisible();
    await expect(entries).toHaveCount(local.length);
    for (const business of local) await expect(entries.filter({ hasText: business.name }).first(), business.name).toBeVisible();

    // The box is labelled "Search brands..." here too.
    const search = main.getByRole('searchbox');
    const wanted = local[0];
    await expect(async () => {
      await search.clear();
      await search.fill(wanted.name);
      await expect.poll(() => entries.count(), { timeout: 3_000 }).toBeLessThan(local.length);
    }, 'Typing in the search box did not narrow the list').toPass({ timeout: 30_000 });
    for (const name of await entries.allInnerTexts()) expect(name.toLowerCase()).toContain(wanted.name.toLowerCase());
    await entries.filter({ hasText: wanted.name }).first().click();
    await expect(page).toHaveURL(/\/products\/brands\//);
    await expect(main.getByRole('heading', { level: 1 })).toHaveText(wanted.name);
  });
});

async function namesOf(api: Api, kind: DirectoryKind): Promise<string[]> {
  const items = await json<{ name: string }[]>(api[kind].list());
  return items.map((item) => item.name);
}
