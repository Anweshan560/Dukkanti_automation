import {
  endsLabel,
  json,
  promotionTitle,
  type Basket,
  type Brand,
  type Category,
  type Country,
  type Page as ApiPage,
  type Product,
  type StoreInfo,
} from '../../api';
import { env } from '../../config/env';
import { expect, test } from '../../fixtures/test';
import { homeData } from '../../test-data/home';
import { waitForApi } from '../../utils/network';
import { clickToNavigate, imageLoaded, parseMoney, readableText } from '../../utils/dom';
import { expectCardFollowsRules, expectEqualHeights } from './productCardRules';

/** Product listing heading and count for a category/country/brand page. */
async function expectListing(
  productListPage: import('../../pages/catalog/ProductListPage').ProductListPage,
  heading: string,
  total: number,
): Promise<void> {
  await productListPage.expectLoaded();
  await expect(productListPage.heading).toHaveText(heading);
  await productListPage.expectTotalResults(total);
}

test.describe('Home hero', { tag: '@home' }, () => {
  test(
    'badges, heading and subtext render, and the free-delivery amount matches the store setting',
    {
      tag: '@smoke',
    },
    async ({ homePage, api }) => {
      const info = await json<StoreInfo>(api.info.getInfo());
      await homePage.open();
      const hero = homePage.hero;
      await expect(hero.badge(homeData.hero.sameDayBadge)).toBeVisible();
      const freeBadge = hero.root.getByText(new RegExp(`^${homeData.hero.freeDeliveryBadge}`));
      await expect
        .poll(() => readableText(freeBadge))
        .toBe(`${homeData.hero.freeDeliveryBadge} ${info.deliveryCutOff}`);
      expect(info.deliveryCutOff, 'Store free-delivery threshold changed').toBe(
        homeData.thresholds.freeDelivery,
      );
      await expect(hero.heading).toHaveText(homeData.hero.heading);
      await expect(hero.subtext).toHaveText(homeData.hero.subtext);
    },
  );

  for (const [name, path] of [
    ['Start shopping', '/products'],
    ['Shop by country', '/countries'],
  ] as const) {
    test(`"${name}" opens ${path}`, { tag: '@smoke' }, async ({ page, homePage }) => {
      await homePage.open();
      const link =
        name === 'Start shopping' ? homePage.hero.startShoppingLink : homePage.hero.shopByCountryLink;
      await expect(link).toHaveAttribute('href', path);
      await clickToNavigate(page, link, new RegExp(`${path}$`));
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
    });
  }

  test('illustration loads and is marked as decorative', { tag: '@regression' }, async ({ homePage }) => {
    await homePage.open();
    const art = homePage.hero.illustration;
    await expect(art).toHaveCount(1);
    await expect.poll(() => imageLoaded(art)).toBe(true);
    // Decorative art next to a real heading: an alt attribute must be present (empty is correct here).
    await expect(art).toHaveAttribute('alt');
  });

  test(
    'a guest sees no "From your last order" card',
    { tag: ['@regression', '@states'] },
    async ({ homePage }) => {
      await homePage.open();
      await expect(homePage.hero.heading).toBeVisible();
      await expect(homePage.hero.lastOrder.heading).toHaveCount(0);
    },
  );

  test.describe('signed-in customer', () => {
    test.use({ storageState: env.storageState.customer });

    test(
      '"From your last order" shows the date, item count and total of the latest order',
      {
        tag: ['@smoke', '@states'],
      },
      async ({ page, homePage, customerApi }) => {
        const order = await customerApi.orders.latest();
        test.skip(!order, 'The test customer has no orders');
        if (!order) return;
        const date = new Date(order.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'Asia/Dubai',
        });
        const units = order.items.reduce((sum, item) => sum + item.quantity, 0);

        // The card is filled in by the browser: GET /orders?limit=1, then GET /orders/<id>.
        const detail = waitForApi(page, 'GET', `/orders/${order.id}`, 30_000);
        await homePage.open();
        expect((await detail).status(), 'Loading the last order failed').toBe(200);
        const card = homePage.hero.lastOrder;
        await expect(card.heading).toBeVisible();
        await expect
          .poll(() => readableText(card.summary))
          .toBe(`${date} · ${units} ${units === 1 ? 'item' : 'items'} · ${order.totalAmount.toFixed(2)}`);

        await test.step('Thumbnail is the first ordered product, loaded', async () => {
          await expect(card.thumbnails.first()).toHaveAttribute('alt', order.items[0].product.name);
          await expect.poll(() => imageLoaded(card.thumbnails.first())).toBe(true);
        });
        await expect(card.viewOrderLink).toHaveAttribute('href', `/account/orders/${order.id}`);
      },
    );

    test('"View order" opens that order', { tag: '@regression' }, async ({ page, homePage, customerApi }) => {
      const order = await customerApi.orders.latest();
      test.skip(!order, 'The test customer has no orders');
      const detail = waitForApi(page, 'GET', `/orders/${order?.id}`, 30_000);
      await homePage.open();
      await detail;
      await clickToNavigate(
        page,
        homePage.hero.lastOrder.viewOrderLink,
        new RegExp(`/account/orders/${order?.id}$`),
      );
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Order #${order?.displayId}`);
    });

    test(
      'a customer without orders sees no last-order card and the hero still lays out',
      {
        tag: ['@regression', '@states'],
      },
      async ({ page, homePage }) => {
        // No test account without orders exists, so the orders call is answered with an empty list.
        await page.route(`${env.apiUrl}/orders?**`, (route) =>
          route.fulfill({ json: { data: [], total: 0, page: 1, limit: 1, totalPages: 0 } }),
        );
        await page.addInitScript(() => localStorage.removeItem('dukkanti_has_ordered'));
        await homePage.open();
        await expect(homePage.header.accountButton).toBeVisible();
        await expect(homePage.hero.startShoppingLink).toBeVisible();
        await expect(homePage.hero.lastOrder.heading).toHaveCount(0);
        const heroBox = await homePage.hero.root.boundingBox();
        expect(heroBox?.height ?? 0, 'Hero collapsed without the last-order card').toBeGreaterThan(200);
      },
    );
  });
});

