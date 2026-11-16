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
  }
}
