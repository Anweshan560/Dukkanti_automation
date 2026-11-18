/**
 * Dialogs a guest can open: keyboard and screen-reader basics (see dialogCheck.ts).
 */
import { expect, test } from '../../fixtures/test';
import { knownBug } from '../../utils/knownBug';
import { checkDialog } from './dialogCheck';

test.describe('Dialogs for a guest', { tag: ['@sweep', '@a11y', '@nonfunctional'] }, () => {
  test('the sign-in dialog takes the focus, passes axe, closes with Escape and gives the focus back', async ({ page, homePage, signInDialog }) => {
    knownBug('signin-dialog-focus-not-returned');
    await homePage.open();
    const trigger = homePage.header.signInButton;
    await checkDialog(page, 'sign-in dialog', () => trigger.click(), signInDialog.phoneStep, trigger);
  });

  test('the sign-in dialog opened from Add to cart gives the focus back to that button', async ({ page, signInDialog }) => {
    knownBug('signin-dialog-focus-not-returned');
    await page.goto('/products');
    const addToCart = page.getByRole('main').getByRole('button', { name: /^Add .* to cart$/ }).first();
    await expect(addToCart).toBeVisible();
    await checkDialog(page, 'sign-in dialog', () => addToCart.click(), signInDialog.phoneStep, addToCart);
  });

  test.describe('on a 390px phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('the phone menu takes the focus, passes axe, closes with Escape and gives the focus back', async ({ page, homePage }) => {
      await homePage.open();
      const trigger = homePage.header.menuButton;
      await checkDialog(page, 'phone menu', () => trigger.click(), homePage.header.mobileMenu, trigger);
    });
  });
});
