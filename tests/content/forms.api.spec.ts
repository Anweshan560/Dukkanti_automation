/**
 * Form endpoints (contact, business inquiry): required fields, bad values and hostile text.
 *
 * BUDGET: `/forms/*` allows about 10 calls per caller per 10+ minutes, refused calls included. This file
 * makes 5 calls (several rules checked per call, since the API names every broken field at once) and
 * forms.spec.ts at most 4, leaving one spare. Every call waits out a 429 instead of failing.
 * Valid submissions carry the `qa######` marker in the name.
 */
import { errorMessage } from '../../api';
import { expect, test } from '../../fixtures/test';
import { CHECKOUT_TEST_TIMEOUT, retryOn429 } from '../../utils/rateLimit';
import { knownBug } from '../../utils/knownBug';
import { HOSTILE_STRINGS } from '../../utils/shop';
import { buildContactMessage, qaName, qaSuffix } from '../../utils/testData';

test.describe.configure({ timeout: CHECKOUT_TEST_TIMEOUT });

const business = () => ({
  fullName: qaName('Test Person'),
  businessName: qaName('Test Trading'),
  email: `qa.${qaSuffix()}@example.com`,
  phoneNumber: '+971501234567',
});

test.describe('Contact form API', { tag: ['@content', '@forms', '@api'] }, () => {
  test('an empty message is refused with 400 naming the name, email and message', { tag: '@negative' }, async ({ api }) => {
    // The page requires an email; the API does not. The phone number is optional in both.
    knownBug('contact-email-optional-in-api');
    const response = await retryOn429(() => api.forms.contact({}));
    expect(response.status()).toBe(400);
    const message = await errorMessage(response);
    for (const field of ['fullName', 'email', 'message']) expect(message).toContain(field);
  });

  test('a bad email, a phone made of letters, a name that is not text and an empty message are all refused', { tag: '@negative' }, async ({ api }) => {
    const response = await retryOn429(() =>
      api.forms.raw('POST', '/contact', { fullName: 12345, email: 'not-an-email', phoneNumber: 'call me maybe', message: '' }),
    );
    expect(response.status()).toBe(400);
    const message = await errorMessage(response);
    expect.soft(message, 'email is not checked').toMatch(/email/i);
    expect.soft(message, 'the phone number is not checked').toMatch(/phone/i);
    expect.soft(message, 'the empty message is not refused').toMatch(/message/);
  });

  // Also the happy path: a complete message is accepted.
  test('a complete message is accepted, also with text that looks like code or SQL and very long text', { tag: '@security' }, async ({ api }) => {
    const hostile = Object.values(HOSTILE_STRINGS).join(' | ');
    const response = await retryOn429(() =>
      api.forms.contact(buildContactMessage({ fullName: `${HOSTILE_STRINGS.unicode} ${qaName('x')}`, message: `Automated test. ${hostile} ${'x'.repeat(5_000)}` })),
    );
    expect(response.status(), await errorMessage(response)).toBe(201);
  });
});

test.describe('Business inquiry API', { tag: ['@content', '@forms', '@api'] }, () => {
  test('a complete inquiry is accepted', async ({ api }) => {
    const response = await retryOn429(() => api.forms.business(business()));
    expect(response.status(), await errorMessage(response)).toBe(201);
  });

  test('an empty inquiry is refused with 400 naming the required fields', { tag: '@negative' }, async ({ api }) => {
    const response = await retryOn429(() => api.forms.business({}));
    expect(response.status()).toBe(400);
    const message = await errorMessage(response);
    for (const field of ['fullName', 'businessName', 'email']) expect(message).toContain(field);
    // The phone number message is worded for people: "Enter a valid phone number".
    expect(message).toMatch(/phone/i);
  });
});
