import type { APIResponse } from '@playwright/test';
import type { Product } from './ProductsApi';
import { json, ResourceApi } from './ResourceApi';

export interface Wishlist {
  id: string;
  items: { id: string; product: Product }[];
}

export class WishlistApi extends ResourceApi {
  protected readonly resource = '/wishlist';

  getWishlist(): Promise<APIResponse> {
    return this.get();
  }

  add(productId: string): Promise<APIResponse> {
    return this.post('/add', { productId });
  }

  remove(itemId: string): Promise<APIResponse> {
    return this.delete(`/${encodeURIComponent(itemId)}`);
  }

  clear(): Promise<APIResponse> {
    return this.delete();
  }

  current(): Promise<Wishlist> {
    return json<Wishlist>(this.getWishlist());
  }
}
