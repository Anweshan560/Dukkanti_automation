import type { Page } from '@playwright/test';
import { requireCustomer } from '../../config/env';
import { expect, test } from '../../fixtures/test';
import type { SignInDialog } from '../../pages/auth/SignInDialog';
import type { HomePage } from '../../pages/home/HomePage';
import { waitForApi } from '../../utils/network';

// Every test here starts as a guest and signs in (or fails to) by itself, so none of them touches the
// saved customer session that other tests share.

test.describe('Sign in', { tag: '@auth' }, () => {
  test(
    'should sign the customer in when they enter their phone number and the correct code',
    { tag: '@smoke' },
    async ({ page, homePage, signInDialog }) => {
      const customer = requireCustomer();

      await test.step('Open the home page as a guest and click Sign in', async () => {
        await homePage.open();
        await homePage.header.clickUntil(
          homePage.header.signInButton,
          signInDialog.phoneStep,
          'The sign-in dialog',
        );
      });

      await test.step('Enter the phone number and continue to the code step', async () => {
        await signInDialog.requestCode(customer);
        await expect(signInDialog.codeBoxes).toHaveCount(4);
      });

      await test.step('Enter the correct code', async () => {
        const login = waitForApi(page, 'POST', '/users/login');
        await signInDialog.enterCode(customer.otp);
        expect((await login).ok(), 'POST /users/login succeeded').toBe(true);
      });

      await test.step('The dialog closes and the header greets the customer', async () => {
        await signInDialog.expectClosed();
        await expect(homePage.header.accountButton).toContainText('Hello');
        await expect(homePage.header.signInButton).toBeHidden();
      });
    },
  );

  test('should keep the customer signed in after the page is reloaded', async ({
    page,
    homePage,
    signInDialog,
  }) => {
    await test.step('Sign in', async () => {
      await homePage.open();
      await homePage.header.clickUntil(
        homePage.header.signInButton,
        signInDialog.phoneStep,
        'The sign-in dialog',
      );
      await signInDialog.signIn(requireCustomer());
      await expect(homePage.header.accountButton).toBeVisible();
    });

    await test.step('Reload the page', async () => {
      await page.reload();
    });

    await test.step('The customer is still signed in', async () => {
      await expect(homePage.header.accountButton).toBeVisible();
      await expect(homePage.header.signInButton).toBeHidden();
    });
  });

  test('should sign the customer out when they choose Sign out from the account menu', async ({
    page,
    homePage,
    signInDialog,
  }) => {
    await test.step('Sign in', async () => {
      await homePage.open();
      await homePage.header.clickUntil(
        homePage.header.signInButton,
        signInDialog.phoneStep,
        'The sign-in dialog',
      );
      await signInDialog.signIn(requireCustomer());
      await expect(homePage.header.accountButton).toBeVisible();
    });

    await test.step('Open the account menu, click Sign out and confirm', async () => {
      await homePage.header.signOut();
    });

    await test.step('The header offers Sign in again', async () => {
      await expect(homePage.header.signInButton).toBeVisible();
      await expect(homePage.header.accountButton).toBeHidden();
    });

    await test.step('Account pages ask the visitor to sign in again', async () => {
      await page.goto('/account');
      await signInDialog.expectOpen();
    });
  });

  test('should keep the customer signed in when they cancel the "Sign out?" confirmation', async ({
    homePage,
    signInDialog,
  }) => {
    await test.step('Sign in', async () => {
      await homePage.open();
      await homePage.header.clickUntil(
        homePage.header.signInButton,
        signInDialog.phoneStep,
        'The sign-in dialog',
      );
      await signInDialog.signIn(requireCustomer());
      await expect(homePage.header.accountButton).toBeVisible();
    });

    await test.step('Open the account menu and click Sign out', async () => {
      await homePage.header.chooseSignOut();
      await expect(homePage.header.signOutConfirmation).toContainText(
        'You will need your mobile number to sign in again.',
      );
    });

    await test.step('Click Cancel', async () => {
      await homePage.header.signOutConfirmation.getByRole('button', { name: 'Cancel' }).click();
    });

    await test.step('The customer is still signed in', async () => {
      await expect(homePage.header.signOutConfirmation).toBeHidden();
      await expect(homePage.header.accountButton).toBeVisible();
    });
  });

  test('should show "Invalid OTP" and stay on the code step when the code is wrong', async ({
    page,
    homePage,
    signInDialog,
  }) => {
    const customer = requireCustomer();
    const wrongCode = customer.otp === '0000' ? '1111' : '0000';

    await test.step('Request a code for the phone number', async () => {
      await homePage.open();
      await homePage.header.clickUntil(
        homePage.header.signInButton,
        signInDialog.phoneStep,
        'The sign-in dialog',
      );
      await signInDialog.requestCode(customer);
    });

    await test.step('Enter a wrong code', async () => {
      const login = waitForApi(page, 'POST', '/users/login');
      await signInDialog.enterCode(wrongCode);
      expect((await login).status()).toBe(401);
    });

    await test.step('An error is shown and the visitor is still a guest', async () => {
      await expect(signInDialog.error).toHaveText('Invalid OTP');
      await expect(signInDialog.codeStep).toBeVisible();
      await expect(homePage.header.accountButton).toBeHidden();
    });
  });

  test('should show "Enter a valid mobile number" when the phone number is not valid', async ({
    homePage,
    signInDialog,
  }) => {
    await test.step('Open the sign-in dialog', async () => {
      await homePage.open();
      await homePage.header.clickUntil(
        homePage.header.signInButton,
        signInDialog.phoneStep,
        'The sign-in dialog',
      );
    });

    await test.step('Continue is disabled while the number is empty', async () => {
      await expect(signInDialog.continueButton).toBeDisabled();
    });

    await test.step('Enter a number that is too short for the UAE and continue', async () => {
      await signInDialog.enterPhone('+971', '12345');
      await signInDialog.continueButton.click();
    });

    await test.step('An error is shown and the code step does not open', async () => {
      await expect(signInDialog.error).toHaveText('Enter a valid mobile number');
      await expect(signInDialog.codeStep).toBeHidden();
    });
  });

  test('should go back to the phone number step when the visitor clicks Change', async ({
    homePage,
    signInDialog,
  }) => {
    const customer = requireCustomer();

    await test.step('Request a code', async () => {
      await homePage.open();
      await homePage.header.clickUntil(
        homePage.header.signInButton,
        signInDialog.phoneStep,
        'The sign-in dialog',
      );
      await signInDialog.requestCode(customer);
    });

    await test.step('Click Change', async () => {
      await signInDialog.changeNumberButton.click();
    });

    await test.step('The phone step is back, with the same country code selected', async () => {
      await expect(signInDialog.phoneStep).toBeVisible();
      await expect(signInDialog.countryCode).toContainText(customer.dialCode);
    });
  });

  test('should close the dialog and leave the visitor a guest when they click Close', async ({
    homePage,
    signInDialog,
  }) => {
    await test.step('Open the sign-in dialog', async () => {
      await homePage.open();
      await homePage.header.clickUntil(
        homePage.header.signInButton,
        signInDialog.phoneStep,
        'The sign-in dialog',
      );
    });

    await test.step('Click Close', async () => {
      await signInDialog.closeButton.click();
    });

    await test.step('The dialog is gone and Sign in is still offered', async () => {
      await signInDialog.expectClosed();
      await expect(homePage.header.signInButton).toBeVisible();
    });
  });

  // The code step has no "Resend code" (checked 2026-11-26, also after 30 s): Change and Continue is the
  // only way to get a new code.
  test('should send a new code and sign in with it after Change and Continue', async ({
    page,
    homePage,
    signInDialog,
  }) => {
    const customer = requireCustomer();

    await test.step('Request a code, then go back with Change', async () => {
      await homePage.open();
      await homePage.header.clickUntil(
        homePage.header.signInButton,
        signInDialog.phoneStep,
        'The sign-in dialog',
      );
      await signInDialog.requestCode(customer);
      await signInDialog.changeNumberButton.click();
      await expect(signInDialog.phoneStep).toBeVisible();
    });

    await test.step('Continue again sends a second code request', async () => {
      // The number may or may not still be filled in; enter it again either way.
      const again = waitForApi(page, 'POST', '/users/request-otp');
      await signInDialog.requestCode(customer);
      expect((await again).ok(), 'The second code request was refused').toBe(true);
    });

    await test.step('The code signs the customer in', async () => {
      await signInDialog.enterCode(customer.otp);
      await signInDialog.expectClosed();
      await expect(homePage.header.accountButton).toBeVisible();
    });
  });
});

