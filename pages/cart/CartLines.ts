import { expect, type Locator, type Page } from '@playwright/test';
import { parseMoney, readableText } from '../../utils/dom';

/**
 * The list of cart lines ("Tomorrow · 2 items" + one row per product). The same block appears in the
 * cart drawer, on /cart and in the "items in this delivery" dialog.
 *
 * A line is the `group` named after the product (the quantity stepper); its row also holds the product
 * link and the line amount.
 */
export class CartLines {
  /** "Tomorrow · 2 items": the delivery day and the number of lines. */
  readonly heading: Locator;
  readonly steppers: Locator;

  constructor(
    protected readonly page: Page,
    readonly root: Locator,
  ) {
    this.heading = root.getByRole('heading', { level: 2 }).first();
    this.steppers = root.getByRole('group');
  }

  stepper(productName: string): Locator {
    return this.root.getByRole('group', { name: productName, exact: true });
  }

  /** The row of one line: product link, line amount and stepper. */
  row(productName: string): Locator {
    return this.stepper(productName).locator('xpath=..');
  }

  link(productName: string): Locator {
    return this.row(productName).getByRole('link', { name: productName, exact: true });
  }

  increase(productName: string): Locator {
    return this.stepper(productName).getByRole('button', { name: 'Increase quantity' });
  }

  /** "Remove" at quantity 1, "Decrease quantity" above. */
  decrease(productName: string): Locator {
    return this.stepper(productName).getByRole('button', { name: /^(Remove|Decrease quantity)$/ });
  }

  async quantity(productName: string): Promise<number> {
    return Number(await this.stepper(productName).locator('[aria-live="polite"]').innerText());
  }

  async expectQuantity(productName: string, quantity: number): Promise<void> {
    await expect(this.stepper(productName).locator('[aria-live="polite"]')).toHaveText(String(quantity));
  }

  /** The line amount: quantity × price, after any deal. */
  async amount(productName: string): Promise<number> {
    const money = this.row(productName)
      .locator('span:not(button *)')
      .filter({ hasText: /^\d[\d,]*\.\d{2}$/ })
      .first();
    return parseMoney(await readableText(money));
  }

  async expectAmount(productName: string, amount: number): Promise<void> {
    await expect.poll(() => this.amount(productName), { message: `Line amount of ${productName}` }).toBe(amount);
  }

  /** Product names of every line, in the order shown. */
  async names(): Promise<string[]> {
    return this.steppers.evaluateAll((groups) => groups.map((g) => g.getAttribute('aria-label') ?? ''));
  }
}

/** The order summary on /cart and /checkout: Subtotal, VAT, Delivery, Total. */
export class OrderSummary {
  readonly heading: Locator;

  constructor(readonly root: Locator) {
    this.heading = root.getByRole('heading', { name: 'Order summary' });
  }

  private value(label: string | RegExp): Locator {
    return this.root
      .getByText(label, { exact: typeof label === 'string' })
      .first()
      .locator('xpath=following-sibling::span[1]');
  }

  async amount(label: 'Subtotal' | 'Delivery' | 'Total' | 'VAT' | 'Discount' | 'Pay on delivery fee'): Promise<number> {
    const locator = label === 'VAT' ? this.value(/^VAT/) : this.value(label);
    return parseMoney(await readableText(locator));
  }

  /** The VAT label, e.g. "VAT (5%)". */
  vatLabel(): Locator {
    return this.root.getByText(/^VAT \(\d+(\.\d+)?%\)$/);
  }

  async expectAmounts(expected: { subTotal: number; vat: number; deliveryFee: number; total: number }): Promise<void> {
    await expect
      .poll(
        async () => ({
          subTotal: await this.amount('Subtotal'),
          vat: await this.amount('VAT'),
          deliveryFee: await this.amount('Delivery'),
          total: await this.amount('Total'),
        }),
        { message: 'Order summary amounts' },
      )
      .toEqual(expected);
  }
}

/** The "Your delivery" block: delivery day, fee, progress towards the minimum order or free delivery. */
export class DeliveryProgress {
  readonly progressbar: Locator;
  /** Opens the dialog listing the items in this delivery; its badge shows a count. */
  readonly itemsButton: Locator;

  constructor(readonly root: Locator) {
    this.progressbar = root.getByRole('progressbar');
    this.itemsButton = root.getByRole('button', { name: 'See the items in this delivery' });
  }

  /** "42.00 to go" (below minimum) or "120.50 to free delivery". */
  async label(): Promise<string> {
    return ((await this.progressbar.getAttribute('aria-labelledby'))
      ? await readableText(this.root.locator(`[id="${await this.progressbar.getAttribute('aria-labelledby')}"]`))
      : ((await this.progressbar.getAttribute('aria-label')) ?? '')
    ).trim();
  }

  async percent(): Promise<number> {
    return Number(await this.progressbar.getAttribute('aria-valuenow'));
  }

  async badgeCount(): Promise<number> {
    return Number(/\d+/.exec(await readableText(this.itemsButton))?.[0] ?? NaN);
  }
}
