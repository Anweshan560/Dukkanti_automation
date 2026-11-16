import { json, type StoreInfo } from '../../api';
import { env } from '../../config/env';
import { expect, test as setup } from '../../fixtures/test';

/**
 * Checks, before anything else runs, that the store is set up the way the tests expect.
 * A wrong setting fails here with one clear message instead of as dozens of confusing test failures.
 */
setup('store is configured the way the tests expect', async ({ api }) => {
  const info = await setup.step('Read the store settings from GET /info', async () =>
    json<StoreInfo>(api.info.getInfo()),
  );

  await setup.step('Payments are in Stripe TEST mode', async () => {
    expect(
      info.stripePublishableKey,
      `Stripe is not in test mode on ${env.apiUrl}. Refusing to run: tests place orders and pay by card.`,
    ).toMatch(/^pk_test_/);
  });

  await setup.step('Order rules the cart and checkout tests rely on are present', async () => {
    expect(info.minOrderAmount, 'minOrderAmount must be a positive number').toBeGreaterThan(0);
    expect(info.deliveryFee, 'deliveryFee must be a number').toBeGreaterThanOrEqual(0);
    expect(
      info.deliveryCutOff,
      'deliveryCutOff (free delivery threshold) must be above the minimum order',
    ).toBeGreaterThan(info.minOrderAmount);
    expect(info.codFee, 'codFee must be a number').toBeGreaterThanOrEqual(0);
    expect(info.taxPercentage, 'taxPercentage must be a number').toBeGreaterThanOrEqual(0);
  });

  await setup.step('The catalog has products in stock', async () => {
    await api.products.findPurchasable();
  });
});
