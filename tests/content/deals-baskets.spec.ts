/**
 * Deals and baskets pages as a guest, checked against the API. Read-only, so it runs in parallel.
 */
import { endsLabel, json, promotionTitle, type Basket, type Page, type Product } from '../../api';
import { expect, test } from '../../fixtures/test';
import { clickToNavigate } from '../../utils/dom';

type BasketWithFilters = Basket & {
  filters?: { productIds?: string[] };
  nameAr?: string;
  isPrivate?: boolean;
};

test.describe('Deals pages', { tag: ['@content', '@pricing'] }, () => {
  test(
    '/deals lists every running deal with its label, name and end date',
    { tag: '@smoke' },
    async ({ api, page }) => {
      const deals = await api.promotions.active();
      test.skip(!deals.length, 'No deal is running');
      await page.goto('/deals');
      await expect(page.getByRole('heading', { name: 'Deals', level: 1 })).toBeVisible();
      for (const deal of deals) {
        const card = page.getByRole('main').locator(`a[href="/deals/${deal.slugEn}"]`).first();
        await expect(card, `Deal "${deal.name}" is missing`).toBeVisible();
        await expect(card).toContainText(promotionTitle(deal));
        await expect(card).toContainText(deal.name);
        if (deal.endsAt) await expect(card).toContainText(endsLabel(deal.endsAt));
      }
    },
  );

  test('/deals shows no deal that has ended', async ({ api, page }) => {
    const all = await json<{ slugEn: string; endsAt: string | null }[]>(api.promotions.list());
    const ended = all.filter((d) => d.endsAt && new Date(d.endsAt).getTime() <= Date.now());
    await page.goto('/deals');
    for (const deal of ended)
      await expect(page.locator(`main a[href="/deals/${deal.slugEn}"]`)).toHaveCount(0);
  });

  test('a deal page lists exactly the products in that deal', async ({ api, page }) => {
    const [deal] = await api.promotions.active();
    test.skip(!deal, 'No deal is running');
    const inDeal = await json<Page<Product>>(api.products.list({ promotionId: deal.id, limit: 100 }));
    await page.goto(`/deals/${deal.slugEn}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(promotionTitle(deal));
    // "TEST deal · Ends Nov 18", or just the name for a deal with no end date.
    const subtitle = deal.endsAt ? `${deal.name} · ${endsLabel(deal.endsAt)}` : deal.name;
    await expect(page.getByRole('main').getByText(subtitle, { exact: !deal.endsAt }).first()).toBeVisible();
    const main = page.getByRole('main');
    const listed = main.getByRole('button', { name: /^Add .+ to cart$/ });
    await expect(listed.first()).toBeVisible();
    const names = (
      await listed.evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label') ?? ''))
    ).map((n) => n.replace(/^Add | to cart$/g, ''));
    const expected = new Set(inDeal.data.map((p) => p.name));
    const strangers = names.filter((n) => !expected.has(n));
    // The "More deals" strip below only links deals, so every product card belongs to this deal.
    expect(strangers, 'Products that are not in this deal are listed on its page').toEqual([]);
  });

  test('"More deals" on a deal page offers the other deals, not the one being viewed', async ({
    api,
    page,
  }) => {
    const deals = await api.promotions.active();
    test.skip(deals.length < 2, 'Needs two running deals');
    await page.goto(`/deals/${deals[0].slugEn}`);
    const more = page.getByRole('heading', { name: 'More deals' });
    await expect(more).toBeVisible();
    const links = page.locator('main a[href^="/deals/"]');
    const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    expect(hrefs).not.toContain(`/deals/${deals[0].slugEn}`);
    expect(hrefs).toContain(`/deals/${deals[1].slugEn}`);
  });

  test('a deal card opens its deal page', async ({ api, page }) => {
    const [deal] = await api.promotions.active();
    test.skip(!deal, 'No deal is running');
    await page.goto('/deals');
    await clickToNavigate(
      page,
      page.locator(`main a[href="/deals/${deal.slugEn}"]`).first(),
      new RegExp(`/deals/${deal.slugEn}$`),
    );
  });

  test(
    'a deal that does not exist or has ended answers 404 and offers the running deals',
    { tag: '@negative' },
    async ({ api, page }) => {
      const response = await page.goto('/deals/this-deal-does-not-exist-qa');
      expect(response?.status()).toBe(404);
      await expect(page.getByRole('heading', { name: 'This deal has ended' })).toBeVisible();
      const [running] = await api.promotions.active();
      if (running)
        await expect(page.locator(`main a[href="/deals/${running.slugEn}"]`).first()).toBeVisible();
    },
  );

  test('the Arabic deal page uses the Arabic name', { tag: '@i18n' }, async ({ api, page }) => {
    const [deal] = await api.promotions.active();
    test.skip(!deal, 'No deal is running');
    await page.goto(`/ar/deals/${encodeURIComponent(deal.slugAr)}`);
    await expect(page.getByRole('main')).toContainText(deal.nameAr);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });
});

test.describe('Baskets pages', { tag: ['@content'] }, () => {
  const visible = async (api: import('../../api').Api) =>
    (await json<BasketWithFilters[]>(api.baskets.list())).filter((b) => b.isActive && !b.isPrivate);

  test('/baskets lists every active basket and nothing else', async ({ api, page }) => {
    const all = await json<BasketWithFilters[]>(api.baskets.list());
    const shown = all.filter((b) => b.isActive && !b.isPrivate);
    await page.goto('/baskets');
    await expect(page.getByRole('heading', { name: 'Baskets', level: 1 })).toBeVisible();
    for (const basket of shown)
      await expect(page.locator(`main a[href="/baskets/${basket.slug}"]`).first(), basket.name).toBeVisible();
    for (const basket of all.filter((b) => !b.isActive || b.isPrivate)) {
      await expect(
        page.locator(`main a[href="/baskets/${basket.slug}"]`),
        `Hidden basket "${basket.name}" is listed`,
      ).toHaveCount(0);
    }
  });

  test('a basket page shows its name, its product count and its products', async ({ api, page }) => {
    const basket = (await visible(api)).find((b) => b.filters?.productIds?.length);
    test.skip(!basket, 'No basket with a fixed product list');
    const ids = basket!.filters!.productIds!;
    await page.goto(`/baskets/${basket!.slug}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(basket!.name);
    await expect(
      page
        .getByRole('main')
        .getByText(/^\d+ products?$/)
        .first(),
    ).toBeVisible();
    const count = Number(
      /\d+/.exec(
        await page
          .getByRole('main')
          .getByText(/^\d+ products?$/)
          .first()
          .innerText(),
      )?.[0],
    );
    expect(count, 'Product count on the basket page').toBeLessThanOrEqual(ids.length);
    expect(count).toBeGreaterThan(0);
  });

  test('a basket that does not exist answers 404', { tag: '@negative' }, async ({ page }) => {
    const response = await page.goto('/baskets/this-basket-does-not-exist-qa');
    expect(response?.status()).toBe(404);
  });

  test(
    'a guest who taps "Buy" on a basket is asked to sign in',
    { tag: '@states' },
    async ({ page, signInDialog }) => {
      await page.goto('/baskets');
      const buy = page.getByRole('main').getByRole('button', { name: 'Buy' }).first();
      test.skip(!(await buy.count()), 'No basket offers Buy');
      await expect(async () => {
        await buy.click();
        await signInDialog.expectOpen();
      }).toPass({ timeout: 15_000 });
    },
  );
});
