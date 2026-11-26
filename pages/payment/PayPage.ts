import { expect, type FrameLocator, type Locator, type Page } from '@playwright/test';
import { parseMoney } from '../../utils/dom';
import { BasePage } from '../BasePage';

/**
 * `/pay/{orderId}`: the page a WhatsApp pay link opens. Anyone with the link may use it, signed in or not.
 * It has four states: an amount and a Pay button, "Order #N is paid", "This order can't be paid online"
 * and "We couldn't find this order" (HTTP 404).
 */
export class PayPage extends BasePage {
  protected path = '/pay';
  readonly main: Locator;
  readonly heading: Locator;
  readonly payButton: Locator;
  readonly amountToPay: Locator;
  readonly continueShopping: Locator;
  readonly whatsApp: Locator;
  protected readonly ready: Locator;

  constructor(page: Page) {
    super(page);
    this.main = page.getByRole('main');
    this.heading = this.main.getByRole('heading', { level: 1 });
    this.payButton = this.main.getByRole('button', { name: /^Pay \d/ });
    this.amountToPay = this.main.getByRole('paragraph').filter({ hasText: 'Amount to pay' });
    this.continueShopping = this.main.getByRole('link', { name: 'Continue shopping' });
    this.whatsApp = this.main.getByRole('link', { name: /Chat with us on WhatsApp/ });
    this.ready = this.heading;
  }

  /** Opens the pay page of an order. Returns the HTTP status, since an unknown order is a 404 page. */
  async openFor(orderId: string): Promise<number> {
    const response = await this.page.goto(`${this.path}/${orderId}`, { waitUntil: 'domcontentloaded' });
    await expect(this.heading, `The pay page of ${orderId} did not load`).toBeVisible();
    return response?.status() ?? 0;
  }

  async amount(): Promise<number> {
    return parseMoney((await this.amountToPay.textContent()) ?? 'NaN');
  }

  paidHeading(displayId: string): Locator {
    return this.main.getByRole('heading', { name: `Order #${displayId} is paid`, level: 1 });
  }
}

/** Stripe's hosted Checkout page (checkout.stripe.com), where the Pay button sends the shopper. */
export class StripeCheckoutPage {
  readonly title: Locator;
  readonly back: Locator;
  /** The payment form is drawn in Stripe's own frame. */
  readonly form: FrameLocator;
  readonly payWithoutLink: Locator;
  readonly cardNumber: Locator;
  readonly expiry: Locator;
  readonly cvc: Locator;
  readonly nameOnCard: Locator;
  readonly country: Locator;
  readonly pay: Locator;
  readonly declined: Locator;

  constructor(private readonly page: Page) {
    this.title = page.getByRole('heading', { level: 2, name: /^Dukkanti order #/ });
    this.back = page.getByRole('link', { name: /^Back/ });
    this.form = page.frameLocator('iframe[src*="elements-inner-habanero"]');
    this.payWithoutLink = this.form.getByRole('button', { name: 'Pay without Link' });
    this.cardNumber = this.form.getByRole('textbox', { name: 'Card number' });
    this.expiry = this.form.getByRole('textbox', { name: 'Expiration (MM/YY)' });
    this.cvc = this.form.getByRole('textbox', { name: 'Security code' });
    this.nameOnCard = this.form.getByRole('textbox', { name: 'Name on card' });
    this.country = this.form.getByRole('combobox', { name: 'Country' });
    this.pay = this.form.getByRole('button', { name: 'Pay', exact: true });
    this.declined = this.form.getByText('Your card was declined.').first();
  }

  async expectOpen(displayId: string): Promise<void> {
    await expect(this.page).toHaveURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 30_000 });
    await expect(this.title).toHaveText(`Dukkanti order #${displayId}`);
  }

  /** The amount Stripe will charge, e.g. "AED 85.13" → 85.13 (Stripe puts a no-break space after AED). */
  async amount(): Promise<number> {
    return parseMoney(
      (await this.page
        .getByText(/^AED\s[\d,.]+$/)
        .first()
        .textContent()) ?? 'NaN',
    );
  }

  /**
   * Pays with a Stripe test card. The order's customer may have a Stripe Link account, which Stripe offers
   * first ("Confirm it's you"); the test skips it and types the card.
   */
  async payWith(card: string): Promise<void> {
    await expect(this.cardNumber.or(this.payWithoutLink).first()).toBeVisible({ timeout: 30_000 });
    if (await this.payWithoutLink.isVisible()) await this.payWithoutLink.click();
    await this.cardNumber.fill(card);
    await this.expiry.fill('12 / 34');
    await this.cvc.fill('123');
    await this.nameOnCard.fill('QA Test');
    await this.country.selectOption('AE');
    await this.pay.click();
  }
}
