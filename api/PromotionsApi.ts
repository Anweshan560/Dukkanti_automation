import type { APIResponse } from '@playwright/test';
import { ResourceApi } from './ResourceApi';

export interface Promotion {
  id: string;
  name: string;
  nameAr: string;
  slugEn: string;
  slugAr: string;
  type: string;
  value: number;
  buyQuantity: number | null;
  getQuantity: number | null;
  maxApplicationsPerOrder: number | null;
  endsAt: string | null;
}

export class PromotionsApi extends ResourceApi {
  protected readonly resource = '/promotions';

  list(): Promise<APIResponse> {
    return this.get();
  }
}
