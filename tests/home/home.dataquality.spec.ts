import { json, type Page as ApiPage, type Product, type StoreInfo } from '../../api';
import { expect, test } from '../../fixtures/test';
import { homeData } from '../../test-data/home';
import { readableText } from '../../utils/dom';
import { knownBug } from '../../utils/knownBug';

test.describe('Home data quality', { tag: ['@home', '@dataquality'] }, () => {
  test('no test, placeholder or broken values appear anywhere on the page', async ({ page, homePage }) => {
    knownBug('home-test-content-visible');
    await homePage.open();
    await expect(homePage.footer.links('Baskets').first()).toBeVisible();
    // innerText of the whole page = what a shopper can read, including the footer menus.
    const text = await page.locator('body').innerText();
    const found = homeData.forbiddenWords.flatMap((word) => {
      const lines = text.split('\n').filter((line) => word.test(line));
      return lines.map((line) => `${word}: "${line.trim()}"`);
    });
    expect(found, `Found on the home page:\n${found.join('\n')}`).toEqual([]);
  });

  test('the footer Shop column lists the same categories as Shop by category', async ({ homePage }) => {
    knownBug('footer-shop-missing-bakery');
    await homePage.open();
    await expect(homePage.categories.tiles.first()).toBeVisible();
    const home = await homePage.categories.labels(homePage.categories.tiles);
    const footer = (await homePage.footer.linkList('Shop')).map((link) => link.name);
    expect(footer).toEqual(home);
  });

  test('footer Countries vs Shop by country: footer is a subset, the gap is reported', async ({
    homePage,
  }) => {
    await homePage.open();
    await expect(homePage.countries.stamps.first()).toBeVisible();
    const home = await homePage.countries.labels(homePage.countries.stamps);
    const footer = (await homePage.footer.linkList('Countries')).map((link) => link.name);
    for (const name of footer)
      expect(home, `Footer country ${name} is not in Shop by country`).toContain(name);
    const missing = home.filter((name) => !footer.includes(name));
    test.info().annotations.push({
      type: 'product-decision',
      description: `Footer lists ${footer.length} countries, Shop by country ${home.length}. Not in the footer: ${missing.join(', ')}`,
    });
  });

  test('every deal card shows a thumbnail for each of its products, up to four', async ({
    homePage,
    api,
  }) => {
    const deals = (await api.promotions.active()).slice(0, homeData.maxDealCards);
    test.skip(!deals.length, 'No deal is running');
    await homePage.open();
    for (const [index, deal] of deals.entries()) {
      const products = await json<ApiPage<Product>>(api.products.list({ promotionId: deal.id, limit: 1 }));
      const expected = Math.min(products.total, homeData.maxDealThumbnails);
      await expect
        .soft(homePage.deals.card(index).thumbnails, `"${deal.name}" has ${products.total} product(s)`)
        .toHaveCount(expected);
    }
  });

  test('link and deal labels use consistent casing', async ({ homePage }) => {
    knownBug('inconsistent-label-casing');
    await homePage.open();
    await expect(homePage.footer.links('Help').first()).toBeVisible();
    const problems: string[] = [];

    // No label written entirely in capitals ("BUY 1 GET 1 FREE").
    const labels = await homePage.footer.root
      .getByRole('link')
      .or(homePage.deals.cards)
      .evaluateAll((links) => links.map((link) => (link.textContent ?? '').trim()));
    for (const label of labels) {
      const letters = label.replace(/[^A-Za-z]/g, '');
      if (letters.length > 3 && letters === letters.toUpperCase()) problems.push(`All capitals: "${label}"`);
    }

    // Within one footer column, either every label is Sentence case or every label is Title Case.
    for (const column of ['Help', 'Company'] as const) {
      const names = (await homePage.footer.linkList(column)).map((link) => link.name);
      const style = (name: string) => {
        const rest = name
          .split(/\s+/)
          .slice(1)
          .filter(
            (word) => /^[A-Za-z]/.test(word) && !['on', 'of', 'and', 'us'].includes(word.toLowerCase()),
          );
        if (!rest.length) return 'any';
        return rest.every((word) => /^[A-Z]/.test(word)) ? 'Title' : 'Sentence';
      };
      const styles = new Set(names.map(style).filter((s) => s !== 'any'));
      // "Us" counts: "About Us" next to "Contact us".
      const us = names.filter((name) => /\bus$/i.test(name)).map((name) => name.split(' ').pop());
      if (styles.size > 1 || new Set(us).size > 1)
        problems.push(`${column}: mixed casing in ${names.join(' / ')}`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('the store announcement does not contradict the same-day delivery promise', async ({
    homePage,
    api,
  }) => {
    const info = await json<StoreInfo>(api.info.getInfo());
    const paused = /paus|suspend|no deliver|closed|resume/i.test(info.generalNotice ?? '');
    test.skip(!paused, 'The current announcement does not mention a pause');
    knownBug('notice-conflicts-with-same-day-badge');
    await homePage.open();
    await expect(homePage.storeBanner.message).toBeVisible();
    await expect(
      homePage.hero.badge(homeData.hero.sameDayBadge),
      `Banner says "${info.generalNotice}" while the hero still promises same-day delivery`,
    ).toHaveCount(0);
  });

  test('"Return Policy" (Help) and "Refund Policy" (bottom bar) are different pages', async ({ page }) => {
    const read = async (path: string) => {
      await page.goto(path);
      const main = page.getByRole('main');
      await expect(main.getByRole('heading', { level: 1 })).toBeVisible();
      return {
        heading: await main.getByRole('heading', { level: 1 }).innerText(),
        body: await main.innerText(),
      };
    };
    const returns = await read('/return');
    const refund = await read('/refund');
    test.info().annotations.push({
      type: 'content',
      description: `/return: "${returns.heading}" (${returns.body.length} chars); /refund: "${refund.heading}" (${refund.body.length} chars)`,
    });
    expect(returns.body, '/return and /refund show the same text: one of the links is a duplicate').not.toBe(
      refund.body,
    );
  });

  test('the threshold bar and the hero badge use the store free-delivery amount', async ({
    homePage,
    api,
  }) => {
    const info = await json<StoreInfo>(api.info.getInfo());
    await homePage.open();
    const badge = homePage.hero.root.getByText(new RegExp(`^${homeData.hero.freeDeliveryBadge}`));
    await expect
      .poll(() => readableText(badge))
      .toBe(`${homeData.hero.freeDeliveryBadge} ${info.deliveryCutOff}`);
    await homePage.thresholdBar.openInfo();
    await expect(homePage.thresholdBar.infoDialog).toContainText(
      `Orders start from AED ${info.minOrderAmount}`,
    );
    test.info().annotations.push({
      type: 'behaviour',
      description: `The bar counts down to the minimum order (AED ${info.minOrderAmount}) first, then to free delivery (AED ${info.deliveryCutOff}). The hero badge shows the free-delivery amount.`,
    });
  });
});
