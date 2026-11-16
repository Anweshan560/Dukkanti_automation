import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from '../BasePage';

export type SortOption = 'Featured' | 'Price: low to high' | 'Price: high to low' | 'Name: A to Z';

/** `/products` — all products, search results, and category/country/brand listings. */
export class ProductListPage extends BasePage {
  protected readonly path = '/products';
  protected readonly ready: Locator;

  readonly heading: Locator;
  readonly resultCount: Locator;
  readonly sortBy: Locator;
  /** One per product card, in display order. Its name is "Add <product name> to cart". */
  readonly addToCartButtons: Locator;

  /** The filter panel on the left. */
  readonly filters: Locator;
  readonly expressDeliveryToggle: Locator;
  readonly clearAllButton: Locator;

  /** Shown instead of products when nothing matches. */
  readonly emptyMessage: Locator;
  readonly clearFiltersButton: Locator;

  constructor(page: Page) {
    super(page);
    const main = page.getByRole('main');
    this.heading = main.getByRole('heading', { level: 1 });
    this.ready = this.heading;
    this.resultCount = main.getByText(/^[\d,]+ products?$/);
    this.sortBy = main.getByRole('combobox', { name: 'Sort by' });
    this.addToCartButtons = main.getByRole('button', { name: /^Add .+ to cart$/ });

    this.filters = main.getByRole('complementary');
    this.expressDeliveryToggle = this.filters.getByRole('button', { name: 'Express delivery' });
    this.clearAllButton = this.filters.getByRole('button', { name: 'Clear all' });

    this.emptyMessage = main.getByText('Nothing matches these filters');
    this.clearFiltersButton = main.getByRole('button', { name: 'Clear filters' });
  }

  async openSearch(term: string): Promise<void> {
    await this.goto(`${this.path}?searchTerm=${encodeURIComponent(term)}`);
    await this.expectLoaded();
  }

  async openCategory(id: string): Promise<void> {
    await this.goto(`${this.path}/categories/${id}`);
    await this.expectLoaded();
  }

  async openCountry(id: string): Promise<void> {
    await this.goto(`${this.path}/countries/${id}`);
    await this.expectLoaded();
  }

  async openBrand(id: string): Promise<void> {
    await this.goto(`${this.path}/brands/${id}`);
    await this.expectLoaded();
  }

  /** Opens the listing with a raw query string, e.g. `searchTerm=x&countries=egypt`. */
  async openWithQuery(query: string): Promise<void> {
    await this.goto(`${this.path}?${query}`);
    await this.expectLoaded();
  }

  /** The number shown in "287 products". */
  async totalResults(): Promise<number> {
    const text = (await this.resultCount.textContent()) ?? '';
    return Number(text.replace(/[^\d]/g, ''));
  }

  /** Waits until the page says it has exactly this many products. */
  async expectTotalResults(total: number): Promise<void> {
    await expect(this.resultCount, `The page should say ${total} products`).toHaveText(
      new RegExp(`^${total.toLocaleString('en-US').replace(',', ',?')} products?$`),
    );
  }

  /** Product names in the order they are shown. */
  async productNames(): Promise<string[]> {
    const labels = await this.addToCartButtons.evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute('aria-label') ?? button.textContent ?? ''),
    );
    return labels.map((label) => label.replace(/^Add /, '').replace(/ to cart$/, ''));
  }

  categoryChip(name: string): Locator {
    return this.filters.getByRole('button', { name, exact: true });
  }

  countryCheckbox(name: string): Locator {
    return this.filters
      .getByRole('group', { name: 'Country of origin' })
      .getByRole('checkbox', { name, exact: true });
  }

  brandCheckbox(name: string): Locator {
    return this.filters.getByRole('group', { name: 'Brand' }).getByRole('checkbox', { name, exact: true });
  }

  /**
   * Clicks a filter control. The page is server-rendered, so a click made before it becomes interactive
   * does nothing: this retries until the URL changes.
   */
  async applyFilter(control: Locator, urlAfter: RegExp): Promise<void> {
    await expect(async () => {
      await control.click();
      await expect(this.page).toHaveURL(urlAfter, { timeout: 2_000 });
    }, `Clicking the filter did not change the URL to ${urlAfter}`).toPass({ timeout: 15_000 });
  }

  async sortByOption(option: SortOption): Promise<void> {
    await expect(async () => {
      await this.sortBy.click();
      await this.page.getByRole('option', { name: option, exact: true }).click({ timeout: 2_000 });
    }, `Could not choose "${option}" in Sort by`).toPass({ timeout: 15_000 });
    await expect(this.sortBy).toHaveText(option);
  }

  /** Scrolls to the end of the list so the next 20 products load. */
  async scrollToLoadMore(): Promise<void> {
    const before = await this.addToCartButtons.count();
    await expect(async () => {
      await this.addToCartButtons.last().scrollIntoViewIfNeeded();
      await this.page.mouse.wheel(0, 2_000);
      expect(await this.addToCartButtons.count()).toBeGreaterThan(before);
    }, 'Scrolling to the end of the list did not load more products').toPass({ timeout: 15_000 });
  }
}
