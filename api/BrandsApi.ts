import type { APIResponse } from '@playwright/test';
import { ResourceApi } from './ResourceApi';

export interface Brand {
  id: string;
  name: string;
  nameAr: string;
  image: string;
  isActive: boolean;
  isLocal: boolean;
}

export class BrandsApi extends ResourceApi {
  protected readonly resource = '/brands';

  list(query: { localOnly?: boolean; categoryId?: string; countryId?: string } = {}): Promise<APIResponse> {
    return this.get('', { ...query });
  }
}
