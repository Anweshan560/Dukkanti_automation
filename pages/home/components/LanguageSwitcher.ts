import { expect, type Locator, type Page } from '@playwright/test';

export type Language = 'en' | 'ar';

/** The language menu in the header and the language buttons in the footer. */
export class LanguageSwitcher {
  readonly headerButton: Locator;
  readonly menu: Locator;
  readonly footerToggle: Locator;
  readonly footerBrowserLanguage: Locator;

  constructor(private readonly page: Page) {
    // Names are translated, so match both languages.
    this.headerButton = page.getByRole('banner').getByRole('button', { name: /^(Language|اللغة):/ });
    this.menu = page.getByRole('menu').filter({ has: page.getByRole('menuitemradio') });
    const footer = page.getByRole('contentinfo');
    this.footerToggle = footer.getByRole('button', { name: /^(Language|اللغة):/ });
    this.footerBrowserLanguage = footer.getByRole('button', {
      name: /^(Use browser language|استخدام لغة المتصفح)$/,
    });
  }

  /** Picks a language in the header menu and waits for the page to switch. */
  async choose(language: Language): Promise<void> {
    const label = language === 'ar' ? 'العربية' : 'English';
    await expect(async () => {
      await this.headerButton.click();
      await this.menu.getByRole('menuitemradio', { name: label }).click({ timeout: 2_000 });
    }, `Could not pick ${label} in the language menu`).toPass({ timeout: 15_000 });
    await this.expectLanguage(language);
  }

  async expectLanguage(language: Language): Promise<void> {
    const html = this.page.locator('html');
    await expect(html, `<html lang> should be "${language}"`).toHaveAttribute('lang', language);
    await expect(html).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
  }
}
