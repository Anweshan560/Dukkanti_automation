/**
 * Contact, business inquiry, sell and request forms as a guest: required fields, bad values, a valid
 * submission, and text that looks like code.
 *
 * BUDGET: see forms.api.spec.ts (5 calls per hour). Only the complete contact message reaches the API.
 * The inquiry test checks the request the page builds and answers it itself, the sell form posts to
 * Make.com, and the rest check that the page stops a bad form before sending anything. Submissions
 * carry the `qa######` marker in the name.
 */
import { faker } from '@faker-js/faker';
import type { Locator, Page, Request } from '@playwright/test';
import { env } from '../../config/env';
import { expect, test } from '../../fixtures/test';
import { knownBug } from '../../utils/knownBug';
import { recordApiCalls } from '../../utils/network';
import { skipIfFormsRateLimited } from '../../utils/rateLimit';
import { HOSTILE_STRINGS } from '../../utils/shop';
import { qaName, qaSuffix } from '../../utils/testData';

/** Where the sell form posts its applications (a Make.com automation, not the Dukkanti API). */
const MAKE_WEBHOOK = /^https:\/\/hook\.[^/]*make\.com\//;

/** A success message: a toast, an alert or a thank-you text. */
const success = (page: Page): Locator =>
  page
    .getByRole('region', { name: 'Notifications' })
    .getByText(/thank|sent|received|submitted|we.ll be in touch|get back/i)
    .or(
      page
        .getByRole('main')
        .getByText(
          /thank you|message (has been )?sent|we.ll (get back|be in touch)|received your|application/i,
        ),
    )
    .first();

/** True when the page marks the field as wrong: aria-invalid, or the browser's own check (required, type=email). */
async function isInvalid(field: Locator): Promise<boolean> {
  return field.evaluate(
    (el) => el.getAttribute('aria-invalid') === 'true' || !(el as HTMLInputElement).checkValidity(),
  );
}

async function expectInvalid(field: Locator, what: string): Promise<void> {
  await expect.poll(() => isInvalid(field), { message: `${what} should be marked as wrong` }).toBe(true);
}

/** Clicks submit and returns how many form calls the page sent. */
async function submitAndCount(page: Page, submit: Locator, path: RegExp): Promise<number> {
  const calls = recordApiCalls(page);
  // The sell form posts to a Make.com webhook, outside the API: count those too.
  let webhookPosts = 0;
  const onRequest = (request: Request) => {
    if (request.method() === 'POST' && MAKE_WEBHOOK.test(request.url())) webhookPosts++;
  };
  page.on('request', onRequest);
  await submit.click();
  await page.waitForTimeout(1_500);
  calls.stop();
  page.off('request', onRequest);
  return calls.calls.filter((c) => c.method === 'POST' && path.test(c.path)).length + webhookPosts;
}

