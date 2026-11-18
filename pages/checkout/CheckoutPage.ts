import { expect, type FrameLocator, type Locator, type Page } from '@playwright/test';
import { parseMoney, readableText } from '../../utils/dom';
import { BasePage } from '../BasePage';
import { DeliveryProgress, OrderSummary } from '../cart/CartLines';

/** Stripe test cards: https://docs.stripe.com/testing */
export const STRIPE_CARDS = {
  success: '4242424242424242',
  declined: '4000000000000002',
  insufficientFunds: '4000000000009995',
  expired: '4000000000000069',
  incorrectCvc: '4000000000000127',
} as const;

/** The "Pay now" dialog: Stripe's Payment Element inside an iframe, and Dukkanti's Pay button. */
export class PayDialog {
  readonly root: Locator;
  readonly stripe: FrameLocator;
  readonly payButton: Locator;
  readonly closeButton: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('dialog', { name: 'Pay now' });
    this.stripe = this.root.frameLocator('iframe[title="Secure payment input frame"]');
    this.payButton = this.root.getByRole('button', { name: /^Pay \d/ });
    this.closeButton = this.root.getByRole('button', { name: 'Close' });
  }

  /** Shows the new-card form: the customer may have a saved card selected, so open the "Card" tab. */
  async openCardForm(): Promise<void> {
    await expect(this.root, 'The "Pay now" dialog did not open').toBeVisible({ timeout: 30_000 });
    const cardNumber = this.stripe.getByRole('textbox', { name: 'Card number' });
    const cardTab = this.stripe.getByRole('button', { name: 'Card', exact: true });
    await expect(async () => {
      if (!(await cardNumber.isVisible()) && (await cardTab.isVisible())) await cardTab.click();
      await expect(cardNumber).toBeVisible({ timeout: 3_000 });
    }, 'The Stripe card form did not show').toPass({ timeout: 45_000 });
  }

  async enterCard(number: string, expiry = '12 / 34', cvc = '123'): Promise<void> {
    await this.openCardForm();
    await this.stripe.getByRole('textbox', { name: 'Card number' }).fill(number);
    // Stripe renamed the field to "Expiration (MM/YY)" in 2026-11.
    await this.stripe.getByRole('textbox', { name: /^Expiration/ }).fill(expiry);
    await this.stripe.getByRole('textbox', { name: 'Security code' }).fill(cvc);
    const zip = this.stripe.getByRole('textbox', { name: /ZIP|Postal/ });
    if (await zip.count()) await zip.fill('12345');
  }

  /** Stripe's own error under a field, e.g. "Your card number is incomplete." */
  stripeError(): Locator {
    return this.stripe.getByRole('alert').or(this.stripe.locator('.p-FieldError')).first();
  }
}

/** What the shopper sees when the card is declined. */
export class PaymentFailedDialog {
  readonly root: Locator;
  readonly payOnDelivery: Locator;
  readonly tryAnotherCard: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('dialog', { name: /card payment didn.t go through/ });
    this.payOnDelivery = this.root.getByRole('button', { name: /^Place order, pay on delivery/ });
    this.tryAnotherCard = this.root.getByRole('button', { name: 'Try another card' });
  }
}

/** `/checkout`, signed in with something in the cart. */
export class CheckoutPage extends BasePage {
  protected readonly path = '/checkout';
  protected readonly ready: Locator;

  readonly main: Locator;
  readonly heading: Locator;
  /** "Deliver to <address> Change": opens the address picker. */
  readonly deliverTo: Locator;
  readonly addressPicker: Locator;
  readonly delivery: DeliveryProgress;
  readonly outOfStock: Locator;
  readonly rememberChoice: Locator;
  readonly payment: Locator;
  readonly payNow: Locator;
  readonly payOnDelivery: Locator;
  readonly summary: OrderSummary;
  readonly couponBox: Locator;
  readonly couponInput: Locator;
  readonly applyCoupon: Locator;
  readonly couponError: Locator;
  readonly viewCoupons: Locator;
  readonly proceed: Locator;
  /** "Add 42.00 more to reach minimum order". */
  readonly minimumNotice: Locator;
  readonly emptyMessage: Locator;
  readonly payDialog: PayDialog;
  readonly paymentFailed: PaymentFailedDialog;