test.describe('Sign-in attribution', { tag: ['@auth', '@tracking'] }, () => {
  /** Signs in through the dialog and returns the body the page sent to POST /users/login. */
  async function signInAndReadLogin(
    page: Page,
    homePage: HomePage,
    signInDialog: SignInDialog,
  ): Promise<{ attribution?: Record<string, string> }> {
    await homePage.header.clickUntil(
      homePage.header.signInButton,
      signInDialog.phoneStep,
      'The sign-in dialog',
    );
    const login = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/users/login'));
    await signInDialog.signIn(requireCustomer());
    return (await login).postDataJSON() as { attribution?: Record<string, string> };
  }

  test('a visitor who arrives from a tagged link has the tags sent with their sign-in', async ({
    page,
    homePage,
    signInDialog,
  }) => {
    const landing = '/?utm_source=qa&utm_medium=automated-test&utm_campaign=qa-attribution&gclid=qa-gclid';
    await page.goto(landing);
    await homePage.expectLoaded();
    // The tags are kept, so a visitor who browses on before signing in is still credited.
    await homePage.open();
    const body = await signInAndReadLogin(page, homePage, signInDialog);
    expect(body.attribution).toMatchObject({
      utmSource: 'qa',
      utmMedium: 'automated-test',
      utmCampaign: 'qa-attribution',
      gclid: 'qa-gclid',
      landingPage: landing,
    });
    expect(Date.parse(body.attribution?.touchedAt ?? ''), 'touchedAt is not a date').not.toBeNaN();
  });

  test('a visitor who arrives without tags sends no campaign tags with their sign-in', async ({
    page,
    homePage,
    signInDialog,
  }) => {
    await homePage.open();
    const body = await signInAndReadLogin(page, homePage, signInDialog);
    for (const key of ['utmSource', 'utmCampaign', 'gclid', 'fbclid'])
      expect(body.attribution?.[key], `${key} was sent without a tagged landing`).toBeUndefined();
  });
});

