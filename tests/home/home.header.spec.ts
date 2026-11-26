import {
  json,
  type Address,
  type Basket,
  type Category,
  type Page,
  type Product,
  type User,
} from '../../api';
import { promotionTitle } from '../../api/PromotionsApi';
import { env } from '../../config/env';
import { expect, test } from '../../fixtures/test';
import { homeData } from '../../test-data/home';
import { knownBug } from '../../utils/knownBug';

/** The heading of the results page for a search term. */
const resultsHeading = (term: string): string => `Results for “${term}”`;

test.describe('Home header', { tag: '@home' }, () => {
  test.describe('logo and search', () => {
    test(
      'logo is named "Dukkanti" and brings the visitor home from another page',
      { tag: '@smoke' },
      async ({ page, homePage }) => {
        await page.goto('/products');
        await expect(homePage.header.logo).toHaveAccessibleName('Dukkanti');
        await expect(homePage.header.logo).toHaveAttribute('href', '/');
        await expect(async () => {
          await homePage.header.logo.click();
          await expect(page).toHaveURL(`${env.baseUrl}/`, { timeout: 3_000 });
        }).toPass({ timeout: 15_000 });
        await homePage.expectLoaded();
      },
    );

    test('search box shows the agreed placeholder', { tag: '@smoke' }, async ({ homePage }) => {
      await homePage.open();
      await expect(homePage.header.searchBox).toHaveAttribute('placeholder', homeData.search.placeholder);
    });

    test(
      'Search button submits the search like Enter does',
      { tag: '@smoke' },
      async ({ homePage, productListPage }) => {
        const term = homeData.search.byProduct;
        await homePage.open();
        await homePage.header.searchWithButton(term);
        await expect(productListPage.heading).toHaveText(resultsHeading(term));
        expect(await productListPage.totalResults()).toBeGreaterThan(0);
      },
    );

    for (const [kind, term, bug] of [
      ['a product', homeData.search.byProduct, undefined],
      ['a brand', homeData.search.byBrand, undefined],
      ['a country', homeData.search.byCountry, 'search-country-relevance'],
      ['Arabic text', homeData.search.arabic, undefined],
    ] as const) {
      test(
        `searching for ${kind} ("${term}") lists matching products`,
        { tag: '@regression' },
        async ({ homePage, productListPage, api }) => {
          if (bug) knownBug(bug);
          const expected = await json<Page<Product>>(api.products.list({ searchTerm: term, limit: 5 }));
          expect(expected.total, `The API itself finds nothing for "${term}"`).toBeGreaterThan(0);

          await homePage.open();
          await homePage.header.search(term);
          await expect(productListPage.heading).toHaveText(resultsHeading(term));
          await productListPage.expectTotalResults(expected.total);

          // Relevance: the first result mentions the term in its name, brand, country or category.
          const first = expected.data[0];
          const haystack = [
            first.name,
            first.nameAr,
            first.brand?.name,
            first.country?.name,
            first.category?.name,
            ...first.categories.map((category) => category.name),
            ...first.subCategories.map((sub) => sub.name),
          ]
            .join(' ')
            .toLowerCase();
          expect(haystack, `First result "${first.name}" does not relate to "${term}"`).toContain(
            term.toLowerCase(),
          );
        },
      );
    }

    test(
      'an empty search does not leave the home page',
      { tag: '@regression' },
      async ({ page, homePage }) => {
        await homePage.open();
        await homePage.header.searchBox.fill('');
        await homePage.header.searchButton.click();
        await homePage.header.searchBox.press('Enter');
        await expect(page).toHaveURL(`${env.baseUrl}/`);
        await homePage.expectLoaded();
      },
    );

    test(
      'whitespace-only, very long and special-character searches open a working results page',
      {
        tag: '@regression',
      },
      async ({ productListPage }) => {
        for (const term of ['   ', 'x'.repeat(300), homeData.search.special]) {
          await test.step(`Search for ${JSON.stringify(term.length > 20 ? `${term.slice(0, 20)}…` : term)}`, async () => {
            await productListPage.openSearch(term);
            await expect(productListPage.resultCount.or(productListPage.emptyMessage).first()).toBeVisible();
          });
        }
      },
    );

    test(
      'a script typed into search is shown as text and never runs',
      { tag: '@regression' },
      async ({ page, homePage, productListPage }) => {
        const dialogs: string[] = [];
        page.on('dialog', async (dialog) => {
          dialogs.push(dialog.message());
          await dialog.dismiss();
        });
        await homePage.open();
        await homePage.header.searchWithButton(homeData.search.xss);
        await expect(productListPage.heading).toHaveText(resultsHeading(homeData.search.xss));
        expect(dialogs, 'An alert() ran: the search term was executed as script').toEqual([]);
        const injected = await page.evaluate(
          () =>
            [...document.querySelectorAll('script')].filter((s) => s.textContent?.includes('alert(1)'))
              .length,
        );
        expect(injected, 'The search term was inserted into the page as a <script> element').toBe(0);
      },
    );

    test(
      'a nonsense search shows the no-results state',
      { tag: '@regression' },
      async ({ homePage, productListPage }) => {
        await homePage.open();
        await homePage.header.searchWithButton(homeData.search.noResults);
        await productListPage.expectTotalResults(0);
        await expect(productListPage.emptyMessage).toBeVisible();
      },
    );

    test(
      'suggestions can be walked with the arrow keys and Enter opens the highlighted one',
      {
        tag: '@regression',
      },
      async ({ page, homePage }) => {
        await homePage.open();
        await homePage.header.typeSearch('rice');
        await expect(homePage.header.suggestionList).toBeVisible();

        const box = homePage.header.searchBox;
        await box.press('ArrowDown');
        const firstActive = await box.getAttribute('aria-activedescendant');
        await box.press('ArrowDown');
        const secondActive = await box.getAttribute('aria-activedescendant');
        expect(firstActive, 'ArrowDown did not highlight a suggestion').toBeTruthy();
        expect(secondActive, 'The second ArrowDown did not move the highlight').not.toBe(firstActive);

        const highlighted = page.locator(`[id="${secondActive}"]`);
        await expect(highlighted).toHaveRole('option');
        const label = ((await highlighted.textContent()) ?? '').trim();
        await box.press('Enter');
        await expect(page).not.toHaveURL(`${env.baseUrl}/`);
        await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toContainText(label);
      },
    );
  });

  test.describe('guest controls', () => {
    test(
      'a guest sees Sign in and an empty cart, and no greeting',
      { tag: ['@smoke', '@states'] },
      async ({ homePage }) => {
        await homePage.open();
        await expect(homePage.header.signInButton).toBeVisible();
        await expect(homePage.header.accountButton).toHaveCount(0);
        await homePage.header.expectCart(0, 0);
      },
    );

    test('"Request an item" opens the request form', { tag: '@smoke' }, async ({ page, homePage }) => {
      await homePage.open();
      await homePage.header.requestItemLink.click();
      await expect(page).toHaveURL(/\/request$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Request an item' })).toBeVisible();
    });
  });

  test.describe('signed-in controls', () => {
    test.use({ storageState: env.storageState.customer });

    test(
      'greeting shows the initials and first name from the profile',
      { tag: ['@smoke', '@states'] },
      async ({ homePage, customerApi }) => {
        const me = await json<User>(customerApi.users.me());
        const initials = `${me.firstName?.[0] ?? ''}${me.lastName?.[0] ?? ''}`.toUpperCase();

        await homePage.open();
        const account = homePage.header.accountButton;
        await expect(account).toBeVisible();
        await expect(account.getByText(initials, { exact: true })).toBeVisible();
        await expect(account.getByText('Hello,', { exact: true })).toBeVisible();
        await expect(account.getByText(me.firstName ?? '', { exact: true })).toBeVisible();
        await expect(homePage.header.signInButton).toHaveCount(0);
      },
    );

    test(
      'account menu lists the customer pages and opens them',
      { tag: '@regression' },
      async ({ page, homePage }) => {
        await homePage.open();
        await homePage.header.clickUntil(
          homePage.header.accountButton,
          homePage.header.accountMenu,
          'The account menu',
        );
        const menu = homePage.header.accountMenu;
        for (const item of ['Orders', 'Addresses', 'Wishlist', 'My coupons', 'Sign out']) {
          await expect(menu.getByRole('menuitem', { name: item, exact: true }).first()).toBeVisible();
        }
        await menu.getByRole('menuitem', { name: 'Orders', exact: true }).first().click();
        await expect(page).toHaveURL(/\/account\/orders/);
      },
    );

    test(
      'wishlist heart in the header opens the wishlist page',
      { tag: '@smoke' },
      async ({ page, homePage }) => {
        await homePage.open();
        await homePage.header.wishlist.click();
        await expect(page).toHaveURL(/\/account\/wishlist/);
        await expect(page.getByRole('heading', { level: 1, name: 'Wishlist' })).toBeVisible();
      },
    );

    test(
      'delivery location shows a saved address and opens the address book',
      { tag: '@regression' },
      async ({ page, homePage, customerApi }) => {
        const addresses = await json<Address[]>(customerApi.users.listAddresses());
        test.skip(!addresses.length, 'The test customer has no saved address, so no location is shown');

        await homePage.open();
        const link = homePage.nav.locationLink;
        await expect(link).toBeVisible();
        const shown = ((await link.textContent()) ?? '').trim();
        expect(
          addresses.map((address) => address.nickName),
          'The location is not one of the saved addresses',
        ).toContain(shown);
        await link.click();
        await expect(page).toHaveURL(/\/account\/addresses/);
      },
    );
  });
});

test.describe('Home nav bar', { tag: ['@home', '@regression'] }, () => {
  test('"All categories" lists every category and closes on Esc and on an outside click', async ({
    homePage,
    api,
  }) => {
    const categories = await json<Category[]>(api.categories.list());
    await homePage.open();

    const panel = await homePage.nav.openAllCategories();
    await test.step('Lists every category, in the API order', async () => {
      const names = await panel
        .getByRole('list', { name: 'Categories' })
        .getByRole('button')
        .evaluateAll((buttons) => buttons.map((button) => (button.textContent ?? '').trim()));
      expect(names).toEqual(categories.map((category) => category.name));
    });

    await test.step('Its links point at the first category, its subcategories and all categories', async () => {
      const first = categories[0];
      await expect(panel.getByRole('link', { name: 'All', exact: true })).toHaveAttribute(
        'href',
        `/products/categories/${first.id}`,
      );
      for (const sub of first.subCategories) {
        await expect(panel.getByRole('link', { name: sub.name, exact: true })).toHaveAttribute(
          'href',
          `/products/categories/${first.id}?subCategory=${sub.id}`,
        );
      }
      await expect(panel.getByRole('link', { name: 'All categories' })).toHaveAttribute(
        'href',
        '/categories',
      );
    });

    await test.step('Esc closes it', async () => {
      await homePage.header.banner.page().keyboard.press('Escape');
      await expect(homePage.nav.allCategoriesButton).toHaveAttribute('aria-expanded', 'false');
      await expect(panel).toBeHidden();
    });

    await test.step('A click outside closes it', async () => {
      await homePage.nav.openAllCategories();
      // The open panel covers the top of the page; click in the empty band at the bottom of the screen.
      const viewport = homePage.header.banner.page().viewportSize() ?? { width: 1280, height: 720 };
      await homePage.header.banner.page().mouse.click(viewport.width / 2, viewport.height - 5);
      await expect(homePage.nav.allCategoriesButton).toHaveAttribute('aria-expanded', 'false');
    });
  });

  test('"Baskets" opens on hover with every basket and closes when the mouse leaves', async ({
    page,
    homePage,
    api,
  }) => {
    const baskets = await json<Basket[]>(api.baskets.list());
    await homePage.open();
    const panel = await homePage.nav.hoverOpen(homePage.nav.basketsLink);
    const list = panel.getByRole('list', { name: 'Baskets' });
    for (const basket of baskets) {
      await expect(list.getByRole('link', { name: basket.name, exact: true })).toHaveAttribute(
        'href',
        `/baskets/${basket.slug}`,
      );
    }
    await expect(panel.getByRole('link', { name: 'All baskets' })).toHaveAttribute('href', '/baskets');
    await page.mouse.move(10, 600);
    await expect(homePage.nav.basketsLink).toHaveAttribute('aria-expanded', 'false');
  });

  test('"Deals" opens on hover with every running deal', async ({ homePage, api }) => {
    const deals = await api.promotions.active();
    await homePage.open();
    const panel = await homePage.nav.hoverOpen(homePage.nav.dealsLink);
    const list = panel.getByRole('list', { name: 'Deals' });
    for (const deal of deals) {
      const link = list.locator(`a[href="/deals/${deal.slugEn}"]`);
      await expect(link, `Deal "${deal.name}" is missing from the Deals menu`).toHaveCount(1);
      await expect(link).toContainText(promotionTitle(deal));
      await expect(link).toContainText(deal.name);
    }
  });

  for (const [name, path, ready] of [
    ['Shop by country', '/countries', 'Shop by country'],
    ['Local businesses', '/local-businesses', /Local businesses/],
    ['Help', '/contact', /Contact/],
  ] as const) {
    test(`"${name}" opens ${path}`, async ({ page, homePage }) => {
      await homePage.open();
      const link = homePage.nav.root.getByRole('link', { name, exact: true });
      await expect(link).toHaveAttribute('href', path);
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(ready);
    });
  }

  test('"Track order" asks a guest to sign in first', async ({ page, homePage, signInDialog }) => {
    await homePage.open();
    await expect(homePage.nav.trackOrderLink).toHaveAttribute('href', '/account/orders');
    await homePage.nav.trackOrderLink.click();
    await expect(page).toHaveURL(/\/account\/orders/);
    await expect(signInDialog.anyStep).toBeVisible();
  });

  test('a guest has no delivery location in the nav', { tag: '@states' }, async ({ homePage }) => {
    await homePage.open();
    await expect(homePage.nav.root).toBeVisible();
    await expect(homePage.nav.locationLink).toHaveCount(0);
  });
});
