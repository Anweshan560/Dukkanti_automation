import type { StoreInfo } from '../../api';
import { expect, test } from '../../fixtures/test';

test.describe('Store info API', { tag: '@info' }, () => {
  test('should return the store settings to a guest when GET /info is called', async ({ api }) => {
    const response = await test.step('Call GET /info without a token', () => api.info.getInfo());

    await test.step('Responds 200 with JSON', async () => {
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('application/json');
    });

    await test.step('The body has every setting the storefront needs, with the right types', async () => {
      const info = (await response.json()) as StoreInfo;
      expect(info).toEqual(
        expect.objectContaining({
          minVersion: expect.stringMatching(/^\d+\.\d+\.\d+$/),
          minOrderAmount: expect.any(Number),
          deliveryFee: expect.any(Number),
          deliveryCutOff: expect.any(Number),
          codFee: expect.any(Number),
          taxPercentage: expect.any(Number),
          localBrandsEnabled: expect.any(Boolean),
          sameDayDeliveryEnabled: expect.any(Boolean),
          sameDayCutoff: expect.stringMatching(/^\d{2}:\d{2}$/),
          stripePublishableKey: expect.stringMatching(/^pk_test_/),
        }),
      );
      expect(Number.isNaN(Date.parse(info.deliveryEstimate.date)), 'deliveryEstimate.date is a date').toBe(
        false,
      );
      // After the same-day cut-off there is nothing to order by today, so orderBy is null.
      const { orderBy } = info.deliveryEstimate;
      if (orderBy !== null)
        expect(Number.isNaN(Date.parse(orderBy)), 'deliveryEstimate.orderBy is a date or null').toBe(false);
    });
  });
});
