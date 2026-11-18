import { expect, type Locator, type Page } from '@playwright/test';
import { readableText } from '../../../utils/dom';

/**
 * The strip under the header: "<amount> more and you're good to go" with an orange progress line.
 * Clicking it opens "Here's how delivery works".
 */
export class ThresholdBar {
  readonly message: Locator;
  readonly progress: Locator;
  /** Only shown once delivery is free. */
  readonly checkoutLink: Locator;
  readonly infoDialog: Locator;

  constructor(page: Page) {
    const banner = page.getByRole('banner');
    // The only header button that opens a dialog. Needs a data-testid: its name changes with the cart.
    this.message = banner.locator('button[aria-haspopup="dialog"]');
    this.progress = banner.getByRole('progressbar');
    this.checkoutLink = banner.getByRole('link', { name: 'Checkout' });
    this.infoDialog = page.getByRole('dialog').filter({ hasText: "Here's how delivery works" });
  }

  /** The message as read on screen, with the animated amount resolved: "38 more and you're good to go". */
  async text(): Promise<string> {
    return readableText(this.message);
  }

  async expectText(expected: string): Promise<void> {
    await expect.poll(() => this.text(), { message: 'Threshold bar message' }).toBe(expected);
  }

  async progressPercent(): Promise<number> {
    return Number(await this.progress.getAttribute('aria-valuenow'));
  }

  async openInfo(): Promise<void> {
    await expect(async () => {
      await this.message.click();
      await expect(this.infoDialog).toBeVisible({ timeout: 2_000 });
    }, 'The delivery info dialog did not open').toPass({ timeout: 15_000 });
  }
}
