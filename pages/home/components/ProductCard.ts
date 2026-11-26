import { expect, type Locator } from '@playwright/test';
import { parseMoney } from '../../../utils/dom';

/**
 * One product tile (home rows, listings, drawer suggestions).
 *
 * There is no data-testid on the tile: its root is the element whose picture area holds the wishlist
 * heart (a toggle button). Reported as a testability gap.
 */
// The heart is the only toggle (aria-pressed) in a card's picture area; works in English and Arabic.
export const PRODUCT_CARD_SELECTOR = 'div:has(> div > button[aria-pressed])';

export class ProductCard {
  readonly wishlistButton: Locator;
  readonly imageLink: Locator;
  readonly image: Locator;
  readonly nameLink: Locator;
  readonly expressBadge: Locator;
  /** "Brand · Country". Products in a deal show the deal label in its place. */
  readonly metaLine: Locator;
  /** Every amount on the card: the selling price, then the struck-through original when discounted. */
  readonly amounts: Locator;
  readonly addButton: Locator;
  readonly increaseButton: Locator;
  /** At quantity 1 the minus button is called "Remove", above that "Decrease quantity". */
  readonly decreaseButton: Locator;

  constructor(readonly root: Locator) {
    this.wishlistButton = root.getByRole('button', { name: /^Save or unsave / });
    this.imageLink = root.locator('a[href^="/products/"]').first();
    this.image = this.imageLink.locator('img');
    this.nameLink = root.locator('a[href^="/products/"]').nth(1);
    this.expressBadge = root.getByText('Express', { exact: true });
    this.metaLine = root.getByText(/ · /);
    // Leaves out the amounts printed on deal-pack buttons ("Add to cart: 4  3.00  4.00").
    this.amounts = root.locator('span:not(button *)').filter({ hasText: /^\d[\d,]*\.\d{2}$/ });
    this.addButton = root.getByRole('button', { name: /^Add .+ to cart$/ });
    this.increaseButton = root.getByRole('button', { name: 'Increase quantity' });
    this.decreaseButton = root.getByRole('button', { name: /^(Remove|Decrease quantity)$/ });
  }

  async name(): Promise<string> {
    const label = (await this.wishlistButton.getAttribute('aria-label')) ?? '';
    return label.replace(/^Save or unsave /, '');
  }

  /** The product slug from the card link: `/products/<slug>`. */
  async slug(): Promise<string> {
    const href = (await this.nameLink.getAttribute('href')) ?? '';
    return href.replace(/^\/products\//, '').split(/[?#]/)[0];
  }

  /** The selling price and, when discounted, the struck-through original price. */
  async prices(): Promise<{ price: number; original: number | null; texts: string[] }> {
    const found = await this.amounts.evaluateAll((elements) =>
      elements.map((element) => ({
        text: (element.textContent ?? '').trim(),
        struck: getComputedStyle(element).textDecorationLine.includes('line-through'),
      })),
    );
    const selling = found.find((entry) => !entry.struck);
    const struck = found.find((entry) => entry.struck);
    if (!selling) throw new Error(`No selling price on the card for "${await this.name()}"`);
    return {
      price: parseMoney(selling.text),
      original: struck ? parseMoney(struck.text) : null,
      texts: found.map((entry) => entry.text),
    };
  }

  /** The number between the stepper buttons. */
  quantity(): Locator {
    return this.root.getByText(/^\d+$/).filter({ visible: true }).last();
  }

  async isWishlisted(): Promise<boolean> {
    return (await this.wishlistButton.getAttribute('aria-pressed')) === 'true';
  }

  async expectWishlisted(saved: boolean): Promise<void> {
    await expect(this.wishlistButton).toHaveAttribute('aria-pressed', String(saved));
  }
}

/** All product cards inside a container, in display order. */
export function productCards(container: Locator): Locator {
  return container.locator(PRODUCT_CARD_SELECTOR);
}
