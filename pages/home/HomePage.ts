import type { Locator, Page } from '@playwright/test';
import { BasePage } from '../BasePage';

export class HomePage extends BasePage {
  protected readonly path = '/';
  protected readonly ready: Locator;

  readonly categoriesHeading: Locator;
  readonly addToCartButtons: Locator;

  constructor(page: Page) {
    super(page);
    const main = page.getByRole('main');
    this.ready = main.getByRole('heading', { level: 1 });
    this.categoriesHeading = main.getByRole('heading', { name: 'Shop by category' });
    this.addToCartButtons = main.getByRole('button', { name: /^Add .+ to cart$/ });
  }
}
