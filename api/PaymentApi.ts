import type { APIResponse } from '@playwright/test';
import { ResourceApi } from './ResourceApi';

/** What the public pay page shows for an order: `GET /payment/orders/{id}`. */
export interface OrderPayment {
  id: string;
  displayId: string;
  paymentStatus: 'pending' | 'paid';
  totalAmount: number;
  status: string;
  /** Only cash-on-delivery orders (and orders an admin holds until paid) can be paid from the pay page. */
  isPayable: boolean;
  amountDue: number;
}

/** `POST /payment/orders/{id}/link`: the order's Stripe Checkout page. */
export interface PayLink {
  url: string;
}

export class PaymentApi extends ResourceApi {
  protected readonly resource = '/payment';

  /** Public: anyone with the order id (it is in the WhatsApp pay link) may read this. */
  order(orderId: string): Promise<APIResponse> {
    return this.get(`/orders/${encodeURIComponent(orderId)}`);
  }

  /** Public: opens (or reuses) a Stripe Checkout page for what the order still owes. */
  link(orderId: string): Promise<APIResponse> {
    return this.post(`/orders/${encodeURIComponent(orderId)}/link`);
  }

  /**
   * The old WhatsApp pay buttons (`/payment/pay/{id}` and `/payment/cod/{id}`): they should redirect to the
   * website's pay page. Redirects are not followed, so the test can read `Location`.
   */
  legacyPayLink(kind: 'pay' | 'cod', orderId: string): Promise<APIResponse> {
    return this.request.get(this.url(`/${kind}/${encodeURIComponent(orderId)}`), { maxRedirects: 0 });
  }

  confirm(orderId: string): Promise<APIResponse> {
    return this.post(`/orders/${encodeURIComponent(orderId)}/confirm`);
  }

  customerSession(): Promise<APIResponse> {
    return this.post('/customer-session');
  }
}
