import { defineConfig, devices, type Project } from '@playwright/test';
import { env } from './config/env';

const UI_TESTS = /.*(?<!\.api)\.spec\.ts$/;
const API_TESTS = /.*\.api\.spec\.ts$/;
const EXCLUSIVE = /tests[\\/]exclusive[\\/]/;

const guest = { storageState: env.storageState.guest };

/** Weekly run of the smoke set on other browsers and phone-sized screens. */
const crossBrowser: Project[] = [
  { name: 'smoke-firefox', device: 'Desktop Firefox' },
  { name: 'smoke-webkit', device: 'Desktop Safari' },
  { name: 'smoke-mobile-chrome', device: 'Pixel 7' },
  { name: 'smoke-mobile-safari', device: 'iPhone 14' },
].map(({ name, device }) => ({
  name,
  testMatch: UI_TESTS,
  testIgnore: EXCLUSIVE,
  grep: /@smoke/,
  dependencies: ['setup'],
  use: { ...devices[device], ...guest },
}));

export default defineConfig({
  testDir: './tests',
  outputDir: 'test-results/artifacts',
  fullyParallel: true,
  forbidOnly: env.isCI,
  retries: env.isCI ? 2 : 0,
  workers: env.isCI ? 4 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Stops by itself before the CI job timeout, so the reporters still get to write their results.
  globalTimeout: env.isCI ? 40 * 60_000 : undefined,
  // @quarantine tests are flaky and stay out of normal runs. Run them with QUARANTINE=1.
  grepInvert: process.env.QUARANTINE ? undefined : /@quarantine/,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['./reporters/githubSummaryReporter.ts'],
    ['./reporters/failureReporter.ts'],
  ],

  use: {
    baseURL: env.baseUrl,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'en-US',
    timezoneId: 'Asia/Dubai',
  },

  projects: [
    // Logs in once per role, saves the sessions, and checks the store settings.
    { name: 'setup', testMatch: /setup[\\/].*\.setup\.ts$/ },

    // The most critical UI flows. Runs on every pull request.
    {
      name: 'smoke',
      testMatch: UI_TESTS,
      testIgnore: EXCLUSIVE,
      grep: /@smoke/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], ...guest },
    },

    // Every UI test. Tests start as a guest; customer tests opt in with
    // `test.use({ storageState: env.storageState.customer })`.
    {
      name: 'ui',
      testMatch: UI_TESTS,
      testIgnore: EXCLUSIVE,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], ...guest },
    },

    // API tests: no browser.
    { name: 'api', testMatch: API_TESTS, dependencies: ['setup'] },

    // Deletes old marked test data. Runs before the daily regression.
    { name: 'cleanup', testMatch: /cleanup[\\/].*\.cleanup\.ts$/, dependencies: ['setup'] },

    // Tests that change store-wide settings. Runs alone (one worker), weekly, and restores what it changed.
    // Empty for now: store-wide settings are admin-only and admin is out of scope.
    {
      name: 'exclusive',
      testMatch: EXCLUSIVE,
      fullyParallel: false,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], ...guest },
    },

    ...crossBrowser,
  ],
});
