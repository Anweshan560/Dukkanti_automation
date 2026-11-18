import type { APIResponse } from '@playwright/test';
import { ResourceApi } from './ResourceApi';

/** What the public pay page shows for an order: `GET /payment/orders/{id}`. */
export interface OrderPayment {
  id: string;
  displayId: string;
  paymentStatus: 'pending' | 'paid';
  totalAmount: number;
  status: string;
  isPayable: boolean;
  amountDue: number;
}

export class PaymentApi extends ResourceApi {
  protected readonly resource = '/payment';

  order(orderId: string): Promise<APIResponse> {
    return this.get(`/orders/${encodeURIComponent(orderId)}`);
  }

  confirm(orderId: string): Promise<APIResponse> {
    return this.post(`/orders/${encodeURIComponent(orderId)}/confirm`);
  }

  customerSession(): Promise<APIResponse> {
    return this.post('/customer-session');
  }
}
