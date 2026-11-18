import { expect, type Locator, type Page } from '@playwright/test';
import { parseMoney, readableText } from '../../utils/dom';
import { BasePage } from '../BasePage';

/** The side panel every account page shares: summary counters and the account menu. */
export class AccountSidebar {
  readonly root: Locator;
  readonly menu: Locator;
  readonly signOut: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('main').getByRole('complementary').first();
    this.menu = this.root.getByRole('navigation', { name: 'Account menu' });
    this.signOut = this.menu.getByRole('button', { name: 'Sign out' });
  }

  /** "11 Orders" -> 11. */
  async count(what: 'Orders' | 'Wishlist' | 'Addresses'): Promise<number> {
    const link = this.root.getByRole('link', { name: new RegExp(`^\\d+ ${what}$`) });
    const name = (await link.getAttribute('aria-label')) ?? (await readableText(link));
    return Number(/\d+/.exec(name)?.[0] ?? NaN);
  }

  async expectCount(what: 'Orders' | 'Wishlist' | 'Addresses', count: number): Promise<void> {
    await expect(this.root.getByRole('link', { name: `${count} ${what}` })).toBeVisible();
  }
}

abstract class AccountPage extends BasePage {
  readonly sidebar: AccountSidebar;
  readonly main: Locator;
  readonly heading: Locator;

  constructor(page: Page, title: string | RegExp) {
    super(page);
    this.sidebar = new AccountSidebar(page);
    this.main = page.getByRole('main');
    this.heading = this.main.getByRole('heading', { name: title, level: 1 });
  }
}

/** `/account/orders`: Pending / Past orders. */
export class OrdersPage extends AccountPage {
  protected readonly path = '/account/orders';
  protected readonly ready: Locator;
  /** Tabs since 2026-11 (they were toggle buttons in a nav before). */
  readonly sections: Locator;
  readonly pendingTab: Locator;
  readonly pastTab: Locator;
  readonly pendingPanel: Locator;
  readonly orderLinks: Locator;
  readonly endOfList: Locator;
  readonly emptyMessage: Locator;

