import type { APIResponse } from '@playwright/test';
import { json, ResourceApi } from './ResourceApi';

export type PromotionType =
  'buy_x_get_y' | 'bundle_price' | 'mix_and_match' | 'percentage_off' | 'amount_off';

export interface Promotion {
  id: string;
  name: string;
  nameAr: string;
  slugEn: string;
  slugAr: string;
  type: PromotionType | string;
  value: number;
  buyQuantity: number | null;
  getQuantity: number | null;
  maxApplicationsPerOrder: number | null;
  endsAt: string | null;
}

/** True when the promotion has not ended at `now`. A promotion without an end date never ends. */
export const isActive = (promotion: Promotion, now = new Date()): boolean =>
  !promotion.endsAt || new Date(promotion.endsAt).getTime() > now.getTime();

const amount = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(2));

/**
 * The short title the storefront shows for a promotion type, e.g. "Buy 2 get 1 free" or "20% off".
 * Derived from the deal cards on the home page and the deal pages.
 */
export function promotionTitle(promotion: Promotion): string {
  const buy = promotion.buyQuantity ?? 0;
  const get = promotion.getQuantity ?? 0;
  switch (promotion.type) {
    case 'buy_x_get_y':
      return `Buy ${buy} get ${get} free`;
    case 'bundle_price':
      return `${buy} for AED ${amount(promotion.value)}`;
    case 'mix_and_match':
      return `Buy any ${buy}, get ${get} free`;
    case 'percentage_off':
      return `${amount(promotion.value)}% off`;
    case 'amount_off':
      return `AED ${amount(promotion.value)} off`;
    default:
      throw new Error(`Unknown promotion type "${promotion.type}" on "${promotion.name}"`);
  }
}

/** "Ends Nov 18": the end date in the store's time zone. */
export const endsLabel = (endsAt: string): string =>
  `Ends ${new Date(endsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Dubai' })}`;

export class PromotionsApi extends ResourceApi {
  protected readonly resource = '/promotions';

  list(): Promise<APIResponse> {
    return this.get();
  }

  async active(): Promise<Promotion[]> {
    return (await json<Promotion[]>(this.list())).filter((promotion) => isActive(promotion));
  }
}
