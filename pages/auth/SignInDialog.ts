import { expect, type Locator, type Page } from '@playwright/test';
import type { Credentials } from '../../config/env';
import { FAIL_FAST_TIMEOUT } from '../BasePage';

/**
 * The sign-in dialog. It has two steps:
 *  1. "Sign in or create an account": country code and mobile number, then Continue.
 *  2. "Enter the code": four single-digit boxes, then Verify and continue.
 */
export class SignInDialog {
  /** Step 1. */
  readonly phoneStep: Locator;
  readonly countryCode: Locator;
  readonly mobileNumber: Locator;
  readonly continueButton: Locator;

  /** Step 2. */
  readonly codeStep: Locator;
  readonly codeBoxes: Locator;
  readonly verifyButton: Locator;
  readonly changeNumberButton: Locator;

  /** Either step. */
  readonly anyStep: Locator;
  /** The error shown under the field, e.g. "Enter a valid mobile number" or "Invalid OTP". */
  readonly error: Locator;
  readonly closeButton: Locator;

  constructor(private readonly page: Page) {
    this.phoneStep = page.getByRole('dialog', { name: 'Sign in or create an account' });
    this.countryCode = this.phoneStep.getByRole('combobox', { name: 'Country code' });
    this.mobileNumber = this.phoneStep.getByRole('textbox', { name: 'Mobile number' });
    this.continueButton = this.phoneStep.getByRole('button', { name: 'Continue' });

    this.codeStep = page.getByRole('dialog', { name: 'Enter the code' });
    this.codeBoxes = this.codeStep.getByRole('group').getByRole('textbox');
    this.verifyButton = this.codeStep.getByRole('button', { name: 'Verify and continue' });
    this.changeNumberButton = this.codeStep.getByRole('button', { name: 'Change' });

    this.anyStep = this.phoneStep.or(this.codeStep);
    this.error = this.anyStep.getByRole('alert');
    this.closeButton = this.anyStep.getByRole('button', { name: 'Close' });
  }

  async expectOpen(): Promise<void> {
    await expect(this.phoneStep, 'The sign-in dialog did not open').toBeVisible({
      timeout: FAIL_FAST_TIMEOUT,
    });
  }

  async expectClosed(): Promise<void> {
    await expect(this.anyStep, 'The sign-in dialog is still open').toBeHidden();
  }

  /** Picks the country code (when it is not already selected) and types the number. */
  async enterPhone(dialCode: string, localNumber: string): Promise<void> {
    await this.expectOpen();
    if (!((await this.countryCode.textContent()) ?? '').includes(dialCode)) {
      await this.countryCode.click();
      await this.page.getByRole('option', { name: dialCode }).click();
    }
    await this.mobileNumber.fill(localNumber);
  }

  /** Step 1 in full: enters the phone number and moves on to the code step. */
  async requestCode(credentials: Credentials): Promise<void> {
    await this.enterPhone(credentials.dialCode, credentials.localNumber);
    await expect(
      this.continueButton,
      'Continue stayed disabled: the phone number was not accepted',
    ).toBeEnabled({ timeout: FAIL_FAST_TIMEOUT });
    await this.continueButton.click();
    await expect(this.codeStep, 'The "Enter the code" step did not appear after Continue').toBeVisible({
      timeout: FAIL_FAST_TIMEOUT,
    });
  }

  /** Types a code into the boxes. The dialog submits by itself after the last digit. */
  async enterCode(code: string): Promise<void> {
    await this.codeBoxes.first().click();
    await this.page.keyboard.type(code);
  }

  /** Both steps: signs in and waits for the dialog to close. */
  async signIn(credentials: Credentials): Promise<void> {
    await this.requestCode(credentials);
    await this.enterCode(credentials.otp);
    await expect(this.codeStep, 'The sign-in dialog did not close after entering the code').toBeHidden({
      timeout: 15_000,
    });
  }
}