test.describe(
  'Home category, country, brand and local business bands',
  { tag: ['@home', '@regression'] },
  () => {
    test('Shop by category shows the six categories, in API order, each with an icon', async ({
      homePage,
      api,
    }) => {
      const categories = (await json<Category[]>(api.categories.list())).slice(0, homeData.categories.length);
      await homePage.open();
      const section = homePage.categories;
      await expect.poll(() => section.labels(section.tiles)).toEqual([...homeData.categories]);
      expect(
        categories.map((category) => category.name),
        'API category order differs from the test data',
      ).toEqual([...homeData.categories]);
      await expect
        .poll(() => section.hrefs(section.tiles))
        .toEqual(categories.map((c) => `/products/categories/${c.id}`));
      for (const tile of await section.tiles.all()) {
        const icon = tile.locator('img');
        await tile.scrollIntoViewIfNeeded();
        await expect
          .poll(() => imageLoaded(icon), { message: `Icon of ${await tile.textContent()}` })
          .toBe(true);
      }
    });

    test('each category tile opens that category with its products', async ({
      page,
      homePage,
      productListPage,
      api,
    }) => {
      const categories = (await json<Category[]>(api.categories.list())).slice(0, homeData.categories.length);
      for (const category of categories) {
        await test.step(category.name, async () => {
          const expected = await json<ApiPage<Product>>(
            api.products.list({ categories: category.id, limit: 1 }),
          );
          await homePage.open();
          await clickToNavigate(
            page,
            homePage.categories.tiles.filter({ hasText: category.name }),
            new RegExp(`/products/categories/${category.id}$`),
          );
          await expectListing(productListPage, category.name, expected.total);
        });
      }
    });

    test('Shop by country shows the subtitle and the 13 stamps, each with a picture', async ({
      homePage,
      api,
    }) => {
      const countries = (await json<Country[]>(api.countries.list())).filter((country) => country.isVisible);
      await homePage.open();
      const section = homePage.countries;
      await expect(section.subtitle).toHaveText(homeData.countriesSubtitle);
      await expect.poll(() => section.labels(section.stamps)).toEqual([...homeData.countries]);
      expect(
        countries.map((country) => country.name),
        'API country list differs from the test data',
      ).toEqual([...homeData.countries]);
      await expect
        .poll(() => section.hrefs(section.stamps))
        .toEqual(countries.map((c) => `/products/countries/${c.id}`));
      for (const stamp of await section.stamps.all()) {
        await stamp.scrollIntoViewIfNeeded();
        await expect.poll(() => imageLoaded(stamp.locator('img'))).toBe(true);
      }
    });

    test('a country stamp opens that country with its products', async ({
      page,
      homePage,
      productListPage,
      api,
    }) => {
      const country = (await json<Country[]>(api.countries.list()))[0];
      const expected = await json<ApiPage<Product>>(api.products.list({ countries: country.id, limit: 1 }));
      await homePage.open();
      await clickToNavigate(
        page,
        homePage.countries.stamps.filter({ hasText: country.name }),
        new RegExp(`/products/countries/${country.id}$`),
      );
      await expectListing(productListPage, country.name, expected.total);
    });

    test('Shop by brand shows the 12 brands, each with a loaded logo, wrapping without overflow', async ({
      homePage,
      api,
    }) => {
      const brands = (await json<Brand[]>(api.brands.list())).slice(0, homeData.brands.length);
      await homePage.open();
      const section = homePage.brands;
      await expect.poll(() => section.labels(section.chips)).toEqual([...homeData.brands]);
      expect(
        brands.map((brand) => brand.name),
        'API brand order differs from the test data',
      ).toEqual([...homeData.brands]);
      await expect
        .poll(() => section.hrefs(section.chips))
        .toEqual(brands.map((b) => `/products/brands/${b.id}`));
      for (const chip of await section.chips.all()) {
        await chip.scrollIntoViewIfNeeded();
        await expect
          .poll(() => imageLoaded(chip.locator('img')), { message: `Logo of ${await chip.textContent()}` })
          .toBe(true);
      }
      const overflow = await section.root.evaluate(
        (element) => element.scrollWidth > element.clientWidth + 1,
      );
      expect(overflow, 'Brand chips overflow their band instead of wrapping').toBe(false);
    });

    test('a brand chip opens that brand with its products', async ({
      page,
      homePage,
      productListPage,
      api,
    }) => {
      const brand = (await json<Brand[]>(api.brands.list())).find((b) => b.name === homeData.search.byBrand);
      test.skip(!brand, `Brand ${homeData.search.byBrand} is no longer listed`);
      if (!brand) return;
      const expected = await json<ApiPage<Product>>(api.products.list({ brands: brand.id, limit: 1 }));
      await homePage.open();
      await clickToNavigate(
        page,
        homePage.brands.chips.filter({ hasText: brand.name }),
        new RegExp(`/products/brands/${brand.id}$`),
      );
      await expectListing(productListPage, brand.name, expected.total);
    });

    test('Local businesses shows its three stores with logo and "Shop now", each opening the store', async ({
      page,
      homePage,
      api,
    }) => {
      const local = (await json<Brand[]>(api.brands.list({ localOnly: true }))).slice(
        0,
        homeData.localBusinesses.length,
      );
      await homePage.open();
      const section = homePage.localBusinesses;
      await expect(section.cards).toHaveCount(homeData.localBusinesses.length);
      expect(
        local.map((brand) => brand.name),
        'API local business order differs from the test data',
      ).toEqual([...homeData.localBusinesses]);
      for (const [index, business] of local.entries()) {
        const card = section.cards.nth(index);
        await expect(card).toHaveAttribute('href', `/products/brands/${business.id}`);
        await expect(card).toContainText(business.name);
        await expect(card).toContainText('Shop now');
        await card.scrollIntoViewIfNeeded();
        await expect.poll(() => imageLoaded(card.locator('img'))).toBe(true);
      }
      await clickToNavigate(page, section.cards.first(), new RegExp(`/products/brands/${local[0].id}$`));
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(local[0].name);
    });

    test('every "See all" link opens its full list', async ({ page, homePage }) => {
      await homePage.open();
      const expected: [string, import('@playwright/test').Locator, string][] = [
        ['categories', homePage.categories.seeAllLink, '/categories'],
        ['deals', homePage.deals.seeAllLink, '/deals'],
        ['countries', homePage.countries.seeAllLink, '/countries'],
        ['featured', homePage.productTabs.seeAllLink, '/products?sortBy=featured&sortDirection=desc'],
        ['brands', homePage.brands.seeAllLink, '/brands'],
        ['trending', homePage.trending.seeAllLink, '/products'],
        ['local businesses', homePage.localBusinesses.seeAllLink, '/local-businesses'],
      ];
      for (const [what, link, href] of expected)
        await expect(link, `See all (${what})`).toHaveAttribute('href', href);
      for (const [what, , href] of expected) {
        await test.step(`See all (${what}) -> ${href}`, async () => {
          const response = await page.goto(href);
          expect(response?.status(), `${href} answered ${response?.status()}`).toBe(200);
          await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
        });
      }
    });
  },
);

