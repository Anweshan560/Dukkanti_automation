import { expect, test } from '../../fixtures/test';

test.describe('Home and search', { tag: ['@home', '@search'] }, () => {
  test(
    'should show matching products when a guest searches from the home page',
    { tag: '@smoke' },
    async ({ homePage, productListPage, api }) => {
      // Search for a word taken from a real product name, so the test does not depend on fixed store data.
      const product = await api.products.findPurchasable();
      const term = product.name.split(/\s+/).find((word) => /^[A-Za-z]{4,}$/.test(word)) ?? product.name;

      await test.step('Open the home page', async () => {
        await homePage.open();
        await expect(homePage.categoriesHeading).toBeVisible();
        await expect(homePage.addToCartButtons.first()).toBeVisible();
      });

      await test.step(`Search for "${term}" in the header`, async () => {
        await homePage.header.search(term);
      });

      await test.step('The results page lists products for that search', async () => {
        await productListPage.expectLoaded();
        await expect(productListPage.heading).toContainText(term);
        expect(await productListPage.totalResults()).toBeGreaterThan(0);
        await expect(productListPage.addToCartButtons.first()).toBeVisible();
      });
    },
  );
});
