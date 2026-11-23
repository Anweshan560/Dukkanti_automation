import {
  json,
  type Address,
  type Api,
  type OrderPayment,
  type OrderSummary,
  type Page,
  type StoreInfo,
} from '../../api';
import type { Cleanup } from '../../fixtures/test';
import { retryOn429 } from '../../utils/rateLimit';
import { purchasableProducts, quantityForExactly } from '../../utils/shop';
import { buildAddress } from '../../utils/testData';

interface OrderSetup {
  api: Api;
  storeInfo: StoreInfo;
  cleanup: Cleanup;
}

/**
 * Unpaid cash-on-delivery orders of the test customer that the pay page can still take payment for.
 *
 * The checkout tests leave a few behind on every run, so these are reused instead of spending a checkout
 * call (about 10 allowed per 10 minutes, see utils/rateLimit.ts). Only when none is left is one placed.
 */
export async function payableOrders(
  customerApi: Api,
  count: number,
  setup: OrderSetup,
): Promise<OrderPayment[]> {
  const found: OrderPayment[] = [];
  const page = await json<Page<OrderSummary>>(
    customerApi.orders.list({ page: 1, limit: 50, state: 'active' }),
  );
  for (const order of page.data.filter((o) => o.status === 'pending')) {
    const payment = await json<OrderPayment>(customerApi.payment.order(order.id));
    if (payment.isPayable && payment.paymentStatus === 'pending') found.push(payment);
    if (found.length === count) return found;
  }
  while (found.length < count) found.push(await placeCodOrder(customerApi, setup));
  return found;
}

/** A paid order of the test customer (card orders are paid at checkout), or null when there is none. */
export async function paidOrder(customerApi: Api): Promise<OrderPayment | null> {
  const page = await json<Page<OrderSummary>>(customerApi.orders.list({ page: 1, limit: 50 }));
  for (const order of page.data) {
    const payment = await json<OrderPayment>(customerApi.payment.order(order.id));
    if (payment.paymentStatus === 'paid') return payment;
  }
  return null;
}

async function placeCodOrder(
  customerApi: Api,
  { api, storeInfo, cleanup }: OrderSetup,
): Promise<OrderPayment> {
  let [address] = await json<Address[]>(customerApi.users.listAddresses());
  if (!address) {
    address = await json<Address>(customerApi.users.createAddress(buildAddress()));
    const id = address.id;
    cleanup.add('delete the address made for the order', () => customerApi.users.deleteAddress(id));
  }
  const { product, quantity } = await quantityForExactly(api, storeInfo.minOrderAmount);
  const [other] = (await purchasableProducts(api, 5)).filter((p) => p.id !== product.id);
  await customerApi.cart.seed([
    { productId: product.id, quantity },
    { productId: other.id, quantity: 1 },
  ]);
  const placed = await json<{ orderId: string }>(
    retryOn429(() =>
      customerApi.cart.checkout({
        consentForSimilarProducts: 'false',
        paymentMethod: 'cod',
        addressId: address.id,
      }),
    ),
  );
  return json<OrderPayment>(customerApi.payment.order(placed.orderId));
}