test.describe('Home deals', { tag: '@home' }, () => {
  test(
    'deal cards show the running deals with title, name and end date',
    { tag: ['@smoke', '@pricing'] },
    async ({ homePage, api }) => {
      const active = await api.promotions.active();
      test.skip(!active.length, 'No deal is running, so the Deals band has nothing to show');
      const shown = active.slice(0, homeData.maxDealCards);

      await homePage.open();
      await expect(homePage.deals.visibleCards, 'Cards on screen on desktop').toHaveCount(shown.length);
      expect(
        await homePage.deals.hrefs(homePage.deals.cards),
        'All deal cards in the band (mobile scrolls through them)',
      ).toEqual(active.map((promotion) => `/deals/${promotion.slugEn}`));
      for (const [index, promotion] of shown.entries()) {
        const card = homePage.deals.card(index);
        expect(await card.slug(), `Deal card ${index + 1}`).toBe(promotion.slugEn);
        const expected = [promotionTitle(promotion), promotion.name];
        if (promotion.endsAt) expected.push(endsLabel(promotion.endsAt));
        expect(await card.lines()).toEqual(expected);
      }
    },
  );

  test('expired deals are never shown', { tag: '@pricing' }, async ({ homePage, api }) => {
    const all = await json<import('../../api').Promotion[]>(api.promotions.list());
    const activeSlugs = new Set((await api.promotions.active()).map((promotion) => promotion.slugEn));
    const expired = all.filter((promotion) => !activeSlugs.has(promotion.slugEn)).map((p) => p.slugEn);
    await homePage.open();
    const slugs = await homePage.deals.hrefs(homePage.deals.cards);
    for (const href of slugs) {
      const slug = href.replace('/deals/', '');
      expect(
        activeSlugs.has(slug),
        `Deal card ${slug} is not an active deal (expired: ${expired.join(', ') || 'none'})`,
      ).toBe(true);
    }
  });

  test('a deal card opens its deal page', { tag: '@regression' }, async ({ page, homePage, api }) => {
    const [first] = await api.promotions.active();
    test.skip(!first, 'No deal is running');
    await homePage.open();
    await clickToNavigate(page, homePage.deals.cards.first(), new RegExp(`/deals/${first.slugEn}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(promotionTitle(first));
  });
});

test.describe('Home product rows', { tag: '@home' }, () => {
  test(
    'Featured is selected by default and lists the featured products, every card following the card rules',
    {
      tag: '@smoke',
    },
    async ({ homePage, api }) => {
      const featured = await api.products.firstPage('featured:desc', homeData.productRows.featured);
      await homePage.open();
      const tabs = homePage.productTabs;
      await expect(tabs.featuredTab).toHaveAttribute('aria-selected', 'true');
      await expect(tabs.bestPricesTab).toHaveAttribute('aria-selected', 'false');
      await expect(tabs.cards).toHaveCount(featured.length);
      const cards = await tabs.all();
      expect(await Promise.all(cards.map((card) => card.name()))).toEqual(featured.map((p) => p.name));
      const bySlug = await api.products.bySlugs(await Promise.all(cards.map((card) => card.slug())));
      for (const card of cards) await expectCardFollowsRules(card, bySlug.get(await card.slug()) as Product);
      await expectEqualHeights(cards);
    },
  );

  test(
    'Best prices tab switches the products, the styling and the See all link',
    { tag: '@smoke' },
    async ({ homePage, api }) => {
      const cheapest = await api.products.firstPage('price:asc', homeData.productRows.bestPrices);
      await homePage.open();
      const tabs = homePage.productTabs;
      const featuredNames = await Promise.all((await tabs.all()).map((card) => card.name()));
      const inactiveColour = await tabs.bestPricesTab.evaluate((element) => getComputedStyle(element).color);

      await tabs.select(tabs.bestPricesTab);
      await expect(tabs.featuredTab).toHaveAttribute('aria-selected', 'false');
      await expect(tabs.cards).toHaveCount(cheapest.length);
      const names = await Promise.all((await tabs.all()).map((card) => card.name()));
      expect(names).toEqual(cheapest.map((p) => p.name));
      expect(names, 'Switching tabs did not change the products').not.toEqual(featuredNames);
      const activeColour = await tabs.bestPricesTab.evaluate((element) => getComputedStyle(element).color);
      expect(activeColour, 'The selected tab looks the same as an unselected one').not.toBe(inactiveColour);
      await expect(tabs.seeAllLink).toHaveAttribute('href', '/products?sortBy=price&sortDirection=asc');

      const cards = await tabs.all();
      const bySlug = await api.products.bySlugs(await Promise.all(cards.map((card) => card.slug())));
      for (const card of cards) await expectCardFollowsRules(card, bySlug.get(await card.slug()) as Product);
    },
  );

  test('the tabs can be switched with the keyboard', { tag: '@regression' }, async ({ homePage }) => {
    await homePage.open();
    const tabs = homePage.productTabs;
    await tabs.featuredTab.focus();
    await expect(tabs.featuredTab).toBeFocused();
    await tabs.featuredTab.press('ArrowRight');
    await expect(tabs.bestPricesTab).toBeFocused();
    await tabs.bestPricesTab.press('Enter');
    await expect(tabs.bestPricesTab).toHaveAttribute('aria-selected', 'true');
    await tabs.bestPricesTab.press('ArrowLeft');
    await tabs.featuredTab.press('Enter');
    await expect(tabs.featuredTab).toHaveAttribute('aria-selected', 'true');
  });

  test(
    'Trending now shows five products, every card following the card rules',
    { tag: '@regression' },
    async ({ homePage, api }) => {
      await homePage.open();
      const row = homePage.trending;
      await expect(row.cards).toHaveCount(homeData.productRows.trending);
      const cards = await row.all();
      const bySlug = await api.products.bySlugs(await Promise.all(cards.map((card) => card.slug())));
      for (const card of cards) await expectCardFollowsRules(card, bySlug.get(await card.slug()) as Product);
      await expectEqualHeights(cards);
    },
  );

  test(
    'clicking a card opens the product page with the same name and price',
    { tag: '@smoke' },
    async ({ page, homePage }) => {
      await homePage.open();
      const card = homePage.productTabs.card(0);
      const name = await card.name();
      const { price } = await card.prices();
      await clickToNavigate(page, card.nameLink, new RegExp(`/products/${await card.slug()}$`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
      const shown = page
        .getByRole('main')
        .getByRole('paragraph')
        .filter({ hasText: /\d+\.\d{2}/ })
        .first();
      expect(parseMoney(((await readableText(shown)).match(/\d[\d,]*\.\d{2}/) ?? [''])[0])).toBeCloseTo(
        price,
        2,
      );
    },
  );

  test(
    'a guest who taps a heart is asked to sign in, and "+" adds to the cart without signing in',
    { tag: ['@regression', '@states'] },
    async ({ homePage, signInDialog }) => {
      await homePage.open();
      const card = homePage.productTabs.card(0);
      await homePage.header.clickUntil(
        card.wishlistButton,
        signInDialog.anyStep,
        'Sign-in dialog after tapping the heart',
      );
      await homePage.header.banner.page().keyboard.press('Escape');
      await expect(signInDialog.anyStep).toBeHidden();
      await homePage.header.clickUntil(
        card.addButton,
        homePage.header.cartButtonWithLines,
        'The product in the header cart after tapping +',
      );
      await expect(signInDialog.anyStep).toBeHidden();
    },
  );
});

test.describe('Home request-an-item call to action', { tag: ['@home', '@regression'] }, () => {
  test('heading and text render and the link opens the same form as the header link', async ({
    page,
    homePage,
  }) => {
    await homePage.open();
    const cta = homePage.requestItem;
    await expect(cta.heading).toBeVisible();
    await expect(cta.link).toContainText(homeData.requestCta.text);
    await expect(cta.link).toContainText('Request an item');
    await expect(cta.link).toHaveAttribute(
      'href',
      (await homePage.header.requestItemLink.getAttribute('href')) ?? '',
    );
    await clickToNavigate(page, cta.link, /\/request$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Request an item' })).toBeVisible();
  });

  test('the request form names each missing required field', async ({ page }) => {
    await page.goto('/request');
    await page.getByRole('button', { name: 'Add request to cart' }).click();
    await expect(page.getByRole('textbox', { name: 'Item name' })).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('combobox', { name: 'Country of origin' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(page.getByRole('radiogroup', { name: 'Budget per unit' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(page.getByRole('alert').filter({ hasText: 'This field is required' })).toHaveCount(2);
    await expect(page.getByRole('alert').filter({ hasText: 'Choose a budget' })).toHaveCount(1);
  });
});

test.describe('Home footer', { tag: ['@home', '@regression'] }, () => {
  test('logo, tagline and app-store badges', async ({ homePage }) => {
    await homePage.open();
    const footer = homePage.footer;
    await expect(footer.brandName).toBeVisible();
    await expect(footer.tagline).toHaveText(homeData.footer.tagline);
    for (const badge of [footer.appStoreLink, footer.googlePlayLink]) {
      await expect(badge).toHaveAttribute('href', homeData.footer.appDownloadUrl);
      await expect(badge, 'App badge should open in a new tab').toHaveAttribute('target', '_blank');
      await expect(badge).toHaveAttribute('rel', /noopener/);
    }
  });

  test('Shop, Baskets, Deals and Countries columns link to the right pages', async ({ homePage, api }) => {
    const [categories, baskets, deals, countries] = await Promise.all([
      json<Category[]>(api.categories.list()),
      json<Basket[]>(api.baskets.list()),
      api.promotions.active(),
      json<Country[]>(api.countries.list()),
    ]);
    await homePage.open();
    const footer = homePage.footer;
    const categoryId = new Map(categories.map((c) => [c.name, c.id]));
    for (const link of await footer.linkList('Shop')) {
      expect.soft(link.href, `Shop: ${link.name}`).toBe(`/products/categories/${categoryId.get(link.name)}`);
    }
    await expect
      .poll(() => footer.linkList('Baskets'))
      .toEqual([
        ...baskets.map((basket) => ({ name: basket.name, href: `/baskets/${basket.slug}` })),
        { name: 'All baskets', href: '/baskets' },
      ]);
    await expect
      .poll(() => footer.linkList('Deals'))
      .toEqual(deals.map((deal) => ({ name: deal.name, href: `/deals/${deal.slugEn}` })));
    const countryId = new Map(countries.map((c) => [c.name, c.id]));
    await expect
      .poll(() => footer.linkList('Countries'))
      .toEqual(
        homeData.footer.countries.map((name) => ({
          name,
          href: `/products/countries/${countryId.get(name)}`,
        })),
      );
  });

  test('Help, Company and legal links point to their pages and every footer page answers 200', async ({
    page,
    homePage,
  }) => {
    await homePage.open();
    const footer = homePage.footer;
    await expect
      .poll(() => footer.linkList('Help'))
      .toEqual(homeData.footer.help.map(({ name, path }) => ({ name, href: path })));
    await expect
      .poll(() => footer.linkList('Company'))
      .toEqual(homeData.footer.company.map(({ name, path }) => ({ name, href: path })));
    for (const { name, path } of homeData.footer.legal) {
      await expect(footer.legalLink(name)).toHaveAttribute('href', path);
    }

    const internal = await footer.root
      .locator('a[href^="/"]')
      .evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute('href') ?? ''))]);
    for (const href of internal) {
      const response = await page.request.get(`${env.baseUrl}${href}`);
      expect.soft(response.status(), `${href} answered ${response.status()}`).toBe(200);
      expect
        .soft(new URL(response.url()).pathname, `${href} redirected somewhere else`)
        .toBe(href.split('?')[0]);
    }
  });

  test('social links open the right accounts in a new tab, safely', async ({ homePage }) => {
    await homePage.open();
    for (const { name, url } of homeData.footer.social) {
      const link = homePage.footer.socialLink(name);
      await expect(link, `${name} link`).toHaveAttribute('href', url);
      await expect(link, `${name} should open in a new tab`).toHaveAttribute('target', '_blank');
      await expect(link, `${name} should use rel="noopener"`).toHaveAttribute('rel', /noopener/);
    }
  });

  test('copyright shows the current year', async ({ homePage }) => {
    const year = Number(new Date().toLocaleString('en-US', { year: 'numeric', timeZone: 'Asia/Dubai' }));
    await homePage.open();
    await expect(homePage.footer.copyright).toHaveText(homeData.footer.copyright(year));
  });
});

test.describe('Store update banner', { tag: ['@home', '@regression'] }, () => {
  test('shows the store announcement, including emoji, and Dismiss hides it for the rest of the visit', async ({
    browser,
    page,
    homePage,
    api,
  }) => {
    const info = await json<StoreInfo>(api.info.getInfo());
    test.skip(!info.generalNotice, 'No store announcement is set');
    await homePage.open();
    await expect(homePage.storeBanner.message).toHaveText(info.generalNotice ?? '');

    await homePage.storeBanner.dismissButton.click();
    await expect(homePage.storeBanner.root).toHaveCount(0);
    await page.reload();
    await homePage.expectLoaded();
    await expect(homePage.storeBanner.root, 'The banner came back after a reload').toHaveCount(0);

    await test.step('Record: a new browser session', async () => {
      const context = await browser.newContext({ storageState: env.storageState.guest });
      const fresh = await context.newPage();
      await fresh.goto('/');
      const shown = await fresh.getByRole('region', { name: 'Store update' }).isVisible();
      test.info().annotations.push({
        type: 'behaviour',
        description: `Store banner after Dismiss: hidden after reload; ${shown ? 'shown again' : 'still hidden'} in a new session (kept in sessionStorage).`,
      });
      await context.close();
    });
  });

  test('renders no empty box when there is no announcement', async ({ homePage, api }) => {
    const info = await json<StoreInfo>(api.info.getInfo());
    test.skip(
      !!info.generalNotice,
      'An announcement is set; the empty state can only be checked without one',
    );
    await homePage.open();
    await expect(homePage.storeBanner.root).toHaveCount(0);
  });
});
