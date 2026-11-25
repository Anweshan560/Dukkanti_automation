import { expect, type Locator, type Page } from '@playwright/test';
import { parseMoney, readableText } from '../utils/dom';

/** The site header, present on every storefront page. */
export class Header {
  readonly banner: Locator;
  readonly logo: Locator;
  readonly searchBox: Locator;
  readonly searchButton: Locator;
  readonly suggestionList: Locator;
  readonly suggestions: Locator;
  /** Suggestions that are products: they show a price. */
  readonly productSuggestions: Locator;
  readonly requestItemLink: Locator;
  /** Shown only to guests. */
  readonly signInButton: Locator;
  /** Shown only to signed-in customers ("Hello, <name>"). Opens the account menu. */
  readonly accountButton: Locator;
  readonly accountMenu: Locator;
  /** Name is "Cart" when empty and "Cart (<lines>)" otherwise. Opens the cart drawer. */
  readonly cartButton: Locator;
  /** The cart button once the cart holds at least one line ("Cart (<lines>)"), for guests too. */
  readonly cartButtonWithLines: Locator;
  /** "1 item" / "3 items" next to the cart icon. */
  readonly cartItemsLabel: Locator;
  readonly cartTotal: Locator;
  /** A button for guests (opens sign-in), a link for signed-in customers. */
  readonly wishlist: Locator;
  /** The "Sign out?" confirmation that follows Sign out in the account menu. */
  readonly signOutConfirmation: Locator;
  /** Phone-sized screens only. */
  readonly menuButton: Locator;
  readonly mobileMenu: Locator;

  constructor(private readonly page: Page) {
    this.banner = page.getByRole('banner');
    this.logo = this.banner.getByRole('link').first();
    this.searchBox = this.banner.getByRole('combobox', { name: 'Search products...' });
    this.searchButton = this.banner.getByRole('search').getByRole('button', { name: 'Search', exact: true });
    this.suggestionList = page.getByRole('listbox', { name: 'Search suggestions' });
    this.suggestions = page.getByRole('option');
    this.productSuggestions = this.suggestions
      .filter({ hasNotText: /^(Search for|See all)/ })
      .filter({ hasText: /\d+\.\d{2}/ });
    this.requestItemLink = this.banner.getByRole('link', { name: 'Request an item' });
    this.signInButton = this.banner.getByRole('button', { name: 'Sign in' });
    this.accountButton = this.banner.getByRole('button', { name: 'Account' });
    this.accountMenu = page.getByRole('menu', { name: 'Account' });
    this.cartButton = this.banner.getByRole('button', { name: /^Cart( \(\d+\))?$/ });
    this.cartButtonWithLines = this.banner.getByRole('button', { name: /^Cart \(\d+\)$/ });
    this.cartItemsLabel = this.cartButton.getByText(/^\d+ items?$/);
    this.cartTotal = this.cartButton.getByText(/^\d[\d,]*\.\d{2}$/);
    this.wishlist = this.banner
      .getByRole('button', { name: 'Wishlist' })
      .or(this.banner.getByRole('link', { name: 'Wishlist' }));
    this.signOutConfirmation = page.getByRole('alertdialog', { name: 'Sign out?' });
    this.menuButton = this.banner.getByRole('button', { name: 'Menu' });
    this.mobileMenu = page.locator('#mobile-navigation').or(page.getByRole('dialog', { name: 'Dukkanti' }));
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

  /** Fills the search box and clicks the Search button instead of pressing Enter. */
  async searchWithButton(term: string): Promise<void> {
    await expect(async () => {
      await this.searchBox.fill(term);
      await this.searchButton.click();
      await expect(this.page).toHaveURL(/\/products\?.*searchTerm=/, { timeout: 3_000 });
    }, 'Clicking Search did not open the results page').toPass({ timeout: 15_000 });
  }

  /** Lines in the cart, from the button's accessible name ("Cart (2)"); 0 when it is just "Cart". */
  async cartLineCount(): Promise<number> {
    const name = (await this.cartButton.getAttribute('aria-label')) ?? '';
    return Number(/\((\d+)\)/.exec(name)?.[1] ?? 0);
  }

  async cartTotalAmount(): Promise<number> {
    return parseMoney(await readableText(this.cartTotal));
  }

  /** Waits until the header cart shows this many lines and this total. */
  async expectCart(lines: number, total: number): Promise<void> {
    await expect(this.cartButton, `Header cart should name ${lines} line(s)`).toHaveAccessibleName(
      lines ? `Cart (${lines})` : 'Cart',
    );
    await expect(this.cartItemsLabel).toHaveText(`${lines} ${lines === 1 ? 'item' : 'items'}`);
    await expect(this.cartTotal).toHaveText(total.toFixed(2));
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
