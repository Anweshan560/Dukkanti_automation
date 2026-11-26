import { expect, test, type Locator, type Page } from '@playwright/test';
import { hasFocusWithin, seriousAxeViolations } from '../../utils/quality';

/**
 * What every dialog, drawer and menu must do for keyboard and screen-reader users:
 * open from its button, take the focus, pass axe, close with Escape and give the focus back.
 *
 * `focusReturnsTo` is the control that should hold the focus after closing; by default the trigger.
 */
export async function checkDialog(
  page: Page,
  name: string,
  open: () => Promise<void>,
  dialog: Locator,
  focusReturnsTo: Locator,
): Promise<void> {
  await test.step(`open the ${name}`, async () => {
    await expect(async () => {
      if (!(await dialog.isVisible())) await open();
      await expect(dialog).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
  });

  await test.step('the focus moves into it', async () => {
    await expect
      .poll(() => hasFocusWithin(dialog), { message: `The focus stayed outside the ${name}` })
      .toBe(true);
  });

  await test.step('axe finds no serious or critical issues inside it', async () => {
    // Wait for the opening animation: half-faded text reads as low contrast.
    // Content loaded after opening (e.g. "No coupons yet") fades in later, so give it a moment to start
    // and then wait until nothing is moving.
    await page.waitForTimeout(500);
    await expect
      .poll(
        () =>
          dialog.evaluate(
            (el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
          ),
        {
          intervals: [500, 300, 300],
          timeout: 10_000,
        },
      )
      .toBe(0);
    // axe takes a CSS selector, so mark the open dialog for it.
    await dialog.evaluate((el) => el.setAttribute('data-qa-axe', ''));
    const violations = await seriousAxeViolations(page, {
      include: '[data-qa-axe]',
      skipKnownSiteIssues: true,
      name: `axe-${name.replace(/\W+/g, '-')}`,
    });
    await dialog.evaluate((el) => el.removeAttribute('data-qa-axe')).catch(() => {});
    expect.soft(violations, `Serious/critical accessibility issues in the ${name}`).toEqual([]);
  });

  await test.step('Escape closes it and the focus goes back', async () => {
    await page.keyboard.press('Escape');
    await expect(dialog, `Escape did not close the ${name}`).toBeHidden();
    await expect(focusReturnsTo, `After closing the ${name} the focus did not go back`).toBeFocused();
  });
}
