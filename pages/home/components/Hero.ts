import type { Locator, Page } from '@playwright/test';

/** "From your last order": signed-in customers who have ordered before. */
export class LastOrderCard {
  readonly root: Locator;
  readonly heading: Locator;
  /** "Nov 16, 2026 · 7 items · 114.53" */
  readonly summary: Locator;
  readonly thumbnails: Locator;
  readonly viewOrderLink: Locator;
  readonly reorderButton: Locator;

  constructor(page: Page, hero: Locator) {
    this.heading = hero.getByRole('heading', { name: 'From your last order' });
    // The innermost block holding both the heading and Reorder. `has` locators start from the page.
    this.root = hero
      .locator('div')
      .filter({ has: page.getByRole('heading', { name: 'From your last order' }) })
      .filter({ has: page.getByRole('button', { name: 'Reorder' }) })
      .last();
    this.summary = this.root.getByRole('paragraph');
    this.thumbnails = this.root.locator('img');
    this.viewOrderLink = this.root.getByRole('link', { name: 'View order' });
    this.reorderButton = this.root.getByRole('button', { name: 'Reorder' });
  }
}

/** The big welcome panel at the top of the home page. */
export class Hero {
  readonly root: Locator;
  readonly heading: Locator;
  readonly subtext: Locator;
  readonly startShoppingLink: Locator;
  readonly shopByCountryLink: Locator;
  readonly lastOrder: LastOrderCard;
  /** The illustration (mascot) on the right. */
  readonly illustration: Locator;

  constructor(page: Page) {
    const main = page.getByRole('main');
    this.root = main.locator('section').filter({ has: page.getByRole('heading', { level: 1 }) });
    this.heading = this.root.getByRole('heading', { level: 1 });
    this.subtext = this.root.getByRole('paragraph').filter({ hasNotText: /·/ }).first();
    this.startShoppingLink = this.root.getByRole('link', { name: 'Start shopping' });
    this.shopByCountryLink = this.root.getByRole('link', { name: 'Shop by country' });
    this.lastOrder = new LastOrderCard(page, this.root);
    this.illustration = this.root.locator('img[src$=".svg"]');
  }

  badge(text: string | RegExp): Locator {
    return this.root.getByText(text);
  }
}
