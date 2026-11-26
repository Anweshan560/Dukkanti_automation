import type { APIRequestContext } from '@playwright/test';
import { BasketsApi } from './BasketsApi';
import { BrandsApi } from './BrandsApi';
import { CartApi } from './CartApi';
import { CategoriesApi } from './CategoriesApi';
import { CountriesApi } from './CountriesApi';
import { CouponsApi } from './CouponsApi';
import { FormsApi } from './FormsApi';
import { InfoApi } from './InfoApi';
import { OrdersApi } from './OrdersApi';
import { PaymentApi } from './PaymentApi';
import { ProductsApi } from './ProductsApi';
import { PromotionsApi } from './PromotionsApi';
import { UsersApi } from './UsersApi';
import { WishlistApi } from './WishlistApi';

/** Every API client, all calling as the same user (or as a guest when there is no token). */
export interface Api {
  baskets: BasketsApi;
  brands: BrandsApi;
  cart: CartApi;
  categories: CategoriesApi;
  countries: CountriesApi;
  coupons: CouponsApi;
  forms: FormsApi;
  info: InfoApi;
  orders: OrdersApi;
  payment: PaymentApi;
  products: ProductsApi;
  promotions: PromotionsApi;
  users: UsersApi;
  wishlist: WishlistApi;
}

export function buildApi(request: APIRequestContext, token?: string): Api {
  return {
    baskets: new BasketsApi(request, token),
    brands: new BrandsApi(request, token),
    cart: new CartApi(request, token),
    categories: new CategoriesApi(request, token),
    countries: new CountriesApi(request, token),
    coupons: new CouponsApi(request, token),
    forms: new FormsApi(request, token),
    info: new InfoApi(request, token),
    orders: new OrdersApi(request, token),
    payment: new PaymentApi(request, token),
    products: new ProductsApi(request, token),
    promotions: new PromotionsApi(request, token),
    users: new UsersApi(request, token),
    wishlist: new WishlistApi(request, token),
  };
}

export * from './BasketsApi';
export * from './BrandsApi';
export * from './CartApi';
export * from './CategoriesApi';
export * from './CountriesApi';
export * from './CouponsApi';
export * from './FormsApi';
export * from './InfoApi';
export * from './OrdersApi';
export * from './PaymentApi';
export * from './ProductsApi';
export * from './PromotionsApi';
export * from './ResourceApi';
export * from './UsersApi';
export * from './WishlistApi';