test.describe('Contact form', { tag: ['@content', '@forms'] }, () => {
  const field = (page: Page, name: string) =>
    page.getByRole('main').getByRole('textbox', { name, exact: true });
  const submit = (page: Page) => page.getByRole('main').getByRole('button', { name: 'Submit' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/contact');
    await expect(page.getByRole('heading', { name: 'Contact us', level: 1 })).toBeVisible();
  });

  test(
    'sending an empty form marks every required field and sends nothing',
    { tag: '@negative' },
    async ({ page }) => {
      expect(await submitAndCount(page, submit(page), /^\/forms\//), 'An empty contact form was sent').toBe(
        0,
      );
      for (const name of ['Name', 'Email', 'Message']) await expectInvalid(field(page, name), name);
      // The phone number is optional.
      expect(
        await isInvalid(field(page, 'Phone number')),
        'The optional phone number is marked as wrong',
      ).toBe(false);
    },
  );

  test('an email without @ is stopped before sending', { tag: '@negative' }, async ({ page }) => {
    await field(page, 'Name').fill(qaName('Contact'));
    await field(page, 'Email').fill('not-an-email');
    await field(page, 'Phone number').fill('+971501234567');
    await field(page, 'Message').fill('Automated test, please ignore.');
    expect(await submitAndCount(page, submit(page), /^\/forms\/contact/), 'Sent with a bad email').toBe(0);
    await expectInvalid(field(page, 'Email'), 'Email');
  });

  test('a phone number made of letters is stopped before sending', { tag: '@negative' }, async ({ page }) => {
    knownBug('contact-phone-not-validated');
    // Name left empty on purpose: if the phone check is missing, the form is still stopped and not sent.
    await field(page, 'Email').fill(`qa.${qaSuffix()}@example.com`);
    await field(page, 'Phone number').fill('call me maybe');
    await field(page, 'Message').fill('Automated test, please ignore.');
    await submit(page).click();
    await expectInvalid(field(page, 'Phone number'), 'Phone number');
  });

  // Also checks that the API accepts text that looks like code or SQL, and very long text: one call does
  // both, to stay inside the budget.
  test('a complete message is sent and the shopper is told so', { tag: '@smoke' }, async ({ page }) => {
    const hostile = Object.values(HOSTILE_STRINGS).join(' | ');
    await field(page, 'Name').fill(`${HOSTILE_STRINGS.unicode} ${qaName(faker.person.fullName())}`);
    await field(page, 'Email').fill(`qa.${qaSuffix()}@example.com`);
    await field(page, 'Phone number').fill(`+97150${faker.string.numeric(7)}`);
    await field(page, 'Message').fill(`Automated test, please ignore. ${hostile} ${'x'.repeat(5_000)}`);
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/forms/contact') && r.request().method() === 'POST',
    );
    await submit(page).click();
    skipIfFormsRateLimited(await response);
    expect((await response).status(), await (await response).text()).toBe(201);
    await expect(success(page), 'No confirmation after sending the contact form').toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });

  test('the contact details link to email, phone and WhatsApp', async ({ page }) => {
    const aside = page.getByRole('main').getByRole('complementary');
    await expect(aside.getByRole('link', { name: 'info@dukkanti.com' })).toHaveAttribute(
      'href',
      'mailto:info@dukkanti.com',
    );
    await expect(aside.locator('a[href^="tel:"]')).toHaveCount(1);
    await expect(aside.locator('a[href^="https://wa.me/"]').first()).toBeVisible();
  });
});

test.describe('Business inquiry form', { tag: ['@content', '@forms'] }, () => {
  const field = (page: Page, name: string) =>
    page.getByRole('main').getByRole('textbox', { name, exact: true });
  const submit = (page: Page) => page.getByRole('main').getByRole('button', { name: 'Submit' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/business');
    await expect(page.getByRole('heading', { name: 'Business inquiry', level: 1 })).toBeVisible();
  });

  test(
    'sending an empty form marks the required fields and sends nothing',
    { tag: '@negative' },
    async ({ page }) => {
      expect(await submitAndCount(page, submit(page), /^\/forms\//)).toBe(0);
      for (const name of ['Company name', 'Contact name', 'Email', 'Phone number'])
        await expectInvalid(field(page, name), name);
    },
  );

  // The request the page builds is checked against the fields POST /forms/business requires (see
  // forms.api.spec.ts) and answered here, so this test spends none of the 5 calls per hour.
  test('a complete inquiry sends the fields the API expects and is confirmed', async ({ page }) => {
    knownBug('business-form-field-mismatch');
    let sent: Record<string, unknown> | undefined;
    await page.route(`${env.apiUrl}/forms/**`, async (route) => {
      sent = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 201, json: { message: 'ok' } });
    });
    await field(page, 'Company name').fill(qaName('Test Trading'));
    await field(page, 'Contact name').fill(qaName(faker.person.fullName()));
    await field(page, 'Email').fill(`qa.${qaSuffix()}@example.com`);
    await field(page, 'Phone number').fill(`+97150${faker.string.numeric(7)}`);
    await field(page, 'Message').fill('Automated test, please ignore.');
    await submit(page).click();
    await expect.poll(() => sent, { message: 'The page sent no inquiry' }).toBeTruthy();
    expect(Object.keys(sent ?? {}), 'The website form and the API disagree on the field names').toEqual(
      expect.arrayContaining(['fullName', 'businessName', 'email', 'phoneNumber']),
    );
    await expect(success(page)).toBeVisible();
  });
});

