import type { Locator, Page } from '@playwright/test';
import { BasePage } from '../BasePage';
import { CartLines, DeliveryProgress, OrderSummary } from './CartLines';

/** `/cart`. A guest with an empty cart gets the sign-in dialog instead; a guest cart lives in localStorage. */
export class CartPage extends BasePage {
  protected readonly path = '/cart';
  protected readonly ready: Locator;

  readonly main: Locator;
  readonly lines: CartLines;
  readonly delivery: DeliveryProgress;
  readonly summary: OrderSummary;
  readonly quickAdds: Locator;
  readonly goToCheckout: Locator;
  readonly requestItemLink: Locator;
  readonly emptyMessage: Locator;
  readonly continueShopping: Locator;

  constructor(page: Page) {
    super(page);
    this.main = page.getByRole('main');
    this.lines = new CartLines(page, this.main.getByRole('region', { name: 'Your cart' }));
    this.delivery = new DeliveryProgress(this.main.getByRole('region', { name: 'Delivery' }));
    this.summary = new OrderSummary(this.main.getByRole('complementary'));
    this.quickAdds = this.main.getByRole('region', { name: 'Quick adds' });
    this.goToCheckout = this.main.getByRole('link', { name: /^Go to checkout/ });
    this.requestItemLink = this.main.getByRole('link', { name: /Request an item/ });
    this.emptyMessage = this.main.getByText('Your cart is empty');
    this.continueShopping = this.main.getByRole('link', { name: 'Continue shopping' });
    this.ready = this.lines.root.or(this.emptyMessage);
  }
}