  constructor(page: Page) {
    super(page, 'Your orders');
    this.ready = this.heading;
    this.sections = this.main.getByRole('tablist', { name: 'Order sections' });
    this.pendingTab = this.sections.getByRole('tab', { name: 'Pending' });
    this.pastTab = this.sections.getByRole('tab', { name: 'Past orders' });
    this.pendingPanel = this.main.getByRole('tabpanel', { name: 'Pending' });
    this.orderLinks = this.main.getByRole('link', { name: /^View order #\d+$/ });
    this.endOfList = this.main.getByText('You’ve reached the end');
    this.emptyMessage = this.main.getByText('No orders yet');
  }

  orderLink(displayId: string): Locator {
    return this.main.getByRole('link', { name: `View order #${displayId}`, exact: true });
  }
}

/** `/account/orders/{id}`. */
export class OrderDetailPage extends AccountPage {
  protected readonly path = '/account/orders';
  protected readonly ready: Locator;
  readonly allOrders: Locator;
  readonly placedOn: Locator;
  readonly whatsApp: Locator;
  readonly orderAgain: Locator;
  /** "Order again" asks what to do with the current cart: Replace current cart / Add to current cart. */
  readonly orderAgainDialog: Locator;
  readonly replaceCart: Locator;
  readonly addToCart: Locator;
  /** What the page shows when the order cannot be loaded (also for an order that does not exist). */
  readonly loadError: Locator;
  readonly itemsHeading: Locator;
  readonly items: Locator;
  readonly timeline: Locator;

  constructor(page: Page) {
    super(page, /^Order #\d+$/);
    this.ready = this.heading;
    this.allOrders = this.main.getByRole('link', { name: 'All orders' });
    this.placedOn = this.main.getByText(/^Placed \w{3} \d{1,2}, \d{4}$/);
    this.whatsApp = this.main.getByRole('link', { name: 'Chat with us on WhatsApp' });
    this.orderAgain = this.main.getByRole('button', { name: 'Order again' });
    this.orderAgainDialog = page.getByRole('dialog', { name: 'Order again' });
    this.replaceCart = this.orderAgainDialog.getByRole('button', { name: 'Replace current cart' });
    this.addToCart = this.orderAgainDialog.getByRole('button', { name: 'Add to current cart' });
    this.loadError = this.main.getByRole('alert');
    this.itemsHeading = this.main.getByRole('heading', { name: /^\d+ items?$/, level: 2 });
    this.items = this.main.getByRole('list').first().getByRole('listitem');
    this.timeline = this.main.getByRole('heading', { name: 'Order timeline' }).locator('xpath=following::*[@role="list" or self::ul][1]');
  }

  async openOrder(id: string): Promise<void> {
    await this.goto(`/account/orders/${id}`);
    await this.expectLoaded();
  }

  item(productName: string): Locator {
    return this.items.filter({ has: this.page.getByRole('link', { name: productName, exact: true }) });
  }

  /** "Subtotal 80.50", "Delivery fee 20.00", "VAT 4.03", "Total 104.53". */
  async amount(label: 'Subtotal' | 'Delivery fee' | 'VAT' | 'Total' | 'Pay on delivery fee' | 'Discount'): Promise<number> {
    const text = (await readableText(this.main)).replace(/\s+/g, ' ');
    const match = new RegExp(`${label}\\s*([\\d,]+\\.\\d{2})`).exec(text);
    return match ? parseMoney(match[1]) : NaN;
  }
}

/** `/account`: profile form. */
export class ProfilePage extends AccountPage {
  protected readonly path = '/account';
  protected readonly ready: Locator;
  readonly firstName: Locator;
  readonly lastName: Locator;
  readonly mobile: Locator;
  readonly email: Locator;
  readonly save: Locator;
  readonly deleteAccount: Locator;
  readonly errors: Locator;

  constructor(page: Page) {
    super(page, 'Profile');
    this.ready = this.heading;
    this.firstName = this.main.getByRole('textbox', { name: /^First name/ });
    this.lastName = this.main.getByRole('textbox', { name: /^Last name/ });
    this.mobile = this.main.getByRole('textbox', { name: 'Mobile number' });
    this.email = this.main.getByRole('textbox', { name: /^Email/ });
    this.save = this.main.getByRole('button', { name: 'Save changes' });
    this.deleteAccount = this.main.getByRole('button', { name: 'Delete account' });
    this.errors = this.main.getByRole('alert').or(this.main.locator('[aria-invalid="true"] ~ *, [data-slot="form-message"]'));
  }

  /** The message tied to a field (aria-describedby / aria-errormessage), or the alert next to it. */
  fieldError(field: Locator): Locator {
    return field.locator('xpath=ancestor::*[self::div or self::label][1]/following-sibling::*[1] | ancestor::div[1]//*[@role="alert" or @data-slot="form-message"]').first();
  }
}

/** The "Add new address" / "Edit address" dialog. */
export class AddressDialog {
  readonly root: Locator;
  readonly mapSearch: Locator;
  readonly addressType: Locator;
  readonly nickname: Locator;
  readonly city: Locator;
  readonly area: Locator;
  readonly street: Locator;
  readonly building: Locator;
  readonly unit: Locator;
  readonly extraPhone: Locator;
  readonly save: Locator;
  readonly cancel: Locator;
  readonly close: Locator;
  /** Since 2026-11, cancelling a form with changes asks "Discard unsaved changes?" (Cancel / Discard). */
  readonly discardConfirmation: Locator;
  readonly discard: Locator;
  readonly keepEditing: Locator;

  constructor(page: Page) {
    // Exact names: the "Address saved" toast is a dialog too.
    this.root = page.getByRole('dialog', { name: /^(Add new|Edit) address$/ });
    this.mapSearch = this.root.getByRole('combobox', { name: 'Search building, street or area' });
    this.addressType = this.root.getByRole('radiogroup', { name: 'Address type' });
    this.nickname = this.root.getByRole('textbox', { name: /^Nickname/ });
    this.city = this.root.getByRole('radiogroup', { name: /^City/ });
    this.area = this.root.getByRole('textbox', { name: /^Area/ });
    this.street = this.root.getByRole('textbox', { name: /^Street/ });
    this.building = this.root.getByRole('textbox', { name: /^Building name/ });
    this.unit = this.root.getByRole('textbox', { name: /^Unit number/ });
    this.extraPhone = this.root.getByRole('textbox', { name: /^Additional phone number/ });
    this.save = this.root.getByRole('button', { name: 'Save' });
    this.cancel = this.root.getByRole('button', { name: 'Cancel' });
    this.close = this.root.getByRole('button', { name: 'Close' });
    this.discardConfirmation = page.getByRole('alertdialog', { name: 'Discard unsaved changes?' });
    this.discard = this.discardConfirmation.getByRole('button', { name: 'Discard' });
    this.keepEditing = this.discardConfirmation.getByRole('button', { name: 'Cancel' });
  }

  async fill(values: { type?: string; nickname?: string; city?: string; area?: string; street?: string; building?: string; unit?: string; phone?: string }): Promise<void> {
    if (values.type) await this.addressType.getByRole('radio', { name: values.type }).check();
    if (values.nickname !== undefined) await this.nickname.fill(values.nickname);
    if (values.city) await this.city.getByRole('radio', { name: values.city }).check();
    if (values.area !== undefined) await this.area.fill(values.area);
    if (values.street !== undefined) await this.street.fill(values.street);
    if (values.building !== undefined) await this.building.fill(values.building);
    if (values.unit !== undefined) await this.unit.fill(values.unit);
    if (values.phone !== undefined) await this.extraPhone.fill(values.phone);
  }

  /** Fields the dialog marks as invalid after Save. */
  invalidFields(): Locator {
    return this.root.locator('[aria-invalid="true"]');
  }
}

/** `/account/addresses`. */
export class AddressesPage extends AccountPage {
  protected readonly path = '/account/addresses';
  protected readonly ready: Locator;
  readonly cards: Locator;
  readonly addNew: Locator;
  readonly emptyMessage: Locator;
  readonly dialog: AddressDialog;

  constructor(page: Page) {
    super(page, 'Addresses');
    this.ready = this.heading;
    this.cards = this.main.getByRole('article');
    this.addNew = this.main.getByRole('button', { name: 'Add new address' });
    this.emptyMessage = this.main.getByText('No addresses yet');
    this.dialog = new AddressDialog(page);
  }

  card(text: string): Locator {
    return this.cards.filter({ hasText: text });
  }
}

/** `/account/wishlist`. */
export class WishlistPage extends AccountPage {
  protected readonly path = '/account/wishlist';
  protected readonly ready: Locator;
  readonly countLabel: Locator;
  readonly emptyHeading: Locator;
  readonly continueShopping: Locator;
  readonly hearts: Locator;

  constructor(page: Page) {
    super(page, 'Wishlist');
    this.ready = this.heading;
    this.countLabel = this.main.getByText(/^\d+ saved items?$/);
    this.emptyHeading = this.main.getByRole('heading', { name: 'Your wishlist is empty' });
    this.continueShopping = this.main.getByRole('link', { name: 'Continue shopping' });
    this.hearts = this.main.getByRole('button', { name: /^Save or unsave / });
  }

  productLink(name: string): Locator {
    return this.main.getByRole('link', { name, exact: true }).first();
  }
}

/** `/account/coupons`: the coupons saved to the account. */
export class CouponsPage extends AccountPage {
  protected readonly path = '/account/coupons';
  protected readonly ready: Locator;
  readonly emptyHeading: Locator;
  readonly emptyHint: Locator;
  /** "Add products to your cart to use coupons." while the cart is empty. */
  readonly cartHint: Locator;

  constructor(page: Page) {
    super(page, 'My coupons');
    this.ready = this.heading;
    this.emptyHeading = this.main.getByText('No coupons yet', { exact: true });
    this.emptyHint = this.main.getByText('Check back later for new offers.', { exact: true });
    this.cartHint = this.main.getByText('Add products to your cart to use coupons.', { exact: true });
  }
}
