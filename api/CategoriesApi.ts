import type { APIResponse } from '@playwright/test';
import { ResourceApi } from './ResourceApi';

export interface SubCategory {
  id: string;
  name: string;
  nameAr: string;
  image: string;
}

export interface Category extends SubCategory {
  subCategories: SubCategory[];
}

export class CategoriesApi extends ResourceApi {
  protected readonly resource = '/categories';

  list(): Promise<APIResponse> {
    return this.get();
  }
}