test.describe('Guest is asked to sign in', { tag: ['@auth', '@guest'] }, () => {
  // Guests have a cart of their own now (kept in the browser), so only an empty /cart asks them to sign in.
  // /checkout for a guest is covered in tests/checkout (phone step, empty cart).
  const gatedPages = [
    { name: 'an empty cart', path: '/cart' },
    { name: 'their profile', path: '/account' },
    { name: 'their orders', path: '/account/orders' },
    { name: 'their addresses', path: '/account/addresses' },
    { name: 'their wishlist', path: '/account/wishlist' },
  ];

  for (const { name, path } of gatedPages) {
    test(`should ask a guest to sign in when they open ${name} (${path})`, async ({ page, signInDialog }) => {
      await test.step(`Open ${path} as a guest`, async () => {
        await page.goto(path);
      });
      await test.step('The sign-in dialog opens', async () => {
        await signInDialog.expectOpen();
      });
    });
  }

  const gatedHeaderControls = [{ name: 'the wishlist button', pick: 'wishlist' }] as const;

  for (const { name, pick } of gatedHeaderControls) {
    test(`should ask a guest to sign in when they click ${name} in the header`, async ({
      homePage,
      signInDialog,
    }) => {
      await test.step('Open the home page as a guest', async () => {
        await homePage.open();
      });
      await test.step(`Click ${name}`, async () => {
        await homePage.header.clickUntil(homePage.header[pick], signInDialog.phoneStep, 'The sign-in dialog');
      });
      await test.step('The sign-in dialog opens', async () => {
        await signInDialog.expectOpen();
      });
    });
  }
});

test.describe('Guest cart', { tag: ['@auth', '@guest', '@cart'] }, () => {
  test(
    'a guest can add a product to the cart without signing in',
    { tag: '@smoke' },
    async ({ page, homePage, signInDialog }) => {
      await test.step('Open the home page as a guest', async () => {
        await homePage.open();
        await expect(homePage.header.signInButton).toBeVisible();
      });
      await test.step('Click Add to cart on the first product', async () => {
        await homePage.header.clickUntil(
          homePage.addToCartButtons.first(),
          homePage.header.cartButtonWithLines,
          'The product in the header cart',
        );
      });
      await test.step('No sign-in dialog, and the cart keeps the product in the browser', async () => {
        await expect(signInDialog.anyStep).toBeHidden();
        await expect(homePage.header.cartItemsLabel).not.toHaveText('0 items');
        const saved = await page.evaluate(
          () => JSON.parse(localStorage.getItem('guest_cart') ?? '[]').length,
        );
        expect(saved, 'Lines in the guest cart saved in localStorage').toBeGreaterThan(0);
      });
      await test.step('The cart is still there after a reload', async () => {
        await page.reload();
        await expect(homePage.header.cartButtonWithLines).toBeVisible();
      });
    },
  );

  test('the header cart button opens the cart drawer for a guest', async ({ homePage, signInDialog }) => {
    await homePage.open();
    await homePage.header.clickUntil(homePage.header.cartButton, homePage.cartDrawer.root, 'The cart drawer');
    await expect(signInDialog.anyStep).toBeHidden();
  });
});