  constructor(page: Page) {
    super(page);
    this.main = page.getByRole('main');
    this.heading = this.main.getByRole('heading', { name: 'Checkout', level: 1 });
    this.deliverTo = this.main.getByRole('button', { name: /^Deliver to/ });
    this.addressPicker = page.getByRole('dialog', { name: 'Deliver to' });
    this.delivery = new DeliveryProgress(this.main.getByRole('region', { name: 'Delivery' }));
    this.outOfStock = this.main.getByRole('radiogroup', { name: 'If an item is out of stock' });
    this.rememberChoice = this.main.getByRole('switch', { name: 'Remember my choice for future orders' });
    this.payment = this.main.getByRole('radiogroup', { name: 'How do you want to pay?' });
    this.payNow = this.payment.getByRole('radio', { name: /^Pay now/ });
    this.payOnDelivery = this.payment.getByRole('radio', { name: /^Pay on delivery/ });
    this.summary = new OrderSummary(this.main.getByRole('complementary'));
    this.couponBox = this.main.getByRole('region', { name: 'Coupon code' });
    this.couponInput = this.couponBox.getByRole('textbox', { name: 'Coupon code' });
    this.applyCoupon = this.couponBox.getByRole('button', { name: 'Apply' });
    this.couponError = this.couponBox.getByRole('alert');
    this.viewCoupons = this.couponBox.getByRole('button', { name: 'View coupons' });
    this.proceed = this.main.getByRole('button', { name: /^(Proceed to pay|Place order)/ });
    // Shown both in the delivery panel and in the order summary: take the summary one.
    this.minimumNotice = this.main.getByRole('complementary').getByText(/more to reach minimum order/);
    this.emptyMessage = this.main.getByText('Your cart is empty');
    this.payDialog = new PayDialog(page);
    this.paymentFailed = new PaymentFailedDialog(page);
    this.ready = this.heading;
  }

  /** The amount printed on the Proceed button. */
  async proceedAmount(): Promise<number> {
    return parseMoney(await readableText(this.proceed));
  }

  /** The proceed button only works once the page has loaded the cart and the Stripe session. */
  async waitUntilReady(): Promise<void> {
    await this.expectLoaded();
    await expect(this.summary.heading).toBeVisible();
    await expect(this.payment).toBeVisible();
  }

  async choosePayment(method: 'card' | 'cod'): Promise<void> {
    const radio = method === 'cod' ? this.payOnDelivery : this.payNow;
    await expect(async () => {
      await radio.check();
      await expect(radio).toBeChecked({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
  }
}

/** `/order-confirmation?orderId=…`: "Order placed!". */
export class OrderConfirmationPage {
  readonly main: Locator;
  readonly heading: Locator;
  readonly trackOrder: Locator;
  readonly keepShopping: Locator;
  readonly whatsApp: Locator;

  constructor(private readonly page: Page) {
    this.main = page.getByRole('main');
    this.heading = this.main.getByRole('heading', { name: 'Order placed!', level: 1 });
    this.trackOrder = this.main.getByRole('link', { name: 'Track order' });
    this.keepShopping = this.main.getByRole('link', { name: 'Keep shopping' });
    this.whatsApp = this.main.getByRole('link', { name: /Chat with us on WhatsApp/ });
  }

  async expectOpen(): Promise<string> {
    await expect(this.page).toHaveURL(/\/order-confirmation\?orderId=/, { timeout: 60_000 });
    await expect(this.heading).toBeVisible({ timeout: 30_000 });
    return new URL(this.page.url()).searchParams.get('orderId') ?? '';
  }

  /** The total the confirmation shows. */
  async total(): Promise<number> {
    // The amount sits next to the payment method, above "What happens next".
    const text = (await readableText(this.main)).split('What happens next')[0];
    const amounts = text.match(/\d[\d,]*\.\d{2}/g) ?? [];
    return parseMoney(amounts[amounts.length - 1] ?? 'NaN');
  }
}
