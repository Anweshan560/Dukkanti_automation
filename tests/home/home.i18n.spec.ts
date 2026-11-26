/**
 * Arabic and right-to-left. Runs as a guest so the shared customer's language preference is never changed.
 */
import { json, type Category, type Page as ApiPage, type Product } from '../../api';
import { env } from '../../config/env';
import { expect, test } from '../../fixtures/test';
import { ProductCard, productCards } from '../../pages/home/components/ProductCard';
import { homeData } from '../../test-data/home';
import {
  clickToNavigate,
  hasHorizontalOverflow,
  isClippedWithoutEllipsis,
  PRICE_FORMAT,
} from '../../utils/dom';
import { knownBug } from '../../utils/knownBug';

test.describe('Home in Arabic', { tag: ['@home', '@i18n'] }, () => {
  test(
    'choosing العربية in the header switches to Arabic, right-to-left, and it sticks after a reload',
    {
      tag: '@smoke',
    },
    async ({ page, homePage }) => {
      await homePage.open();
      await homePage.language.choose('ar');
      await expect(page).toHaveURL(/\/ar\/?$/);
      await page.reload();
      await homePage.language.expectLanguage('ar');
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
        'بقالة من الوطن، تصلك حتى باب بيتك.',
      );
    },
  );

  test('links inside the Arabic site keep the visitor in Arabic', async ({ page, homePage }) => {
    await homePage.open();
    await homePage.language.choose('ar');
    await page.goto('/products');
    await expect(page).toHaveURL(/\/ar\/products/);
    await homePage.language.expectLanguage('ar');
    await clickToNavigate(page, homePage.header.logo, /\/ar\/?$/);
    await homePage.language.expectLanguage('ar');
  });

  test('the saved Arabic choice survives typing the home address', async ({ page, homePage }) => {
    knownBug('language-reset-by-home-url');
    await homePage.open();
    await homePage.language.choose('ar');
    await page.goto('/products');
    await expect(page).toHaveURL(/\/ar\/products/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/ar\/?$/);
    await homePage.language.expectLanguage('ar');
  });

  test('the footer العربية button switches to Arabic', async ({ homePage }) => {
    await homePage.open();
    await homePage.language.footerToggle.click();
    await homePage.language.expectLanguage('ar');
  });

  test('the layout is mirrored: logo on the right, menu on the left', async ({ page, homePage }) => {
    await homePage.openArabic();
    const width = page.viewportSize()?.width ?? 1280;
    const logo = await homePage.header.logo.boundingBox();
    const cart = await homePage.header.banner.getByRole('button', { name: /^السلة/ }).boundingBox();
    expect(logo && logo.x > width / 2, 'In Arabic the logo should sit on the right').toBe(true);
    expect(cart && cart.x < width / 2, 'In Arabic the cart should sit on the left').toBe(true);
  });

  test('"→" arrows point the other way in Arabic', async ({ homePage }) => {
    await homePage.openArabic();
    // The request card ends with an arrow icon. Mirrored = drawn flipped horizontally.
    const arrow = homePage.header.banner.page().getByRole('main').locator('a[href="/ar/request"] svg').last();
    // Mirrored either by a negative horizontal scale or by turning it half a circle (Tailwind `rtl:rotate-180`
    // sets the CSS `rotate` property, not `transform`).
    const drawn = await arrow.evaluate((element) => {
      const style = getComputedStyle(element);
      const matrix = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform);
      return { direction: style.direction, scaleX: matrix.a, rotate: style.rotate };
    });
    expect(drawn.direction).toBe('rtl');
    const mirrored = drawn.scaleX < 0 || /^180deg$|^-180deg$/.test(drawn.rotate);
    expect(
      mirrored,
      `The arrow is not mirrored in right-to-left (rotate: ${drawn.rotate}, scaleX: ${drawn.scaleX})`,
    ).toBe(true);
  });

  test('prices keep two decimals and Western digits on the Arabic page', async ({ page, homePage }) => {
    await homePage.openArabic();
    const cards = await productCards(page.getByRole('main').getByRole('tabpanel')).all();
    expect(cards.length).toBeGreaterThan(0);
    for (const root of cards) {
      // The card's price locator only accepts Western digits with two decimals; Arabic-Indic digits
      // (٣٫٥٠) or a missing decimal part would leave it empty.
      const texts = await new ProductCard(root).amounts.allTextContents();
      expect(
        texts.length,
        `A card shows no price in the expected format: "${await root.innerText()}"`,
      ).toBeGreaterThan(0);
      for (const text of texts) expect(text.trim()).toMatch(PRICE_FORMAT);
    }
  });

  test('Arabic text is never cut off mid-word in the header, nav and section titles', async ({
    page,
    homePage,
  }) => {
    await homePage.openArabic();
    expect(await hasHorizontalOverflow(page), 'The Arabic page scrolls sideways').toBe(false);
    const targets = page
      .getByRole('banner')
      .getByRole('link')
      .or(page.getByRole('banner').getByRole('button'))
      .or(page.getByRole('main').getByRole('heading'));
    const clipped: string[] = [];
    for (const element of await targets.filter({ visible: true }).all()) {
      if (await isClippedWithoutEllipsis(element)) clipped.push(((await element.textContent()) ?? '').trim());
    }
    expect(clipped, `Cut-off text: ${clipped.join(' | ')}`).toEqual([]);
  });

  test('searching in Arabic from the Arabic page finds products', async ({ page, homePage, api }) => {
    const term = homeData.search.arabic;
    const expected = await json<ApiPage<Product>>(api.products.list({ searchTerm: term, limit: 1 }));
    await homePage.openArabic();
    const box = page.getByRole('banner').getByRole('combobox');
    await box.fill(term);
    await box.press('Enter');
    await expect(page).toHaveURL(/\/ar\/products\?.*searchTerm=/);
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toContainText(term);
    expect(expected.total).toBeGreaterThan(0);
  });

  test('categories are shown with their Arabic names', async ({ homePage, api }) => {
    const categories = (await json<Category[]>(api.categories.list())).slice(0, homeData.categories.length);
    await homePage.openArabic();
    const tiles = homePage.header.banner
      .page()
      .getByRole('main')
      .locator('a[href^="/ar/products/categories/"]');
    await expect(tiles).toHaveText(categories.map((category) => category.nameAr));
  });

  test('the page title is translated', async ({ page, homePage }) => {
    knownBug('ar-page-title-not-translated');
    await homePage.openArabic();
    await expect(page).not.toHaveTitle('Dukkanti | Your favorite products, delivered');
  });
});

test.describe('"Use browser language"', { tag: ['@home', '@i18n'] }, () => {
  for (const [locale, language] of [
    ['ar-AE', 'ar'],
    ['en-US', 'en'],
  ] as const) {
    test.describe(`with a ${locale} browser`, () => {
      test.use({ locale });

      test(`switches the store to ${language === 'ar' ? 'Arabic' : 'English'}`, async ({
        page,
        homePage,
      }) => {
        // Start from the other language so the switch is visible.
        const other = language === 'ar' ? 'en' : 'ar';
        await page.context().addCookies([{ name: 'PARAGLIDE_LOCALE', value: other, url: env.baseUrl }]);
        await page.goto(other === 'ar' ? '/ar/' : '/');
        await homePage.language.expectLanguage(other);
        await homePage.language.footerBrowserLanguage.click();
        await homePage.language.expectLanguage(language);
      });
    });
  }
});
