import { promotionTitle, type Product, type Promotion } from '../../api';
import { expect, test } from '../../fixtures/test';
import type { ProductCard } from '../../pages/home/components/ProductCard';
import { imageLoaded, PRICE_FORMAT, sameMoney } from '../../utils/dom';

/**
 * Checks one product card against the product the API returns for it. Used for every card in the
 * Featured, Best prices and Trending rows.
 */
export async function expectCardFollowsRules(card: ProductCard, product: Product): Promise<void> {
  const name = await card.name();
  await test.step(`Card "${name}"`, async () => {
    expect.soft(name, 'Card name').toBe(product.name);

    // Express badge only on express-delivery products.
    if (product.deliveryType === 'express') {
      await expect.soft(card.expressBadge, `"${name}" is express but has no Express badge`).toBeVisible();
    } else {
      await expect
        .soft(card.expressBadge, `"${name}" is not express but shows the Express badge`)
        .toHaveCount(0);
    }

    // Image: named after the product and actually loaded.
    await card.image.scrollIntoViewIfNeeded();
    await expect.soft(card.image).toHaveAttribute('alt', product.name);
    await expect
      .poll(() => imageLoaded(card.image), { message: `Image of "${name}" did not load` })
      .toBe(true);

    // Name: two lines at most, ending with an ellipsis.
    const clamp = await card.nameLink.evaluate((element) => getComputedStyle(element).webkitLineClamp);
    expect.soft(clamp, `Name of "${name}" is not clamped to 2 lines`).toBe('2');

    // "Brand · Country", or the deal label for products in a deal.
    if (product.promotion) {
      await expect
        .soft(card.root.getByText(promotionTitle(product.promotion as Promotion), { exact: true }))
        .toBeVisible();
    } else if (product.brand && product.country) {
      await expect.soft(card.metaLine).toHaveText(`${product.brand.name} · ${product.country.name}`);
    }

    // Price: two decimals, a dirham symbol, the API price, and the struck-through original when discounted.
    const prices = await card.prices();
    for (const text of prices.texts) expect.soft(text, `Price format on "${name}"`).toMatch(PRICE_FORMAT);
    expect.soft(prices.price, `Selling price of "${name}"`).toBeCloseTo(product.price, 2);
    await expect
      .soft(card.amounts.first().locator('svg'), `No dirham symbol next to the price of "${name}"`)
      .toHaveCount(1);
    const discounted = product.compareAtPrice !== null && product.compareAtPrice > product.price;
    if (discounted) {
      expect
        .soft(prices.original, `Struck-through price of "${name}"`)
        .toBeCloseTo(product.compareAtPrice ?? 0, 2);
    } else {
      expect.soft(prices.original, `"${name}" has no discount but shows a struck-through price`).toBeNull();
    }
    if (discounted && product.promotion?.type === 'percentage_off') {
      const percent = (product.promotion as Promotion).value;
      const expected = Math.round((product.compareAtPrice ?? 0) * (1 - percent / 100) * 100) / 100;
      expect
        .soft(
          sameMoney(prices.price, expected),
          `${percent}% off ${product.compareAtPrice} should be ${expected}, card shows ${prices.price}`,
        )
        .toBe(true);
    }

    // Add button only when in stock.
    if (product.inStock) {
      await expect.soft(card.addButton.or(card.increaseButton).first()).toBeEnabled();
    } else {
      const add = card.addButton;
      const disabled = (await add.count()) === 0 || (await add.isDisabled());
      expect.soft(disabled, `"${name}" is out of stock but can still be added`).toBe(true);
    }
  });
}

/** Cards that sit on the same visual row have the same height. */
export async function expectEqualHeights(cards: ProductCard[]): Promise<void> {
  const boxes = await Promise.all(cards.map(async (card) => card.root.boundingBox()));
  const rows = new Map<number, number[]>();
  for (const box of boxes) {
    if (!box) continue;
    const top = Math.round(box.y);
    rows.set(top, [...(rows.get(top) ?? []), box.height]);
  }
  for (const [top, heights] of rows) {
    const spread = Math.max(...heights) - Math.min(...heights);
    expect(
      spread,
      `Cards in the row at y=${top} have different heights: ${heights.map((h) => h.toFixed(0)).join(', ')}`,
    ).toBeLessThanOrEqual(1);
  }
}
