import type { APIResponse } from '@playwright/test';
import { ResourceApi } from './ResourceApi';

export interface Country {
  id: string;
  name: string;
  nameAr: string;
  image: string;
  isVisible: boolean;
}

export class CountriesApi extends ResourceApi {
  protected readonly resource = '/countries';

  list(): Promise<APIResponse> {
    return this.get();
  }
}
