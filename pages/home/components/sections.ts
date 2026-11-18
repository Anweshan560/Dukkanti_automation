import { expect, type Locator, type Page } from '@playwright/test';
import { ProductCard, productCards } from './ProductCard';

/**
 * A home page band with an <h2> title and a "See all" link. The <section> elements have no label or
 * data-testid, so each is found by its heading. Reported as a testability gap.
 */
export class HomeSection {
  readonly root: Locator;
  readonly heading: Locator;
  readonly seeAllLink: Locator;

  constructor(
    protected readonly page: Page,
    heading: string | RegExp,
  ) {
    const main = page.getByRole('main');
    const title = page.getByRole('heading', { level: 2, name: heading, exact: typeof heading === 'string' });
    // `has` is matched inside each section, so it must not start from <main>.
    this.root = main.locator('section').filter({ has: title });
    this.heading = this.root.getByRole('heading', {
      level: 2,
      name: heading,
      exact: typeof heading === 'string',
    });
    this.seeAllLink = this.root.getByRole('link', { name: /^(See all|عرض الكل)$/ });
  }

  /** Links in this section that point under a path, e.g. `/products/countries/`. */
  linksTo(pathPrefix: string): Locator {
    return this.root.locator(`a[href^="${pathPrefix}"]`);
  }

  async hrefs(links: Locator): Promise<string[]> {
    return links.evaluateAll((elements) => elements.map((element) => element.getAttribute('href') ?? ''));
  }

  /** Visible labels of the links, in order. */
  async labels(links: Locator): Promise<string[]> {
    return links.evaluateAll((elements) => elements.map((element) => (element.textContent ?? '').trim()));
  }
}

export class CategorySection extends HomeSection {
  readonly tiles: Locator;
  constructor(page: Page) {
    super(page, 'Shop by category');
    this.tiles = this.linksTo('/products/categories/');
  }
}

export class CountrySection extends HomeSection {
  readonly subtitle: Locator;
  readonly stamps: Locator;
  constructor(page: Page) {
    super(page, 'Shop by country');
    this.subtitle = this.root.getByRole('paragraph');
    this.stamps = this.linksTo('/products/countries/');
  }
}

export class BrandSection extends HomeSection {
  readonly chips: Locator;
  constructor(page: Page) {
    super(page, 'Shop by brand');
    this.chips = this.linksTo('/products/brands/');
  }
}

export class LocalBusinesses extends HomeSection {
  readonly cards: Locator;
  constructor(page: Page) {
    super(page, 'Local businesses');
    this.cards = this.linksTo('/products/brands/');
  }
}

/** One deal tile: title, deal name, "Ends <date>" and up to four product pictures. One link. */
export class DealCard {
  readonly title: Locator;
  readonly thumbnails: Locator;
  constructor(readonly root: Locator) {
    this.title = root.locator('span').first().locator('span').first();
    this.thumbnails = root.locator('img');
  }

  async slug(): Promise<string> {
    return ((await this.root.getAttribute('href')) ?? '').replace(/^\/deals\//, '');
  }

  /** The three text lines: [title, deal name, "Ends Nov 18"] (the last one only when the deal ends). */
  async lines(): Promise<string[]> {
    return this.root.evaluate((element) =>
      [...element.querySelectorAll('span')]
        .filter((span) => span.children.length === 0 && (span.textContent ?? '').trim())
        .map((span) => (span.textContent ?? '').trim()),
    );
  }
}

export class DealsSection extends HomeSection {
  /** Every deal card in the page, including the ones the desktop layout hides (mobile scrolls through all). */
  readonly cards: Locator;
  /** The cards on screen: the first four on desktop. */
  readonly visibleCards: Locator;
  constructor(page: Page) {
    super(page, 'Deals');
    this.cards = this.linksTo('/deals/');
    this.visibleCards = this.cards.filter({ visible: true });
  }
  card(index: number): DealCard {
    return new DealCard(this.cards.nth(index));
  }
}

/** A band of product cards ("Trending now"). */
export class ProductRow extends HomeSection {
  readonly cards: Locator;
  constructor(page: Page, heading: string) {
    super(page, heading);
    this.cards = productCards(this.root);
  }
  card(index: number): ProductCard {
    return new ProductCard(this.cards.nth(index));
  }
  async all(): Promise<ProductCard[]> {
    return (await this.cards.all()).map((root) => new ProductCard(root));
  }
}

/** "Featured" / "Best prices" tabs. */
export class ProductTabs {
  readonly root: Locator;
  readonly tablist: Locator;
  readonly featuredTab: Locator;
  readonly bestPricesTab: Locator;
  readonly panel: Locator;
  readonly cards: Locator;
  readonly seeAllLink: Locator;

  constructor(page: Page) {
    const main = page.getByRole('main');
    this.root = main.locator('section').filter({ has: page.getByRole('tablist') });
    this.tablist = this.root.getByRole('tablist');
    this.featuredTab = this.tablist.getByRole('tab', { name: 'Featured' });
    this.bestPricesTab = this.tablist.getByRole('tab', { name: 'Best prices' });
    this.panel = main.getByRole('tabpanel');
    this.cards = productCards(this.panel);
    this.seeAllLink = this.root.getByRole('link', { name: 'See all' });
  }

  card(index: number): ProductCard {
    return new ProductCard(this.cards.nth(index));
  }

  async all(): Promise<ProductCard[]> {
    return (await this.cards.all()).map((root) => new ProductCard(root));
  }

  async select(tab: Locator): Promise<void> {
    await expect(async () => {
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 2_000 });
    }, 'The tab did not become selected').toPass({ timeout: 15_000 });
  }
}

/** "Can't find something from home?" with a "Request an item" link. */
export class RequestItemCTA {
  readonly link: Locator;
  readonly heading: Locator;
  constructor(page: Page) {
    this.link = page.getByRole('main').locator('a[href="/request"]');
    this.heading = this.link.getByText('Can’t find something from home?');
  }
}
