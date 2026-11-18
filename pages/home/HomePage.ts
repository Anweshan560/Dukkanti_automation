import type { Locator, Page } from '@playwright/test';
import { waitForApi } from '../../utils/network';
import { BasePage } from '../BasePage';
import { CartDrawer, FloatingCartButton } from './components/Cart';
import { Footer } from './components/Footer';
import { Hero } from './components/Hero';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { NavBar } from './components/NavBar';
import {
  BrandSection,
  CategorySection,
  CountrySection,
  DealsSection,
  LocalBusinesses,
  ProductRow,
  ProductTabs,
  RequestItemCTA,
} from './components/sections';
import { StoreBanner } from './components/StoreBanner';
import { ThresholdBar } from './components/ThresholdBar';

export class HomePage extends BasePage {
  protected readonly path = '/';
  protected readonly ready: Locator;

  readonly categoriesHeading: Locator;
  readonly addToCartButtons: Locator;

  readonly nav: NavBar;
  readonly language: LanguageSwitcher;
  readonly thresholdBar: ThresholdBar;
  readonly storeBanner: StoreBanner;
  readonly hero: Hero;
  readonly categories: CategorySection;
  readonly deals: DealsSection;
  readonly countries: CountrySection;
  readonly productTabs: ProductTabs;
  readonly brands: BrandSection;
  readonly trending: ProductRow;
  readonly localBusinesses: LocalBusinesses;
  readonly requestItem: RequestItemCTA;
  readonly floatingCart: FloatingCartButton;
  readonly cartDrawer: CartDrawer;
  readonly footer: Footer;

  constructor(page: Page) {
    super(page);
    const main = page.getByRole('main');
    this.ready = main.getByRole('heading', { level: 1 });
    this.categoriesHeading = main.getByRole('heading', { name: 'Shop by category' });
    this.addToCartButtons = main.getByRole('button', { name: /^Add .+ to cart$/ });

    this.nav = new NavBar(page);
    this.language = new LanguageSwitcher(page);
    this.thresholdBar = new ThresholdBar(page);
    this.storeBanner = new StoreBanner(page);
    this.hero = new Hero(page);
    this.categories = new CategorySection(page);
    this.deals = new DealsSection(page);
    this.countries = new CountrySection(page);
    this.productTabs = new ProductTabs(page);
    this.brands = new BrandSection(page);
    this.trending = new ProductRow(page, 'Trending now');
    this.localBusinesses = new LocalBusinesses(page);
    this.requestItem = new RequestItemCTA(page);
    this.floatingCart = new FloatingCartButton(page);
    this.cartDrawer = new CartDrawer(page);
    this.footer = new Footer(page);
  }

  /**
   * Opens the page as a signed-in customer and waits until the browser has loaded the cart. That call is
   * made once the app is interactive, so clicks made after it are not lost to hydration.
   */
  async openForCustomer(): Promise<void> {
    const cartLoaded = waitForApi(this.page, 'GET', '/cart', 30_000);
    await this.open();
    const response = await cartLoaded;
    if (!response.ok())
      throw new Error(`The page could not load the cart: GET /cart answered ${response.status()}`);
  }

  /** Opens the Arabic home page directly. */
  async openArabic(): Promise<void> {
    await this.goto('/ar/');
    await this.expectLoaded();
  }
}
