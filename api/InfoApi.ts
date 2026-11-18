import type { APIResponse } from '@playwright/test';
import { ResourceApi } from './ResourceApi';

/** Store-wide settings returned by `GET /info`. */
export interface StoreInfo {
  minVersion: string;
  generalNotice: string | null;
  generalNoticeAr: string | null;
  minOrderAmount: number;
  deliveryFee: number;
  /** Orders above this amount get free delivery. */
  deliveryCutOff: number;
  codFee: number;
  taxPercentage: number;
  localBrandsEnabled: boolean;
  sameDayDeliveryEnabled: boolean;
  sameDayCutoff: string;
  /** The next delivery. `orderBy` is today's same-day cut-off, or null once it has passed. */
  deliveryEstimate: { date: string; orderBy: string | null };
  stripePublishableKey: string;
}

export class InfoApi extends ResourceApi {
  protected readonly resource = '/info';

  getInfo(): Promise<APIResponse> {
    return this.get();
  }
}
