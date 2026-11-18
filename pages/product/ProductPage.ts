import { expect, type Locator, type Page } from '@playwright/test';
import { parseMoney, readableText } from '../../utils/dom';
import { BasePage } from '../BasePage';

/** `/products/{slug}`. */
export class ProductPage extends BasePage {
  protected path = '/products';
  protected readonly ready: Locator;

  readonly main: Locator;
  /** Named "breadcrumb" here and "Breadcrumb" on listings. */
  readonly breadcrumb: Locator;
  readonly title: Locator;
  /** The selling price under the title. */
  readonly price: Locator;
  readonly heart: Locator;
  readonly share: Locator;
  readonly brandLink: Locator;
  readonly dealLink: Locator;
  readonly decrease: Locator;
  readonly increase: Locator;
  /** The number between - and +. */
  readonly quantity: Locator;
  /** "Add to cart <amount>" before the product is in the cart. */
  readonly addToCart: Locator;
  /** "View cart · <amount>" once it is in the cart. */
  readonly viewCart: Locator;
  /** "Add pack of 4 <price> <old price>" for products in a deal. */
  readonly addPack: Locator;
  readonly delivery: Locator;
  readonly relatedHeading: Locator;
  readonly relatedCards: Locator;

  constructor(page: Page) {
    super(page);
    this.main = page.getByRole('main');
    this.breadcrumb = this.main.getByRole('navigation', { name: /^breadcrumb$/i });
    this.title = this.main.getByRole('heading', { level: 1 });
    this.price = this.title.locator('xpath=following-sibling::*[1]').locator('p').first();
    this.heart = this.main.getByRole('button', { name: /^Save or unsave / }).first();
    this.share = this.main.getByRole('button', { name: 'Share' });
    this.brandLink = this.main.locator('a[href^="/products/brands/"]').first();
    this.dealLink = this.main.locator('a[href^="/deals/"]').first();
    this.decrease = this.main.getByRole('button', { name: 'Decrease quantity' }).first();
    this.increase = this.main.getByRole('button', { name: 'Increase quantity' }).first();
    this.quantity = this.increase.locator('xpath=..').locator('[aria-live="polite"]');
    this.addToCart = this.main.getByRole('button', { name: /^Add to cart [\d,]+\.\d{2}$/ });
    this.viewCart = this.main.getByRole('button', { name: /^View cart/ });
    this.addPack = this.main.getByRole('button', { name: /^Add pack of \d+/ });
    this.delivery = this.main.getByText(/^Arrives /).first();
    this.relatedHeading = this.main.getByRole('heading', { name: 'Related products', level: 2 });
    this.relatedCards = this.relatedHeading.locator('xpath=following::*').getByRole('button', { name: /^Add .+ to cart$/ });
    this.ready = this.title;
  }

  async openSlug(slug: string): Promise<void> {
    await this.goto(`/products/${encodeURIComponent(slug)}`);
    await this.expectLoaded();
  }

  async priceAmount(): Promise<number> {
    return parseMoney(await readableText(this.price));
  }

  async addToCartAmount(): Promise<number> {
    return parseMoney(await readableText(this.addToCart));
  }

  async quantityValue(): Promise<number> {
    return Number(await this.quantity.innerText());
  }

  /** The page is server-rendered: retry the first click until the page reacts. */
  async clickUntil(control: Locator, done: () => Promise<void>): Promise<void> {
    await expect(async () => {
      await control.click();
      await done();
    }).toPass({ timeout: 15_000 });
  }
}
