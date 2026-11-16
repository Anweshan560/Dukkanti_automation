import type { APIRequestContext } from '@playwright/test';
import { BrandsApi } from './BrandsApi';
import { CategoriesApi } from './CategoriesApi';
import { CountriesApi } from './CountriesApi';
import { InfoApi } from './InfoApi';
import { ProductsApi } from './ProductsApi';
import { PromotionsApi } from './PromotionsApi';
import { UsersApi } from './UsersApi';

/** Every API client, all calling as the same user (or as a guest when there is no token). */
export interface Api {
  brands: BrandsApi;
  categories: CategoriesApi;
  countries: CountriesApi;
  info: InfoApi;
  products: ProductsApi;
  promotions: PromotionsApi;
  users: UsersApi;
}

export function buildApi(request: APIRequestContext, token?: string): Api {
  return {
    brands: new BrandsApi(request, token),
    categories: new CategoriesApi(request, token),
    countries: new CountriesApi(request, token),
    info: new InfoApi(request, token),
    products: new ProductsApi(request, token),
    promotions: new PromotionsApi(request, token),
    users: new UsersApi(request, token),
  };
}

export * from './BrandsApi';
export * from './CategoriesApi';
export * from './CountriesApi';
export * from './InfoApi';
export * from './ProductsApi';
export * from './PromotionsApi';
export * from './ResourceApi';
export * from './UsersApi';
