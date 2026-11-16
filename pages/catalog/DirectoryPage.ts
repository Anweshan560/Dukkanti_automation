import type { Locator, Page } from '@playwright/test';
import { BasePage } from '../BasePage';

export type DirectoryKind = 'categories' | 'countries' | 'brands';

const HEADINGS: Record<DirectoryKind, string> = {
  categories: 'Shop by category',
  countries: 'Shop by country',
  brands: 'Shop by brand',
};

/** The "see all" pages: `/categories`, `/countries` and `/brands`. Each lists links and has a search box. */
export class DirectoryPage extends BasePage {
  protected readonly path: string;
  protected readonly ready: Locator;

  readonly searchBox: Locator;
  /** Links to the listings, one per category/country/brand. */
  readonly entries: Locator;

  constructor(
    page: Page,
    readonly kind: DirectoryKind,
  ) {
    super(page);
    this.path = `/${kind}`;
    const main = page.getByRole('main');
    this.ready = main.getByRole('heading', { level: 1, name: HEADINGS[kind] });
    this.searchBox = main.getByRole('searchbox', { name: `Search ${kind}...` });
    this.entries = main.locator(`a[href^="/products/${kind}/"]`);
  }

  entry(name: string): Locator {
    return this.entries.filter({ hasText: name }).first();
  }
}