test.describe('Sell on Dukkanti form', { tag: ['@content', '@forms'] }, () => {
  const field = (page: Page, name: string) =>
    page.getByRole('main').getByRole('textbox', { name, exact: true });
  const submit = (page: Page) => page.getByRole('main').getByRole('button', { name: 'Submit application' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/sell');
    await expect(
      page.getByRole('heading', { name: 'Grow your business with Dukkanti', level: 1 }),
    ).toBeVisible();
  });

  test(
    'sending an empty application marks the required fields and sends nothing',
    { tag: '@negative' },
    async ({ page }) => {
      expect(await submitAndCount(page, submit(page), /^\/forms\//)).toBe(0);
      for (const name of [
        'Business name',
        'Contact person',
        'Email',
        'Phone number',
        'City',
        'Describe your products',
      ]) {
        await expectInvalid(field(page, name), name);
      }
      expect(
        await isInvalid(field(page, 'Instagram handle (optional)')),
        'An optional field is marked as wrong',
      ).toBe(false);
    },
  );

  test('an email without @ is stopped before sending', { tag: '@negative' }, async ({ page }) => {
    await field(page, 'Business name').fill(qaName('Shop'));
    await field(page, 'Email').fill('nope');
    expect(await submitAndCount(page, submit(page), /^\/forms\//)).toBe(0);
    await expectInvalid(field(page, 'Email'), 'Email');
  });

  test('a complete application is sent and confirmed', async ({ page }) => {
    const main = page.getByRole('main');
    await field(page, 'Business name').fill(qaName('Test Bakery'));
    await field(page, 'Contact person').fill(qaName(faker.person.fullName()));
    await field(page, 'Email').fill(`qa.${qaSuffix()}@example.com`);
    await field(page, 'Phone number').fill(`+97150${faker.string.numeric(7)}`);
    await main.getByRole('combobox', { name: 'Business type' }).click();
    await page.getByRole('option').first().click();
    await field(page, 'City').fill('Dubai');
    await field(page, 'Describe your products').fill('Automated test, please ignore.');
    // Since 2026-11 the sell form posts to a Make.com webhook instead of the Dukkanti API.
    const response = page.waitForResponse(
      (r) => r.request().method() === 'POST' && (/\/forms\//.test(r.url()) || MAKE_WEBHOOK.test(r.url())),
      { timeout: 30_000 },
    );
    await submit(page).click();
    expect((await response).ok(), 'The sell application was refused').toBe(true);
    await expect(success(page)).toBeVisible();
  });
});

test.describe('Request an item form (guest)', { tag: ['@content', '@forms'] }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/request');
    await expect(page.getByRole('heading', { name: 'Request an item', level: 1 })).toBeVisible();
  });

  test('an empty request is stopped and adds nothing to a cart', { tag: '@negative' }, async ({ page }) => {
    const main = page.getByRole('main');
    expect(
      await submitAndCount(page, main.getByRole('button', { name: 'Add request to cart' }), /^\/cart\//),
    ).toBe(0);
    const signIn = page.getByRole('dialog', { name: 'Sign in or create an account' });
    // Either the form is checked first or the guest is asked to sign in first; both stop the request.
    if (!(await signIn.isVisible()))
      await expectInvalid(main.getByRole('textbox', { name: 'Item name' }), 'Item name');
  });

  test(
    'a complete request from a guest asks them to sign in instead of adding it',
    { tag: ['@states', '@security'] },
    async ({ page, signInDialog }) => {
      const main = page.getByRole('main');
      await main.getByRole('textbox', { name: 'Item name' }).fill(qaName('Nabulsi cheese'));
      await main.getByRole('combobox', { name: 'Country of origin' }).click();
      await page.getByRole('option').first().click();
      await main.getByRole('radio', { name: '10–49' }).check();
      expect(
        await submitAndCount(page, main.getByRole('button', { name: 'Add request to cart' }), /^\/cart\//),
      ).toBe(0);
      await signInDialog.expectOpen();
    },
  );
});
