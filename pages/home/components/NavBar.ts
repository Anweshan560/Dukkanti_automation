import { expect, type Locator, type Page } from '@playwright/test';

/** The second header row: category, basket and deal menus, quick links, delivery location and language. */
export class NavBar {
  readonly root: Locator;
  readonly allCategoriesButton: Locator;
  readonly basketsLink: Locator;
  readonly dealsLink: Locator;
  readonly shopByCountryLink: Locator;
  readonly localBusinessesLink: Locator;
  readonly trackOrderLink: Locator;
  readonly helpLink: Locator;
  /** Signed-in customers only: the delivery address nickname, linking to the address book. */
  readonly locationLink: Locator;
  readonly languageButton: Locator;

  constructor(private readonly page: Page) {
    this.root = page.getByRole('banner').getByRole('navigation', { name: 'Categories' });
    this.allCategoriesButton = this.root.getByRole('button', { name: 'All categories' });
    this.basketsLink = this.root.getByRole('link', { name: 'Baskets', exact: true });
    this.dealsLink = this.root.getByRole('link', { name: 'Deals', exact: true });
    this.shopByCountryLink = this.root.getByRole('link', { name: 'Shop by country' });
    this.localBusinessesLink = this.root.getByRole('link', { name: 'Local businesses' });
    this.trackOrderLink = this.root.getByRole('link', { name: 'Track order' });
    this.helpLink = this.root.getByRole('link', { name: 'Help' });
    this.locationLink = this.root.locator('a[href="/account/addresses"]');
    this.languageButton = this.root.getByRole('button', { name: /^Language:/ });
  }

  /** The drop-down panel a menu trigger opens (linked through aria-controls). */
  async panelOf(trigger: Locator): Promise<Locator> {
    const id = await trigger.getAttribute('aria-controls');
    if (!id) throw new Error('The menu trigger has no aria-controls, so its panel cannot be found');
    return this.page.locator(`[id="${id}"]`);
  }

  async openAllCategories(): Promise<Locator> {
    await expect(async () => {
      await this.allCategoriesButton.click();
      await expect(this.allCategoriesButton).toHaveAttribute('aria-expanded', 'true', { timeout: 2_000 });
    }, '"All categories" did not open').toPass({ timeout: 15_000 });
    return this.panelOf(this.allCategoriesButton);
  }

  /** Baskets and Deals open on hover. */
  async hoverOpen(trigger: Locator): Promise<Locator> {
    await expect(async () => {
      await this.page.mouse.move(0, 0);
      await trigger.hover();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true', { timeout: 2_000 });
    }, 'The menu did not open on hover').toPass({ timeout: 15_000 });
    return this.panelOf(trigger);
  }
}
