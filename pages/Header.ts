import { expect, type Locator, type Page } from '@playwright/test';

/** The site header, present on every storefront page. */
export class Header {
  readonly banner: Locator;
  readonly searchBox: Locator;
  readonly suggestions: Locator;
  /** Suggestions that are products: they show a price. */
  readonly productSuggestions: Locator;
  /** Shown only to guests. */
  readonly signInButton: Locator;
  /** Shown only to signed-in customers ("Hello, <name>"). Opens the account menu. */
  readonly accountButton: Locator;
  readonly accountMenu: Locator;
  readonly cartButton: Locator;
  /** A button for guests (opens sign-in), a link for signed-in customers. */
  readonly wishlist: Locator;
  /** The "Sign out?" confirmation that follows Sign out in the account menu. */
  readonly signOutConfirmation: Locator;

  constructor(private readonly page: Page) {
    this.banner = page.getByRole('banner');
    this.searchBox = this.banner.getByRole('combobox', { name: 'Search products...' });
    this.suggestions = page.getByRole('option');
    this.productSuggestions = this.suggestions
      .filter({ hasNotText: /^(Search for|See all)/ })
      .filter({ hasText: /\d+\.\d{2}/ });
    this.signInButton = this.banner.getByRole('button', { name: 'Sign in' });
    this.accountButton = this.banner.getByRole('button', { name: 'Account' });
    this.accountMenu = page.getByRole('menu', { name: 'Account' });
    this.cartButton = this.banner.getByRole('button', { name: /cart/i });
    this.wishlist = this.banner
      .getByRole('button', { name: 'Wishlist' })
      .or(this.banner.getByRole('link', { name: 'Wishlist' }));
    this.signOutConfirmation = page.getByRole('alertdialog', { name: 'Sign out?' });
  }

  /**
   * Clicks a header control. The page is server-rendered, so a click made before it becomes interactive
   * does nothing: this retries until `opened` shows up.
   */
  async clickUntil(control: Locator, opened: Locator, what: string): Promise<void> {
    await expect(async () => {
      await control.click();
      await expect(opened).toBeVisible({ timeout: 2_000 });
    }, `${what} did not open`).toPass({ timeout: 15_000 });
  }

  /** Types a search term and waits for the suggestion list. */
  async typeSearch(term: string): Promise<void> {
    await expect(async () => {
      await this.searchBox.fill('');
      await this.searchBox.pressSequentially(term);
      await expect(this.suggestions.first()).toBeVisible({ timeout: 3_000 });
    }, 'Search suggestions did not appear after typing in the header search box').toPass({ timeout: 15_000 });
  }

  /** Types a search term and presses Enter, landing on the results page. */
  async search(term: string): Promise<void> {
    await this.typeSearch(term);
    await this.searchBox.press('Enter');
    await this.page.waitForURL(/\/products\?.*searchTerm=/);
  }

  /** Account menu -> Sign out. Stops at the "Sign out?" confirmation. */
  async chooseSignOut(): Promise<void> {
    await this.clickUntil(this.accountButton, this.accountMenu, 'The account menu');
    await this.accountMenu.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(this.signOutConfirmation, 'The "Sign out?" confirmation did not appear').toBeVisible();
  }

  /** Signs out and confirms. */
  async signOut(): Promise<void> {
    await this.chooseSignOut();
    await this.signOutConfirmation.getByRole('button', { name: 'Sign out' }).click();
    await expect(this.signOutConfirmation).toBeHidden();
  }
}
