import { json, type Address } from '../../api';
import { env } from '../../config/env';
import { expect, test as cleanup } from '../../fixtures/test';
import { isQaMarked } from '../../utils/testData';

/**
 * Deletes addresses left behind by earlier runs. Only addresses whose nickname ends in `qa` + 6 digits
 * are touched, so anything created by hand is safe.
 */
cleanup('delete leftover test addresses of the customer', async ({ customerApi }) => {
  cleanup.skip(!env.customer, 'CUSTOMER_PHONE and CUSTOMER_OTP are not set, nothing to clean.');

  const addresses = await json<Address[]>(customerApi.users.listAddresses());
  const leftovers = addresses.filter((address) => isQaMarked(address.nickName));

  for (const address of leftovers) {
    await cleanup.step(`Delete address "${address.nickName}"`, async () => {
      const response = await customerApi.users.deleteAddress(address.id);
      expect(response.ok(), `Deleting address ${address.id} returned ${response.status()}`).toBe(true);
    });
  }
  cleanup
    .info()
    .annotations.push({ type: 'cleaned', description: `${leftovers.length} address(es) deleted` });
});
