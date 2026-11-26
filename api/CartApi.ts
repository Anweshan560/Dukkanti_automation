import type { APIResponse } from '@playwright/test';
import type { Product } from './ProductsApi';
import { json, ResourceApi } from './ResourceApi';

export interface CartItem {
  id: string;
  product: Product;
  quantity: number;
  price: number;
  compareAtPrice: number | null;
  lineTotal: number;
  lineDiscount: number;
  promotion: { id: string; name: string; type: string } | null;
  nextReward: { addQuantity: number; rewardQuantity: number } | null;
}

/** A "Request an item" line: something the store does not sell yet, priced from the shopper's budget. */
export interface SpecialItem {
  id: string;
  name: string;
  description: string;
  quantity: number;
  minPrice: number;
  maxPrice: number;
}

/**
 * A coupon in the cart. Its saving is `amount`, which the cart reports in `promotionDiscount` (not in
 * `discount`), and the cart's `subTotal` is already lowered by it.
 */
export interface AppliedCoupon {
  code: string;
  discountType: 'percentage' | 'fixed' | string;
  discountValue: number;
  type: string;
  amount: number;
  remainingToMinimum: number;
}

export interface Cart {
  id: string;
  items: CartItem[];
  specialItems: SpecialItem[];
  subTotal: number;
  vat: number;
  deliveryFee: number;
  codFee: number;
  discount: number;
  promotionDiscount: number;
  minimumOrder: number;
  remainingToMinimum: number;
  deliveryCutOff: number;
  total: number;
  appliedCoupons: AppliedCoupon[];
  notices: string[];
  deliveryEstimate: { date: string; orderBy: string | null };
}

export type PaymentMethod = 'card' | 'cod';

export interface CheckoutInput {
  addressId?: string;
  /** "true" or "false" (the API wants a string): may the store replace an out-of-stock item? */
  consentForSimilarProducts: string;
  paymentMethod?: PaymentMethod;
  deliveryPreference?: 'separate' | 'together';
}

export interface CheckoutResponse {
  /** `order`: the order is placed. `payment_sheet`: the card still has to be paid through Stripe. */
  redirectType: 'order' | 'payment_sheet';
  redirectUrl?: string;
  orderId: string;
  [key: string]: unknown;
}

export class CartApi extends ResourceApi {
  protected readonly resource = '/cart';

  getCart(): Promise<APIResponse> {
    return this.get();
  }

  add(productId: string, quantity: number): Promise<APIResponse> {
    return this.post('/add', { productId, quantity });
  }

  /** Adds a "Request an item" line. */
  addSpecial(item: Omit<SpecialItem, 'id'>): Promise<APIResponse> {
    return this.post('/add', item);
  }

  addBulk(items: { productId: string; quantity: number }[]): Promise<APIResponse> {
    return this.post('/add/bulk', { items });
  }

  update(productId: string, quantity: number): Promise<APIResponse> {
    return this.patch('/update', { productId, quantity });
  }

  remove(itemId: string): Promise<APIResponse> {
    return this.delete(`/${encodeURIComponent(itemId)}`);
  }

  clear(): Promise<APIResponse> {
    return this.delete('/clear');
  }

  /** Puts an order's lines in the cart: added to what is there, or replacing it when removeExisting is set. */
  copyOrder(orderId: string, removeExisting = false): Promise<APIResponse> {
    return this.post('/copy-order', { orderId, removeExisting });
  }

  /** Places the order (cash on delivery) or starts a card payment. */
  checkout(input: CheckoutInput): Promise<APIResponse> {
    return this.post('/checkout', input);
  }

  /** Empties the cart and puts exactly these products in it. Returns the cart the API reports. */
  async seed(lines: { productId: string; quantity: number }[]): Promise<Cart> {
    await json(this.clear());
    for (const line of lines) await json(this.add(line.productId, line.quantity));
    return json<Cart>(this.getCart());
  }

  current(): Promise<Cart> {
    return json<Cart>(this.getCart());
  }
}
