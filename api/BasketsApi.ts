import type { APIResponse } from '@playwright/test';
import { ResourceApi } from './ResourceApi';

export interface Basket {
  id: string;
  name: string;
  slug: string;
  nameAr?: string;
  isActive: boolean;
  isPrivate?: boolean;
  /** Shows "Buy" on the basket card: one tap adds every in-stock product of the basket. */
  showAddAll?: boolean;
  /** A fixed product list (`productIds`), or a rule (categories, countries, ...) that picks the products. */
  filters?: { productIds?: string[]; [key: string]: unknown };
  [key: string]: unknown;
}

export class BasketsApi extends ResourceApi {
  protected readonly resource = '/baskets';

  list(): Promise<APIResponse> {
    return this.get();
  }
}
