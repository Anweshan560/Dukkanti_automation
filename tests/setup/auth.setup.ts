import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env';
import { expect, test as setup } from '../../fixtures/test';
import { SignInDialog } from '../../pages/auth/SignInDialog';
import { waitForApi } from '../../utils/network';

// Nothing is saved yet, so start every setup test from an empty browser.
setup.use({ storageState: { cookies: [], origins: [] } });
setup.describe.configure({ mode: 'serial' });

setup('guest session: get past Cloudflare Access and save it', async ({ context, page }) => {
  fs.mkdirSync(path.dirname(env.storageState.guest), { recursive: true });
  const { clientId, clientSecret, cookie } = env.cloudflareAccess;

  await setup.step('Present the Cloudflare Access credentials', async () => {
    if (clientId && clientSecret) {
      // A service token is exchanged for the CF_Authorization cookie on the first request.
      const response = await context.request.get(env.baseUrl, {
        headers: { 'CF-Access-Client-Id': clientId, 'CF-Access-Client-Secret': clientSecret },
      });
      expect(response.status(), 'Cloudflare Access rejected the service token').toBeLessThan(400);
    } else if (cookie) {
      await context.addCookies([
        { name: 'CF_Authorization', value: cookie, url: env.baseUrl, httpOnly: true, secure: true },
      ]);
    }
  });

  await setup.step('Open the storefront', async () => {
    await page.goto('/');
    if (page.url().includes('cloudflareaccess.com')) {
      throw new Error(
        `${env.baseUrl} is behind Cloudflare Access and the credentials are missing or expired. ` +
          'Set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET (service token), or a fresh CF_AUTHORIZATION cookie, in .env.',
      );
    }
    if (await page.getByText('Performing security verification').isVisible()) {
      throw new Error(
        'Cloudflare\'s bot check ("Verify you are human") blocked this machine. It challenges data-centre IPs ' +
          'such as GitHub runners. Ask the site owner for a WAF skip rule for the test traffic, or run CI on a self-hosted runner.',
      );
    }
    await expect(page.getByRole('banner').getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  await context.storageState({ path: env.storageState.guest });
});

setup('customer session: sign in with phone and OTP and save it', async ({ browser }) => {
  if (!env.customer) {
    const message = 'CUSTOMER_PHONE and CUSTOMER_OTP are not set, so no customer session was saved.';
    // On CI a missing login is a broken pipeline. Locally, guest-only tests can still run.
    if (env.isCI) throw new Error(message);
    setup.skip(
      true,
      `${message} Tests that need a signed-in customer will fail until they are added to .env.`,
    );
    return;
  }
  const customer = env.customer;

  const context = await browser.newContext({ storageState: env.storageState.guest });
  const page = await context.newPage();
  try {
    const dialog = new SignInDialog(page);

    await page.goto('/');
    const login = waitForApi(page, 'POST', '/users/login', 30_000);
    await setup.step('Sign in through the dialog', async () => {
      await page.getByRole('banner').getByRole('button', { name: 'Sign in' }).click();
      await dialog.signIn(customer);
    });

    await setup.step('Save the browser session and the API token', async () => {
      const response = await login;
      expect(response.ok(), `POST /users/login returned ${response.status()}`).toBe(true);
      const body = (await response.json()) as { token: string };
      fs.writeFileSync(env.customerTokenFile, JSON.stringify({ token: body.token }));
      await context.storageState({ path: env.storageState.customer });
    });
  } finally {
    await context.close();
  }
});
