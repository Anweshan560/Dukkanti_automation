import { test } from '@playwright/test';
import { json, type Api, type Page, type Product, type Promotion, type StoreInfo } from '../api';
import { env } from '../config/env';

/** Money is kept to 2 decimals everywhere in the store. */
export const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export interface ExpectedTotals {
  subTotal: number;
  vat: number;
  deliveryFee: number;
  codFee: number;
  total: number;
  remainingToMinimum: number;
  /** Below the minimum order the order cannot be placed. */
  canCheckout: boolean;
}

/**
 * The store's pricing rules, written down once (from GET /info and the cart and checkout pages):
 *  - VAT is `taxPercentage` % of the subtotal (not of the delivery fee).
 *  - Delivery costs `deliveryFee` below `deliveryCutOff` and is free from `deliveryCutOff` up.
 *  - Cash on delivery adds `codFee` to the total; card does not.
 *  - Below `minOrderAmount` the order cannot be placed.
 */
export function expectedTotals(
  subTotal: number,
  info: Pick<StoreInfo, 'minOrderAmount' | 'deliveryFee' | 'deliveryCutOff' | 'codFee' | 'taxPercentage'>,
  payment: 'card' | 'cod' = 'card',
): ExpectedTotals {
  const vat = round2((subTotal * info.taxPercentage) / 100);
  const deliveryFee = subTotal >= info.deliveryCutOff ? 0 : info.deliveryFee;
  const codFee = payment === 'cod' ? info.codFee : 0;
  return {
    subTotal: round2(subTotal),
    vat,
    deliveryFee,
    codFee,
    total: round2(subTotal + vat + deliveryFee + codFee),
    remainingToMinimum: round2(Math.max(0, info.minOrderAmount - subTotal)),
    canCheckout: subTotal >= info.minOrderAmount,
  };
}

/** Products a test can buy at a predictable price: in stock and not in a deal. */
export async function purchasableProducts(api: Api, count: number, minPrice = 0): Promise<Product[]> {
  const page = await json<Page<Product>>(api.products.list({ limit: 100 }));
  const found = page.data.filter((p) => p.inStock && !p.promotion && p.price >= minPrice);
  if (found.length < count) {
    throw new Error(
      `Needed ${count} in-stock products without a deal (price >= ${minPrice}), found ${found.length}.`,
    );
  }
  return found.slice(0, count);
}

/**
 * A product and a quantity whose subtotal lands exactly on `amount`, for boundary tests (e.g. exactly the
 * minimum order). Skips the test when no product price divides the amount.
 */
export async function quantityForExactly(
  api: Api,
  amount: number,
): Promise<{ product: Product; quantity: number }> {
  const page = await json<Page<Product>>(api.products.list({ limit: 200 }));
  const product = page.data.find((p) => {
    if (!p.inStock || p.promotion || p.price <= 0) return false;
    const ratio = amount / p.price;
    return Math.abs(ratio - Math.round(ratio)) < 1e-9 && ratio <= 100;
  });
  test.skip(!product, `No in-stock product price divides ${amount} exactly`);
  return { product: product as Product, quantity: Math.round(amount / (product as Product).price) };
}

/** A running deal of this type with at least `count` in-stock products, or a skip. */
export async function dealWithProducts(
  api: Api,
  type: string,
  count = 1,
): Promise<{ promotion: Promotion; products: Product[] }> {
  for (const promotion of (await api.promotions.active()).filter((p) => p.type === type)) {
    const page = await json<Page<Product>>(api.products.list({ promotionId: promotion.id, limit: 50 }));
    const products = page.data.filter((p) => p.inStock);
    if (products.length >= count) return { promotion, products };
  }
  test.skip(true, `No running "${type}" deal with ${count} in-stock product(s)`);
  throw new Error('unreachable');
}

/**
 * The product the store keeps out of stock for the tests (`OUT_OF_STOCK_PRODUCT_SLUG`). Skips the test when
 * it is gone or back in stock, since then nothing out of stock is left to test with.
 */
export async function outOfStockProduct(api: Api): Promise<Product> {
  const response = await api.products.getBySlug(env.testData.outOfStockSlug);
  test.skip(!response.ok(), `The out-of-stock test product "${env.testData.outOfStockSlug}" was not found`);
  const product = (await response.json()) as Product;
  test.skip(
    product.inStock,
    `"${product.name}" is back in stock: ask the store owner to set it out of stock again`,
  );
  return product;
}

/** A UUID that no record will ever have. */
export const MISSING_ID = '00000000-0000-4000-8000-000000000000';

/** Strings that must be stored and shown as plain text, never run as code or break a query. */
export const HOSTILE_STRINGS = {
  xss: '<img src=x onerror="window.__xss=1">',
  script: '<script>window.__xss=1</script>',
  sql: "' OR '1'='1' --",
  unicode: 'Ünïcödé عربي 漢字 🧀',
} as const;
