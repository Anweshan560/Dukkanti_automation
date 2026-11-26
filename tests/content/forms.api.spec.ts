/**
 * Form endpoints (contact, business inquiry): required fields, bad values and hostile text.
 *
 * BUDGET: `/forms/*` allows 5 calls per caller per hour, refused calls included (measured 2026-11-26).
 * This file makes 4 (several rules checked per call, since the API names every broken field at once) and
 * forms.spec.ts 1 (the complete contact message, which also carries the hostile text). Do not add calls:
 * a 429 skips the test, with the reason in the report. Valid submissions carry the `qa######` marker.
 */
import { errorMessage } from '../../api';
import { expect, test } from '../../fixtures/test';
import { skipIfFormsRateLimited } from '../../utils/rateLimit';
import { knownBug } from '../../utils/knownBug';
import { qaName, qaSuffix } from '../../utils/testData';

const business = () => ({
  fullName: qaName('Test Person'),
  businessName: qaName('Test Trading'),
  email: `qa.${qaSuffix()}@example.com`,
  phoneNumber: '+971501234567',
});

test.describe('Contact form API', { tag: ['@content', '@forms', '@api'] }, () => {
  test(
    'an empty message is refused with 400 naming the name, email and message',
    { tag: '@negative' },
    async ({ api }) => {
      // The page requires an email; the API does not. The phone number is optional in both.
      knownBug('contact-email-optional-in-api');
      const response = await api.forms.contact({});
      skipIfFormsRateLimited(response);
      expect(response.status()).toBe(400);
      const message = await errorMessage(response);
      for (const field of ['fullName', 'email', 'message']) expect(message).toContain(field);
    },
  );

  test(
    'a bad email, a phone made of letters, a name that is not text and an empty message are all refused',
    { tag: '@negative' },
    async ({ api }) => {
      const response = await api.forms.raw('POST', '/contact', {
        fullName: 12345,
        email: 'not-an-email',
        phoneNumber: 'call me maybe',
        message: '',
      });
      skipIfFormsRateLimited(response);
      expect(response.status()).toBe(400);
      const message = await errorMessage(response);
      expect.soft(message, 'email is not checked').toMatch(/email/i);
      expect.soft(message, 'the phone number is not checked').toMatch(/phone/i);
      expect.soft(message, 'the empty message is not refused').toMatch(/message/);
    },
  );
});

test.describe('Business inquiry API', { tag: ['@content', '@forms', '@api'] }, () => {
  test('a complete inquiry is accepted', async ({ api }) => {
    const response = await api.forms.business(business());
    skipIfFormsRateLimited(response);
    expect(response.status(), await errorMessage(response)).toBe(201);
  });

  test(
    'an empty inquiry is refused with 400 naming the required fields',
    { tag: '@negative' },
    async ({ api }) => {
      const response = await api.forms.business({});
      skipIfFormsRateLimited(response);
      expect(response.status()).toBe(400);
      const message = await errorMessage(response);
      for (const field of ['fullName', 'businessName', 'email']) expect(message).toContain(field);
      // The phone number message is worded for people: "Enter a valid phone number".
      expect(message).toMatch(/phone/i);
    },
  );
});
