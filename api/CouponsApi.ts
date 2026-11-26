import type { APIResponse } from '@playwright/test';
import { ResourceApi } from './ResourceApi';

export class CouponsApi extends ResourceApi {
  protected readonly resource = '/coupons';

  /** The coupons saved to the customer's account. */
  list(): Promise<APIResponse> {
    return this.get();
  }

  /** Saves a coupon to the account by its code. */
  claim(code: string): Promise<APIResponse> {
    return this.post('', { code });
  }

  /** Applies a coupon to the cart. Returns the cart. */
  apply(code: string): Promise<APIResponse> {
    return this.post('/apply', { code });
  }

  remove(code: string): Promise<APIResponse> {
    return this.post('/remove', { code });
  }
}
