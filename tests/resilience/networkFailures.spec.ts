/**
 * What a guest sees when the API fails or the connection drops. The failures are faked in the browser
 * (page.route), so nothing reaches the API: these tests use none of the forms or checkout budget.
 */
import type { Page, Route } from '@playwright/test';
import { env } from '../../config/env';
import { expect, test } from '../../fixtures/test';
import { knownBug } from '../../utils/knownBug';

const serverError = (route: Route) =>
  route.fulfill({ status: 500, json: { message: 'Internal server error', statusCode: 500 } });

/** A message telling the shopper something went wrong, in the page or as a toast. */
const failureNotice = (page: Page) =>
  page
    .getByRole('main')
    .getByText(/couldn.t|could not|unable to|something went wrong|try again|went wrong/i)
    .or(page.getByRole('main').getByRole('alert'))
    .or(page.getByRole('region', { name: 'Notifications' }).getByRole('dialog'))
    .first();

test.describe('When the API fails', { tag: ['@resilience', '@nonfunctional'] }, () => {
  for (const [name, fail] of [
    ['answers 500', serverError],
    ['cannot be reached', (route: Route) => route.abort('internetdisconnected')],
  ] as const) {
    test(`the product list says so when the products API ${name}`, async ({ page }) => {
      // Today the heading and filters show and the list is simply blank, like an empty shop.
      knownBug('products-list-fails-silently');
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route(`${env.apiUrl}/products?**`, fail);
      await page.goto('/products');
      await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
      expect(errors, 'The page crashed').toEqual([]);
      await expect(failureNotice(page), 'Nothing tells the shopper the products did not load').toBeVisible();
    });
  }

  test('search still opens the results page when the suggestions fail', async ({ page, homePage }) => {
    await homePage.open();
    await page.route(`${env.apiUrl}/products?**`, serverError);
    await homePage.header.searchBox.fill('tea');
    await homePage.header.searchBox.press('Enter');
    await expect(page).toHaveURL(/\/products\?searchTerm=tea/);
  });

  test('the contact form shows the error and keeps what was typed when sending fails', async ({ page }) => {
    await page.route(`${env.apiUrl}/forms/**`, serverError);
    await page.goto('/contact');
    const main = page.getByRole('main');
    const field = (name: string) => main.getByRole('textbox', { name, exact: true });
    await field('Name').fill('qa000000 Network Failure');
    await field('Email').fill('qa.000000@example.com');
    await field('Message').fill('Automated test, never sent.');
    await main.getByRole('button', { name: 'Submit' }).click();

    await expect(
      page
        .getByRole('region', { name: 'Notifications' })
        .getByRole('dialog', { name: 'Internal server error' }),
      'No error was shown',
    ).toBeVisible();
    await expect(main.getByText(/thank you|message (has been )?sent/i)).toHaveCount(0);
    await expect(field('Message'), 'The message was lost').toHaveValue('Automated test, never sent.');
  });
});
