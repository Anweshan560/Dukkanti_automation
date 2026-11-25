/**
 * One page of every type, for the checks that run on all of them (tests/sweep).
 *
 * Test titles must be known before any test runs, so each type is a fixed name plus a resolver that looks
 * its path up from the API inside the test (a product, a deal, an order). A resolver returns null when the
 * data does not allow the page (no running deal), and the test skips.
 */
import { test } from '@playwright/test';
import {
  json,
  type Api,
  type Basket,
  type Brand,
  type Category,
  type Country,
  type OrderSummary,
  type Page,
} from '../../api';
import { ARABIC } from '../../utils/quality';
import { purchasableProducts } from '../../utils/shop';

export interface ResolvedPage {
  /** Path without the locale prefix, e.g. "/products/some-slug". */
  path: string;
  /** Data-driven text the Arabic page must show in Arabic (a product or category name). */
  arabicName?: string;
}

export interface PageType {
  /** Short name used in test titles, e.g. "product page". */
  name: string;
  resolve: (api: Api) => Promise<ResolvedPage | null>;
}

const fixed = (path: string) => async (): Promise<ResolvedPage> => ({ path });

/** Pages a guest can open. */
export const GUEST_PAGES: PageType[] = [
  { name: 'all products', resolve: fixed('/products') },
  { name: 'search results', resolve: fixed('/products?searchTerm=tea') },
  {
    name: 'category listing',
    resolve: async (api) => {
      // Skip test records whose "Arabic" name is not Arabic (dev has "anweshan category" / "caregory").
      const categories = await json<Category[]>(api.categories.list());
      const category = categories.find((c) => ARABIC.test(c.nameAr ?? '')) ?? categories[0];
      return { path: `/products/categories/${category.id}`, arabicName: category.nameAr };
    },
  },
  {
    name: 'country listing',
    resolve: async (api) => ({
      path: `/products/countries/${(await json<Country[]>(api.countries.list()))[0].id}`,
    }),
  },
  {
    name: 'brand listing',
    resolve: async (api) => ({ path: `/products/brands/${(await json<Brand[]>(api.brands.list()))[0].id}` }),
  },
  {
    name: 'product page',
    resolve: async (api) => {
      const [product] = await purchasableProducts(api, 1);
      return { path: `/products/${product.slugEn}`, arabicName: product.nameAr };
    },
  },
  { name: 'categories index', resolve: fixed('/categories') },
  { name: 'countries index', resolve: fixed('/countries') },
  { name: 'brands index', resolve: fixed('/brands') },
  { name: 'local businesses index', resolve: fixed('/local-businesses') },
  { name: 'baskets', resolve: fixed('/baskets') },
  {
    name: 'basket page',
    resolve: async (api) => {
      // A real basket with an Arabic name (dev also has a "foobar" test basket whose Arabic name is "foobar").
      const visible = (
        await json<(Basket & { isPrivate?: boolean; nameAr?: string })[]>(api.baskets.list())
      ).filter((b) => b.isActive && !b.isPrivate);
      const basket = visible.find((b) => ARABIC.test(b.nameAr ?? '')) ?? visible[0];
      return basket ? { path: `/baskets/${basket.slug}`, arabicName: basket.nameAr } : null;
    },
  },
  { name: 'deals', resolve: fixed('/deals') },
  {
    name: 'deal page',
    resolve: async (api) => {
      const [deal] = await api.promotions.active();
      return deal ? { path: `/deals/${deal.slugEn}`, arabicName: deal.nameAr } : null;
    },
  },
  { name: 'request an item', resolve: fixed('/request') },
  { name: 'contact', resolve: fixed('/contact') },
  { name: 'business inquiry', resolve: fixed('/business') },
  { name: 'sell on Dukkanti', resolve: fixed('/sell') },
  { name: 'policy page', resolve: fixed('/delivery') },
  { name: 'about', resolve: fixed('/about') },
  { name: 'page not found', resolve: fixed('/this-page-does-not-exist-qa') },
];

/**
 * Pages of the signed-in customer. Cart and checkout show their full layout only with something in the
 * cart: the sweep seeds one before those.
 */
export const CUSTOMER_PAGES: (PageType & { needsCart?: boolean })[] = [
  { name: 'cart', resolve: fixed('/cart'), needsCart: true },
  { name: 'checkout', resolve: fixed('/checkout'), needsCart: true },
  { name: 'profile', resolve: fixed('/account') },
  { name: 'orders', resolve: fixed('/account/orders') },
  {
    name: 'order detail',
    resolve: async (customerApi) => {
      const [order] = (await json<Page<OrderSummary>>(customerApi.orders.list({ page: 1, limit: 1 }))).data;
      return order ? { path: `/account/orders/${order.id}` } : null;
    },
  },
  { name: 'addresses', resolve: fixed('/account/addresses') },
  { name: 'wishlist', resolve: fixed('/account/wishlist') },
  { name: 'my coupons', resolve: fixed('/account/coupons') },
];

/** Resolves the page or skips the test when the data does not allow it. */
export async function resolveOrSkip(type: PageType, api: Api): Promise<ResolvedPage> {
  const resolved = await type.resolve(api);
  test.skip(!resolved, `No data for a ${type.name} right now`);
  return resolved!;
}

/** The same page in Arabic. */
export const arabicPath = (path: string): string => `/ar${path}`;
