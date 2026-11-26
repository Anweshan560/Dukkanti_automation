import type { APIResponse } from '@playwright/test';
import type { Page, Product } from './ProductsApi';
import { json, ResourceApi, type Query } from './ResourceApi';

export interface OrderSummary {
  id: string;
  displayId: string;
  totalAmount: number;
  deliveryDate: string;
  deliveryType: string;
  status: string;
  itemsCount: number;
}

export interface OrderItem {
  id?: string;
  quantity: number;
  /** Sent as a string ("2.50") since 2026-11, while cart prices are numbers: known bug order-item-price-string. */
  price: number | string;
  product: Product;
}

export interface OrderDetail extends Omit<OrderSummary, 'itemsCount'> {
  createdAt: string;
  subTotalAmount: number;
  vatAmount: number;
  deliveryAmount: number;
  codFee: number;
  discountAmount: number;
  paymentProvider: string;
  paymentStatus: 'pending' | 'paid';
  consentForSimilarProducts: string | boolean | null;
  address: { id?: string; nickName?: string; city?: string; area?: string; [key: string]: unknown } | null;
  items: OrderItem[];
  timelines: { status?: string; title?: string; createdAt?: string; [key: string]: unknown }[];
}

export class OrdersApi extends ResourceApi {
  protected readonly resource = '/orders';

  list(query: { page: number; limit: number; state?: 'active' | 'past' }): Promise<APIResponse> {
    return this.get('', { ...query });
  }

  /** Same as `list`, for values the API should refuse (e.g. `state: 'bogus'`). */
  listRaw(query: Query): Promise<APIResponse> {
    return this.get('', query);
  }

  getById(id: string): Promise<APIResponse> {
    return this.get(`/${encodeURIComponent(id)}`);
  }

  async detail(id: string): Promise<OrderDetail> {
    return json<OrderDetail>(this.getById(id));
  }

  /** The order the home page "From your last order" card is built from, or null when there is none. */
  async latest(): Promise<OrderDetail | null> {
    const page = await json<Page<OrderSummary>>(this.list({ page: 1, limit: 1 }));
    if (!page.data.length) return null;
    return json<OrderDetail>(this.getById(page.data[0].id));
  }
}
