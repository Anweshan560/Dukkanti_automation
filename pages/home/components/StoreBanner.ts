import type { Locator, Page } from '@playwright/test';

/** The "Store update" announcement from the CMS (GET /info generalNotice). */
export class StoreBanner {
  readonly root: Locator;
  readonly message: Locator;
  readonly dismissButton: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('main').getByRole('region', { name: /^(Store update|تحديث المتجر)$/ });
    this.message = this.root.getByRole('paragraph');
    this.dismissButton = this.root.getByRole('button', { name: /^(Dismiss|إخفاء)$/ });
  }
}
