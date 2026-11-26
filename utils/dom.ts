import { expect, type Locator, type Page } from '@playwright/test';

/** `11.50` -> 11.5. Ignores currency symbols, spaces and thousands separators. */
export const parseMoney = (text: string): number => Number(text.replace(/[^\d.]/g, ''));

/** Two numbers are the same amount of money when they differ by less than a fil (0.01). */
export const sameMoney = (a: number, b: number): boolean => Math.abs(a - b) < 0.0051;

export const PRICE_FORMAT = /^\d{1,3}(,?\d{3})*\.\d{2}$/;

/**
 * Text of an element as a person reads it.
 *
 * The storefront animates changing numbers (cart count, amounts) with a "rolling" counter: the current
 * value is in a hidden sizing copy, and the visible digits are two stacked copies (old and next). Plain
 * `innerText` then returns "38\n39". This replaces each counter with its current value.
 */
export async function readableText(locator: Locator): Promise<string> {
  return locator.evaluate((root) => {
    const clone = root.cloneNode(true) as HTMLElement;
    const original = [...root.querySelectorAll('span')];
    const copies = [...clone.querySelectorAll('span')];
    original.forEach((span, index) => {
      const hidden = getComputedStyle(span).visibility === 'hidden';
      const parent = copies[index]?.parentElement;
      // The hidden sizing copy holds the current value: let it stand for the whole counter.
      if (hidden && span.parentElement && /\d/.test(span.textContent ?? '') && parent) {
        parent.textContent = span.textContent;
      }
    });
    // Pieces in separate elements are spaced by CSS, not by text: join them with a space.
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
    const parts: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? '').trim();
      if (text) parts.push(text);
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  });
}

/** True when the element is clipped horizontally without an ellipsis (text cut off mid-character). */
export async function isClippedWithoutEllipsis(locator: Locator): Promise<boolean> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return (
      element.scrollWidth > element.clientWidth + 1 &&
      style.textOverflow !== 'ellipsis' &&
      style.overflowX !== 'visible'
    );
  });
}

/** True when the page scrolls sideways, i.e. something is wider than the screen. */
export async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

/** Scrolls through the page so lazy images and sections load, then back to the top. */
export async function scrollThroughPage(page: Page): Promise<void> {
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y <= height; y += 700) {
    await page.mouse.wheel(0, 700);
    // Wait on the browser's next frame, not on a fixed time.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

/** True once an <img> has finished loading with real pixels. */
export async function imageLoaded(image: Locator): Promise<boolean> {
  return image.evaluate((element) => {
    const img = element as HTMLImageElement;
    return img.complete && img.naturalWidth > 0;
  });
}

/**
 * Clicks a link and waits for the address to change. The storefront is server-rendered and a click made
 * while it is still hydrating can be swallowed, so the click is retried until the navigation happens.
 */
export async function clickToNavigate(page: Page, link: Locator, url: RegExp): Promise<void> {
  await expect(async () => {
    if (!url.test(page.url())) await link.click({ timeout: 5_000 });
    await expect(page).toHaveURL(url, { timeout: 5_000 });
  }, `Clicking the link did not open ${url}`).toPass({ timeout: 20_000 });
}
