/**
 * Product page as a guest: content against the API, the quantity stepper limits, related products,
 * sharing, and pages that do not exist. Read-only, so it runs in parallel in the `ui` project.
 */
import { json, type Page, type Product } from '../../api';
import { expect, test } from '../../fixtures/test';
import { ProductPage } from '../../pages/product/ProductPage';
import { dealWithProducts, outOfStockProduct, purchasableProducts, round2 } from '../../utils/shop';

const discounted = async (api: import('../../api').Api): Promise<Product> => {
  const page = await json<Page<Product>>(api.products.list({ limit: 100 }));
  const found = page.data.find((p) => p.inStock && p.compareAtPrice && p.compareAtPrice > p.price);
  test.skip(!found, 'No discounted product in the first 100');
  return found as Product;
};

test.describe('Product page', { tag: ['@product'] }, () => {
  test(
    'name, price, country, brand and breadcrumb match the product',
    { tag: '@smoke' },
    async ({ api, page }) => {
      const [product] = await purchasableProducts(api, 1);
      const productPage = new ProductPage(page);
      await productPage.openSlug(product.slugEn);
      await expect(productPage.title).toHaveText(product.name);
      expect(await productPage.priceAmount()).toBe(product.price);
      await expect(page).toHaveTitle(
        new RegExp(product.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 30)),
      );
      const crumbs = productPage.breadcrumb.getByRole('listitem');
      await expect(crumbs.first()).toHaveText('Home');
      await expect(crumbs.last()).toHaveText(product.name);
      if (product.brand) await expect(productPage.brandLink).toHaveText(product.brand.name);
      if (product.country)
        await expect(
          productPage.main.getByRole('link', { name: product.country.name }).first(),
        ).toBeVisible();
    },
  );

  test('the breadcrumb links open the category of the product', async ({ api, page }) => {
    const [product] = await purchasableProducts(api, 1);
    const productPage = new ProductPage(page);
    await productPage.openSlug(product.slugEn);
    const categoryLink = productPage.breadcrumb.getByRole('link').nth(1);
    await expect(categoryLink).toHaveAttribute('href', /^\/products\/categories\//);
    await categoryLink.click();
    await expect(page).toHaveURL(/\/products\/categories\//);
  });

  test(
    'a discounted product shows the old price struck through above the new one',
    { tag: '@pricing' },
    async ({ api, page }) => {
      const product = await discounted(api);
      const productPage = new ProductPage(page);
      await productPage.openSlug(product.slugEn);
      const text = await productPage.main.innerText();
      expect(text).toContain(product.price.toFixed(2));
      expect(text).toContain((product.compareAtPrice as number).toFixed(2));
    },
  );

  test(
    'a product in a deal links to the deal and offers the deal pack at the deal price',
    { tag: '@pricing' },
    async ({ api, page }) => {
      const { promotion, products } = await dealWithProducts(api, 'buy_x_get_y');
      const product = products[0];
      const productPage = new ProductPage(page);
      await productPage.openSlug(product.slugEn);
      await expect(productPage.dealLink).toHaveAttribute('href', `/deals/${promotion.slugEn}`);
      const pack = (promotion.buyQuantity ?? 0) + (promotion.getQuantity ?? 0);
      await expect(productPage.addPack).toHaveAccessibleName(
        new RegExp(
          `^Add pack of ${pack} ${round2((promotion.buyQuantity ?? 0) * product.price).toFixed(2)} ${round2(pack * product.price).toFixed(2)}$`,
        ),
      );
    },
  );

  test(
    'the quantity starts at 1, cannot go below 1, and the Add to cart amount follows it',
    { tag: '@negative' },
    async ({ api, page }) => {
      const [product] = await purchasableProducts(api, 1);
      const productPage = new ProductPage(page);
      await productPage.openSlug(product.slugEn);
      await expect(productPage.quantity).toHaveText('1');
      await expect(productPage.decrease, 'Minus must be disabled at 1').toBeDisabled();
      expect(await productPage.addToCartAmount()).toBe(product.price);
      await productPage.clickUntil(productPage.increase, () =>
        expect(productPage.quantity).toHaveText('2', { timeout: 2_000 }),
      );
      await expect(productPage.decrease).toBeEnabled();
      await expect.poll(() => productPage.addToCartAmount()).toBe(round2(product.price * 2));
      await productPage.increase.click();
      await expect(productPage.quantity).toHaveText('3');
      await productPage.decrease.click();
      await productPage.decrease.click();
      await expect(productPage.quantity).toHaveText('1');
      await expect(productPage.decrease).toBeDisabled();
      expect(await productPage.addToCartAmount()).toBe(product.price);
    },
  );

  test(
    'a guest can add to the cart without signing in, but the heart asks them to sign in',
    { tag: ['@states', '@security'] },
    async ({ api, page, signInDialog }) => {
      const [product] = await purchasableProducts(api, 1);
      const productPage = new ProductPage(page);
      await productPage.openSlug(product.slugEn);
      await productPage.clickUntil(productPage.addToCart, () =>
        expect(productPage.header.cartButtonWithLines).toBeVisible({ timeout: 2_000 }),
      );
      await signInDialog.expectClosed();
      await productPage.heart.click();
      await signInDialog.expectOpen();
    },
  );

  test('related products are other products, and "More …" opens the category', async ({ api, page }) => {
    const [product] = await purchasableProducts(api, 1);
    const productPage = new ProductPage(page);
    await productPage.openSlug(product.slugEn);
    await expect(productPage.relatedHeading).toBeVisible();
    const relatedLinks = productPage.relatedHeading.locator(
      'xpath=following::a[starts-with(@href,"/products/") and not(contains(@href,"/categories/"))]',
    );
    await expect(relatedLinks.first()).toBeVisible();
    const hrefs = await relatedLinks.evaluateAll((links) => links.map((a) => a.getAttribute('href')));
    expect(hrefs, 'The product is listed among its own related products').not.toContain(
      `/products/${product.slugEn}`,
    );
    const more = productPage.main.getByRole('link', { name: /^More / });
    await expect(more).toHaveAttribute('href', /^\/products\/categories\//);
  });

  test('Share copies the product link or opens the share sheet', async ({
    api,
    page,
    context,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Clipboard permissions are only granted in Chromium');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    // Where the browser has a share sheet (Chrome on Windows and phones), the page uses navigator.share,
    // which would open a system window. Record the call instead; the sheet itself is checked by hand.
    await page.addInitScript(() => {
      if ('share' in navigator) {
        Object.defineProperty(navigator, 'share', {
          value: (data: ShareData) => {
            (window as unknown as { __shared: ShareData }).__shared = data;
            return Promise.resolve();
          },
        });
      }
    });
    const [product] = await purchasableProducts(api, 1);
    const productPage = new ProductPage(page);
    await productPage.openSlug(product.slugEn);
    await productPage.share.click();
    await expect
      .poll(
        async () => {
          const shared = await page.evaluate(
            () => (window as unknown as { __shared?: ShareData }).__shared?.url ?? '',
          );
          const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
          const toast = await page
            .getByRole('region', { name: 'Notifications' })
            .innerText()
            .catch(() => '');
          return `${shared} ${clip}`.includes(`/products/${product.slugEn}`) || /copied/i.test(toast);
        },
        { message: 'Share did neither open the share sheet with the product link, nor copy it' },
      )
      .toBe(true);
  });

  test(
    'the page has a description and a social preview for sharing',
    { tag: '@nonfunctional' },
    async ({ api, page }) => {
      const [product] = await purchasableProducts(api, 1);
      await new ProductPage(page).openSlug(product.slugEn);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.{20,}/);
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
        'content',
        new RegExp(product.name.slice(0, 15).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      );
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /^https:\/\//);
    },
  );

  test('the Arabic page shows the Arabic name, right to left', { tag: '@i18n' }, async ({ api, page }) => {
    const [product] = await purchasableProducts(api, 1);
    await page.goto(`/ar/products/${encodeURIComponent(product.slugAr)}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(product.nameAr.trim());
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.goto('/');
    await page.context().clearCookies({ name: 'PARAGLIDE_LOCALE' });
  });

  test(
    'an out-of-stock product says so and cannot be added to the cart',
    { tag: ['@stock', '@states'] },
    async ({ api, page }) => {
      const product = await outOfStockProduct(api);
      const productPage = new ProductPage(page);
      await productPage.openSlug(product.slugEn);
      await expect(productPage.title).toHaveText(product.name);
      expect(await productPage.priceAmount()).toBe(product.price);
      await expect(
        productPage.main.getByRole('button', { name: 'Out of stock', exact: true }),
      ).toBeDisabled();
      await expect(productPage.addToCart).toHaveCount(0);
      await expect(productPage.increase).toHaveCount(0);
    },
  );

  test(
    'a product that does not exist answers 404 with the "Page not found" page',
    { tag: '@negative' },
    async ({ page }) => {
      const response = await page.goto('/products/this-product-does-not-exist-qa');
      expect(response?.status()).toBe(404);
      await expect(page.getByRole('heading', { name: 'Page not found', level: 1 })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
    },
  );
});
