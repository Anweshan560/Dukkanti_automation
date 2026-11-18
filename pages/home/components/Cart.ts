import { expect, type Locator, type Page } from '@playwright/test';
import { parseMoney, readableText } from '../../../utils/dom';
import { CartLines, DeliveryProgress } from '../../cart/CartLines';

/** The cart drawer ("Your cart") opened from the header or the floating button. */
export class CartDrawer {
  readonly root: Locator;
  readonly closeButton: Locator;
  readonly clearAllButton: Locator;
  /** "2 items" under the drawer title. */
  readonly countLabel: Locator;
  readonly lines: CartLines;
  readonly delivery: DeliveryProgress;
  readonly quickAdds: Locator;
  /** "Go to checkout <total>"; only there once the minimum order is reached. */
  readonly goToCheckout: Locator;
  readonly emptyMessage: Locator;
  readonly startShopping: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('dialog', { name: 'Your cart' });
    this.closeButton = this.root.getByRole('button', { name: 'Close cart' });
    this.clearAllButton = this.root.getByRole('button', { name: 'Clear all' });
    this.countLabel = this.root.getByText(/^\d+ items?$/).first();
    this.lines = new CartLines(page, this.root.getByRole('region', { name: 'Your cart' }));
    this.delivery = new DeliveryProgress(this.root.getByRole('region', { name: 'Delivery' }));
    this.quickAdds = this.root.getByRole('region', { name: 'Quick adds' });
    this.goToCheckout = this.root.getByRole('link', { name: /^Go to checkout/ });
    this.emptyMessage = this.root.getByText('Your cart is empty');
    this.startShopping = this.root.getByRole('link', { name: 'Start shopping' });
  }

  async checkoutAmount(): Promise<number> {
    return parseMoney(await readableText(this.goToCheckout));
  }

  line(productName: string): Locator {
    return this.root.getByRole('group', { name: productName });
  }
}

/** The round "View cart" button pinned to the bottom corner once the cart has something in it. */
export class FloatingCartButton {
  readonly root: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('button', { name: /^Cart \(\d+\)$/ }).filter({ hasText: 'View cart' });
  }

  /** The count in its accessible name, "Cart (2)" -> 2. */
  async lineCount(): Promise<number> {
    const name = (await this.root.getAttribute('aria-label')) ?? '';
    return Number(/\((\d+)\)/.exec(name)?.[1] ?? NaN);
  }

  /** The number painted on its badge. */
  async badgeNumber(): Promise<number> {
    const text = await readableText(this.root);
    return Number(/^\s*(\d+)/.exec(text)?.[1] ?? NaN);
  }

  async expectCount(lines: number): Promise<void> {
    await expect(this.root).toHaveAccessibleName(`Cart (${lines})`);
    await expect.poll(() => this.badgeNumber(), { message: 'Floating cart badge number' }).toBe(lines);
  }
}
