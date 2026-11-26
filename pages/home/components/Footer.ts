import type { Locator, Page } from '@playwright/test';

export type FooterColumn = 'Shop' | 'Baskets' | 'Deals' | 'Countries' | 'Help' | 'Company';

export class Footer {
  readonly root: Locator;
  readonly brandName: Locator;
  readonly tagline: Locator;
  readonly appStoreLink: Locator;
  readonly googlePlayLink: Locator;
  readonly stayInTouchHeading: Locator;
  readonly copyright: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('contentinfo');
    this.brandName = this.root.getByText('Dukkanti', { exact: true }).first();
    this.tagline = this.root.getByRole('paragraph').first();
    this.appStoreLink = this.root.getByRole('link', { name: /App Store/ });
    this.googlePlayLink = this.root.getByRole('link', { name: /Google Play/ });
    this.stayInTouchHeading = this.root.getByRole('heading', { name: 'Stay in touch' });
    this.copyright = this.root.getByText(/^©/);
  }

  column(name: FooterColumn): Locator {
    return this.root.getByRole('navigation', { name, exact: true });
  }

  links(column: FooterColumn): Locator {
    return this.column(column).getByRole('link');
  }

  async linkList(column: FooterColumn): Promise<{ name: string; href: string }[]> {
    return this.links(column).evaluateAll((elements) =>
      elements.map((element) => ({
        name: (element.textContent ?? '').trim(),
        href: element.getAttribute('href') ?? '',
      })),
    );
  }

  socialLink(name: string): Locator {
    return this.root.getByRole('link', { name, exact: true });
  }

  /** The legal links in the bottom bar. */
  legalLink(name: string): Locator {
    return this.root.getByRole('link', { name, exact: true });
  }
}
