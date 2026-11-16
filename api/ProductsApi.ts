import type { APIResponse } from '@playwright/test';
import { json, ResourceApi, type Query } from './ResourceApi';

export interface Product {
  id: string;
  name: string;
  nameAr: string;
  slugEn: string;
  slugAr: string;
  price: number;
  compareAtPrice: number | null;
  inStock: boolean;
  deliveryType: string;
  images: string[];
  promotion: { id: string; name: string; type: string } | null;
  brand: { id: string; name: string } | null;
  country: { id: string; name: string } | null;
  countries: { id: string; name: string }[];
  category: { id: string; name: string } | null;
  categories: { id: string; name: string }[];
  subCategories: { id: string; name: string }[];
  isInWishlist: boolean;
}

export interface Page<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ProductQuery {
  limit?: number;
  page?: number;
  /** e.g. `featured:desc`, `price:asc` */
  sort?: string;
  searchTerm?: string;
  /** Category ids, comma separated. */
  categories?: string;
  subCategories?: string;
  countries?: string;
  brands?: string;
  promotionId?: string;
  wishlist?: boolean;
}

export class ProductsApi extends ResourceApi {
  protected readonly resource = '/products';

  list(query: ProductQuery = {}): Promise<APIResponse> {
    return this.get('', { ...query });
  }

  /** Same as `list`, but lets a test send values the API should reject (e.g. `limit: 'abc'`). */
  listRaw(query: Query): Promise<APIResponse> {
    return this.get('', query);
  }

  getById(id: string): Promise<APIResponse> {
    return this.get(`/${encodeURIComponent(id)}`);
  }

  getBySlug(slug: string): Promise<APIResponse> {
    return this.get(`/slug/${encodeURIComponent(slug)}`);
  }

  similar(id: string, limit?: number): Promise<APIResponse> {
    return this.get(`/${encodeURIComponent(id)}/similar`, { limit });
  }

  /**
   * Picks a product the tests can safely buy: in stock and without a promotion, so prices are predictable.
   * Tests cannot create products (no admin access), so they choose one at run time instead of
   * hard-coding a product that may be removed from the store.
   */
  async findPurchasable(options: { searchTerm?: string; minPrice?: number } = {}): Promise<Product> {
    const page = await json<Page<Product>>(this.list({ limit: 50, searchTerm: options.searchTerm }));
    const found = page.data.find(
      (product) => product.inStock && !product.promotion && product.price >= (options.minPrice ?? 0),
    );
    if (!found) {
      throw new Error(
        `No in-stock product without a promotion found${options.searchTerm ? ` for "${options.searchTerm}"` : ''}. ` +
          'The store catalog may be empty or fully out of stock.',
      );
    }
    return found;
  }
}
