import fs from 'node:fs';
import { test as base, expect, request as playwrightRequest } from '@playwright/test';
import { buildApi, type Api } from '../api';
import { env, requireCustomer } from '../config/env';
import { SignInDialog } from '../pages/auth/SignInDialog';
import { ProductListPage } from '../pages/catalog/ProductListPage';
import { HomePage } from '../pages/home/HomePage';

type CleanupFn = () => Promise<unknown>;

export interface Cleanup {
  /** Register an undo step right after creating something. Runs after the test, even when it fails. */
  add(label: string, fn: CleanupFn): void;
}

interface TestFixtures {
  cleanup: Cleanup;
  /** API clients calling as a guest (no token). */
  api: Api;
  /** API clients calling as the logged-in customer. */
  customerApi: Api;
  homePage: HomePage;
  productListPage: ProductListPage;
  signInDialog: SignInDialog;
}

interface WorkerFixtures {
  customerToken: string;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  // Fail in one line when a saved session is missing, instead of a file-not-found stack trace.
  storageState: async ({ storageState }, use) => {
    if (typeof storageState === 'string' && !fs.existsSync(storageState)) {
      throw new Error(
        `Saved session ${storageState} does not exist. The setup project did not create it: ` +
          'check the setup output (missing CUSTOMER_PHONE/CUSTOMER_OTP or Cloudflare Access credentials).',
      );
    }
    await use(storageState);
  },

  cleanup: async ({}, use, testInfo) => {
    const steps: { label: string; fn: CleanupFn }[] = [];
    await use({ add: (label, fn) => steps.push({ label, fn }) });

    const failures: string[] = [];
    // Newest first, so things are removed in the reverse order they were created.
    for (const step of steps.reverse()) {
      try {
        await step.fn();
      } catch (error) {
        failures.push(`${step.label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (failures.length) {
      // Leftovers are picked up by the cleanup project; report them without failing the test.
      testInfo.annotations.push({ type: 'cleanup-failed', description: failures.join(' | ') });
    }
  },

  customerToken: [
    async ({}, use) => {
      // The setup project saves the token next to the browser session; reuse it when it is there.
      if (fs.existsSync(env.customerTokenFile)) {
        const saved = JSON.parse(fs.readFileSync(env.customerTokenFile, 'utf8')) as { token?: string };
        if (saved.token) return use(saved.token);
      }
      const context = await playwrightRequest.newContext();
      try {
        const { token } = await buildApi(context).users.loginAs(requireCustomer());
        await use(token);
      } finally {
        await context.dispose();
      }
    },
    { scope: 'worker' },
  ],

  api: async ({ request }, use) => use(buildApi(request)),
  customerApi: async ({ request, customerToken }, use) => use(buildApi(request, customerToken)),

  homePage: async ({ page }, use) => use(new HomePage(page)),
  productListPage: async ({ page }, use) => use(new ProductListPage(page)),
  signInDialog: async ({ page }, use) => use(new SignInDialog(page)),
});

export { expect };
