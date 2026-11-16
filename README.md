# Dukkanti automated tests

UI and API tests for the Dukkanti storefront (`https://dev.dukkanti.com`, API `https://api.stg.dukkanti.com/v1`),
written with Playwright and TypeScript.

- What the app looks like and which endpoints exist: [docs/APP_MAP.md](docs/APP_MAP.md)
- Every test in plain English: [docs/PROJECT_GUIDE.md](docs/PROJECT_GUIDE.md)

## Getting started

```bash
npm ci
npx playwright install chromium
cp .env.example .env      # then fill it in
npm run test:smoke
```

### What goes in `.env`

| Variable                                         | What it is                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `BASE_URL`, `API_URL`                            | Storefront and API addresses. The defaults point at dev.                                                                       |
| `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | Cloudflare Access service token for the storefront. Needed on CI.                                                              |
| `CF_AUTHORIZATION`                               | Alternative for local runs: the `CF_Authorization` cookie of a browser that is already let in. It expires after about a month. |
| `CUSTOMER_PHONE`, `CUSTOMER_OTP`                 | Test customer and its fixed 4-digit code.                                                                                      |
| `CUSTOMER_DIAL_CODE`                             | Country code, when the phone number is written without one (`+971`, `+977` or `+1`).                                           |
| `CUSTOMER2_PHONE`, `CUSTOMER2_OTP`               | Optional second customer for "A cannot see B's data" tests.                                                                    |
| `STRIPE_TEST_CARD`                               | Stripe test card number used at checkout.                                                                                      |

`.env` is never committed. On CI the same names are GitHub Secrets (`CUSTOMER_DIAL_CODE` is a repository
variable). Reporters remove secrets, tokens and card numbers from anything they write.
Traces and videos of failed tests can still show what was typed, so keep the repository and its artifacts private.

## Running tests

| Command                      | What it runs                                                 |
| ---------------------------- | ------------------------------------------------------------ |
| `npm run test:smoke`         | The most critical UI flows (`@smoke`)                        |
| `npm test`                   | All UI and API tests                                         |
| `npm run test:ui`            | UI tests only                                                |
| `npm run test:api`           | API tests only                                               |
| `npm run test:cleanup`       | Deletes old test data (names ending in `qa` + 6 digits)      |
| `npm run test:exclusive`     | Tests that change store-wide settings, one at a time         |
| `npm run test:cross-browser` | Smoke set on Firefox, WebKit and two mobile screens          |
| `npm run test:all`           | Typecheck, cleanup, then everything: what the daily run does |
| `npm run report`             | Opens the HTML report of the last run                        |
| `npm run typecheck`          | `tsc --noEmit`                                               |
| `npm run format`             | Prettier                                                     |
| `npm run known-bugs`         | Lists known app bugs and the tests that use them             |

Run one feature with a tag: `npx playwright test --project=ui --grep @search`.
Flaky tests tagged `@quarantine` are left out; include them with `QUARANTINE=1`.

Every run starts with the `setup` project. It gets past Cloudflare Access, signs in once per role, saves the
sessions in `.auth/`, and checks the store settings (for example that Stripe is in test mode). If something is
missing it says what, and the other tests do not start.

## Folder structure

```
config/env.ts          reads .env: URLs, credentials, expected store settings
fixtures/test.ts       the `test` every spec imports: page objects, API clients, `cleanup`
pages/                 page objects, one folder per feature
api/                   one API client per resource, on a shared ResourceApi base
utils/testData.ts      faker-based builders: buildAddress(), buildCustomer()...
utils/network.ts       wait for / record the API calls the UI makes
utils/knownBug.ts      knownBug('key') marker
utils/redact.ts        removes secrets from report text
reporters/             GitHub summary table and failures file
scripts/               known-bugs list, run-everything script
known-bugs.json        the list of known app bugs
tests/setup/           sign in per role, store settings check
tests/cleanup/         deletes old marked test data
tests/<feature>/       <feature>.spec.ts (UI) and <feature>.api.spec.ts (API)
tests/exclusive/       tests that change store-wide settings (none yet)
.github/workflows/     CI
docs/                  app map and project guide
```

## Writing tests

- Import `test` and `expect` from `fixtures/test`, never from `@playwright/test`.
- Every feature gets a UI spec and an API spec. API specs cover status codes, validation messages,
  response shape and permissions.
- Names describe behaviour: `should add the product to the cart when user clicks Add to cart`.
  Use `test.step()` so the report reads like a manual test case.
- Tags: a feature tag (`@cart`), `@smoke` for the critical flows, `@quarantine` for flaky tests.
- Use `getByRole` / `getByLabel`. No `waitForTimeout`.
- Tests start as a guest. A spec that needs a signed-in customer adds
  `test.use({ storageState: env.storageState.customer })`. API tests use the `api` (guest) or
  `customerApi` (signed-in) fixtures.
- **Test data.** There is no admin access, so tests cannot create products, deals or coupons. They pick a
  product at run time with `api.products.findPurchasable()`. Everything a test does create (address, profile
  name, form submission) gets a name from `qaName()`, ending in `qa` + 6 digits.
- Right after creating something, register its removal: `cleanup.add('address Home qa123456', () => ...)`.
  It runs even when the test fails.
- Tests must pass alone, in any order and in parallel. Do not rely on data that is already in the store.
- **Known app bugs.** Do not weaken the assertion. Add the bug to `known-bugs.json` (with its GitHub issue) and
  put `knownBug('key')` on the first line of the test. The test is then expected to fail and the run stays
  green. When the bug is fixed the test passes, the run flags it, and the marker should be removed.

## CI

| Workflow       | When                                                                          | What                                                 |
| -------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| `pr.yml`       | Every pull request                                                            | Typecheck, formatting, known-bug check, smoke        |
| `daily.yml`    | Daily at 06:30 Nepal time, started by cron-job.org; GitHub schedule as backup | Cleanup, then all UI and API tests                   |
| `watchdog.yml` | Daily, 90 minutes after the regression time                                   | Opens an issue if the daily run did not start        |
| `weekly.yml`   | Saturdays                                                                     | Smoke on Firefox, WebKit and mobile; exclusive tests |

Each run writes a results table to its summary page and uploads the HTML report as an artifact. On `main`,
the daily run opens or updates one GitHub issue (label `daily-regression`) when a test failed, passed only
after a retry, a known bug started passing, or the run was cancelled or timed out. It closes the issue after a clean run.

Still to do before CI can work:

1. Create the GitHub repository and add the secrets listed above.
2. Get a Cloudflare Access **service token** for `dev.dukkanti.com`. Without it CI cannot open the storefront.
3. Create the cron-job.org job for 06:30 Asia/Kathmandu (instructions at the top of `daily.yml`).
