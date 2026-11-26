import { expect, type Locator, type Page } from '@playwright/test';
import { Header } from './Header';

/** Short timeout for "is this page/menu even there?" checks, so a missing element fails in seconds. */
export const FAIL_FAST_TIMEOUT = 7_000;

export abstract class BasePage {
  readonly header: Header;

  constructor(protected readonly page: Page) {
    this.header = new Header(page);
  }

  /** Path of the page, relative to the storefront base URL. */
  protected abstract readonly path: string;
  /** An element that is only visible once this page has loaded. */
  protected abstract readonly ready: Locator;

  async open(): Promise<void> {
    await this.goto(this.path);
    await this.expectLoaded();
  }

  /** Navigates and fails straight away, with a reason, when the storefront did not answer as expected. */
  protected async goto(path: string): Promise<void> {
    const response = await this.page.goto(path, { waitUntil: 'domcontentloaded' });
    const url = this.page.url();
    if (url.includes('cloudflareaccess.com')) {
      throw new Error(
        `Cloudflare Access blocked ${path}. Set CF_ACCESS_CLIENT_ID/CF_ACCESS_CLIENT_SECRET or CF_AUTHORIZATION in .env, then re-run the setup project.`,
      );
    }
    if (response && response.status() >= 400) {
      throw new Error(`Opening ${path} returned HTTP ${response.status()} (${url}).`);
    }
  }

  async expectLoaded(): Promise<void> {
    await expect(
      this.ready,
      `${this.constructor.name} did not load: its main element is missing at ${this.page.url()}`,
    ).toBeVisible({ timeout: FAIL_FAST_TIMEOUT });
    await this.waitForSignedInState();
  }

  /**
   * The page is server-rendered as a guest and only learns about the saved session about a second later
   * (after GET /users/me). A heart or "Add" clicked before that opens the sign-in dialog even for a signed-in
   * customer, so for a saved session wait until the header shows the account button.
   */
  private async waitForSignedInState(): Promise<void> {
    const hasSession = await this.page
      .evaluate(() => Boolean(localStorage.getItem('dukkanti_auth')))
      .catch(() => false);
    // Only the shop header shows the account button. The cart and checkout steps have their own header
    // ("Your cart" with Cart / Details / Pay) without it. Tell them apart by the search box: until
    // GET /users/me answers, the shop header shows neither Sign in nor Account, but the search is there.
    const shopHeader = await this.header.searchBox.count();
    if (!hasSession || shopHeader === 0) return;
    await expect(
      this.header.accountButton,
      'The saved customer session was not picked up: the header never showed the account button',
    ).toBeAttached({ timeout: FAIL_FAST_TIMEOUT });
  }
}
