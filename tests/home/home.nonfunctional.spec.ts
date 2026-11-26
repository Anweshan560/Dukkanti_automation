import AxeBuilder from '@axe-core/playwright';
import { env } from '../../config/env';
import { expect, test } from '../../fixtures/test';
import { homeData } from '../../test-data/home';
import { hasHorizontalOverflow, scrollThroughPage } from '../../utils/dom';
import { knownBug } from '../../utils/knownBug';
import { recordApiCalls } from '../../utils/network';

test.describe('Home responsive layout', { tag: ['@home', '@nonfunctional'] }, () => {
  for (const [name, viewport] of Object.entries(homeData.viewports)) {
    test.describe(`${name} ${viewport.width}px`, () => {
      test.use({ viewport });

      test('nothing is wider than the screen', async ({ page, homePage }) => {
        await homePage.open();
        await scrollThroughPage(page);
        expect(await hasHorizontalOverflow(page), `The page scrolls sideways at ${viewport.width}px`).toBe(
          false,
        );
      });

      test('the country stamps either wrap onto rows that fit, or scroll sideways inside their band', async ({
        page,
        homePage,
      }) => {
        await homePage.open();
        const stamps = homePage.countries.stamps;
        await expect(stamps).toHaveCount(homeData.countries.length);
        await homePage.countries.root.scrollIntoViewIfNeeded();
        const layout = await homePage.countries.root.evaluate((section, width) => {
          const links = [...section.querySelectorAll('a[href^="/products/countries/"]')];
          const boxes = links.map((link) => link.getBoundingClientRect());
          const rows = new Set(boxes.map((box) => Math.round(box.y))).size;
          const fits = boxes.every((box) => box.x >= -1 && box.right <= width + 1);
          const scroller = links[0]?.parentElement;
          const scrolls =
            !!scroller &&
            scroller.scrollWidth > scroller.clientWidth + 1 &&
            /(auto|scroll)/.test(getComputedStyle(scroller).overflowX);
          return { rows, fits, scrolls };
        }, viewport.width);
        test.info().annotations.push({
          type: 'layout',
          description: `${viewport.width}px: ${JSON.stringify(layout)}`,
        });
        expect(
          (layout.rows > 1 && layout.fits) || layout.scrolls,
          `Stamps neither wrap within the screen nor scroll in their band: ${JSON.stringify(layout)}`,
        ).toBe(true);
        expect(await hasHorizontalOverflow(page), 'The stamps make the whole page scroll sideways').toBe(
          false,
        );
      });
    });
  }

  test.describe('phone', () => {
    test.use({ viewport: homeData.viewports.mobile, isMobile: true, hasTouch: true });

    test('the nav collapses into a Menu button that opens the categories and links', async ({ homePage }) => {
      await homePage.open();
      await expect(homePage.nav.root).toBeHidden();
      await homePage.header.clickUntil(
        homePage.header.menuButton,
        homePage.header.mobileMenu,
        'The mobile menu',
      );
      const menu = homePage.header.mobileMenu;
      for (const link of ['Deals', 'Baskets', 'Shop by country', 'Local businesses']) {
        await expect(menu.getByRole('link', { name: link, exact: true })).toBeVisible();
      }
      await expect(menu.getByRole('button', { name: 'All categories' })).toBeVisible();
    });

    test('product rows scroll sideways inside their band instead of stretching the page', async ({
      page,
      homePage,
    }) => {
      await homePage.open();
      const panel = homePage.productTabs.panel;
      await panel.scrollIntoViewIfNeeded();
      const row = await panel.evaluate((element) => {
        const scroller = [element, ...element.querySelectorAll('*')].find(
          (node) =>
            node.scrollWidth > node.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(node).overflowX),
        );
        return scroller
          ? 'scrolls'
          : element.getBoundingClientRect().width <= window.innerWidth + 1
            ? 'reflows'
            : 'overflows';
      });
      expect(row).not.toBe('overflows');
      expect(await hasHorizontalOverflow(page)).toBe(false);
    });

    test('the logo link has a name a screen reader can announce', async ({ homePage }) => {
      knownBug('mobile-logo-link-unnamed');
      await homePage.open();
      await expect(homePage.header.logo).toHaveAccessibleName('Dukkanti');
    });
  });
});

test.describe('Home accessibility', { tag: ['@home', '@nonfunctional'] }, () => {
  test('axe finds no serious or critical issues', async ({ page, homePage }) => {
    knownBug('home-axe-serious');
    await homePage.open();
    await scrollThroughPage(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    await test.info().attach('axe-violations.json', {
      body: JSON.stringify(
        serious.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 10),
        })),
        null,
        2,
      ),
      contentType: 'application/json',
    });
    expect(
      serious.map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length} element(s))`),
      'Serious/critical accessibility issues',
    ).toEqual([]);
  });

  test('icon-only controls have names: hearts, "+", cart, social links, threshold info', async ({
    homePage,
  }) => {
    await homePage.open();
    const main = homePage.header.banner.page().getByRole('main');
    await expect(homePage.header.cartButton).toHaveAccessibleName(/^Cart/);
    await expect(homePage.thresholdBar.message).toHaveAccessibleName(/\S/);
    for (const heart of await main.getByRole('button', { name: /^Save or unsave .+/ }).all()) {
      await expect(heart).toHaveAccessibleName(/^Save or unsave .+/);
    }
    for (const add of await main.getByRole('button', { name: /^Add .+ to cart$/ }).all()) {
      await expect(add).toHaveAccessibleName(/^Add .+ to cart$/);
    }
    for (const { name } of homeData.footer.social) {
      await expect(homePage.footer.socialLink(name)).toHaveAccessibleName(name);
    }
    // Any visible button or link with no text must still be named (aria-label, labelledby, title or alt).
    const unnamed = await homePage.header.banner
      .page()
      .locator('button, a[href]')
      .evaluateAll((controls) =>
        controls
          .filter(
            (control) =>
              (control as HTMLElement).offsetParent !== null && !(control.textContent ?? '').trim(),
          )
          .filter(
            (control) =>
              !control.getAttribute('aria-label') &&
              !control.getAttribute('aria-labelledby') &&
              !control.getAttribute('title') &&
              ![...control.querySelectorAll('img')].some((img) => img.getAttribute('alt')),
          )
          .map((control) => control.outerHTML.slice(0, 120)),
      );
    expect(unnamed, `Icon-only controls without a name:\n${unnamed.join('\n')}`).toEqual([]);
  });

  test('every image has alt text, or is decorative inside a named link or button', async ({
    page,
    homePage,
  }) => {
    await homePage.open();
    await scrollThroughPage(page);
    const unnamed = await page.locator('main img, footer img, header img').evaluateAll((images) =>
      images
        .filter((image) => {
          const alt = image.getAttribute('alt');
          if (alt === null) return true; // no alt attribute at all
          if (alt.trim()) return false; // has alt text
          // Empty alt = decorative. Fine when the surrounding link/button is named by its text.
          const owner = image.closest('a,button');
          return owner ? !(owner.textContent ?? '').trim() && !owner.getAttribute('aria-label') : false;
        })
        .map((image) => (image as HTMLImageElement).src.slice(-60)),
    );
    expect(unnamed, `Images with no text alternative: ${unnamed.join(', ')}`).toEqual([]);
  });

  test('Tab moves through the page in order with a visible focus ring, starting with "Skip to content"', async ({
    page,
    homePage,
  }) => {
    await homePage.open();
    const stops: { name: string; visible: boolean; y: number }[] = [];
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press('Tab');
      // Focus styles fade in with CSS transitions. Let the browser start them (two frames), then wait for
      // them to finish (capped at 1 s) before measuring.
      await page.evaluate(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await Promise.race([
          Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => null))),
          new Promise((resolve) => setTimeout(resolve, 1_000)),
        ]);
      });
      stops.push(
        await page.evaluate(() => {
          const element = document.activeElement as HTMLElement | null;
          if (!element || element === document.body) return { name: '(body)', visible: false, y: 0 };
          const hasRing = (node: Element): boolean => {
            const style = getComputedStyle(node);
            return (
              (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) ||
              (style.boxShadow !== 'none' && style.boxShadow !== '')
            );
          };
          // Text fields commonly draw the ring on their wrapper (:focus-within), e.g. the search pill
          // whose border turns from transparent to brand green.
          const wrapperRing = (): boolean => {
            if (element.tagName !== 'INPUT' && element.tagName !== 'TEXTAREA') return false;
            for (
              let node = element.parentElement, depth = 0;
              node && depth < 3;
              node = node.parentElement, depth += 1
            ) {
              const style = getComputedStyle(node);
              const border =
                parseFloat(style.borderTopWidth) > 0 &&
                !/rgba\(.*,\s*0\)|transparent/.test(style.borderTopColor);
              if (node.matches(':focus-within') && (border || hasRing(node))) return true;
            }
            return false;
          };
          const ring = hasRing(element) || wrapperRing();
          const parent = element.parentElement ? getComputedStyle(element.parentElement) : null;
          const detail = ring
            ? ''
            : ` [outline ${getComputedStyle(element).outlineStyle}; wrapper border ${parent?.borderTopWidth} ${parent?.borderTopColor}; focus-within ${element.parentElement?.matches(':focus-within')}]`;
          return {
            name:
              (element.getAttribute('aria-label') ?? element.textContent ?? element.tagName)
                .trim()
                .slice(0, 40) + detail,
            visible: ring,
            y: element.getBoundingClientRect().top + window.scrollY,
          };
        }),
      );
    }
    expect(stops[0].name).toBe('Skip to content');
    const noRing = stops.filter((stop) => !stop.visible).map((stop) => stop.name);
    expect(noRing, `No visible focus indicator on: ${noRing.join(' | ')}`).toEqual([]);
    // Focus never jumps back up the page while moving forward through the header and the first bands.
    const main = stops.slice(1).map((stop) => stop.y);
    for (let i = 1; i < main.length; i += 1) {
      expect(
        main[i] + 300,
        `Focus jumped from y=${main[i - 1]} back to y=${main[i]} at ${stops[i + 1].name}`,
      ).toBeGreaterThanOrEqual(main[i - 1]);
    }
  });
});

test.describe('Home links, images and errors', { tag: ['@home', '@nonfunctional'] }, () => {
  test('every link and image on the page answers 2xx/3xx', async ({ page, homePage }) => {
    test.slow();
    await homePage.open();
    await scrollThroughPage(page);
    const { hrefs, srcs } = await page.evaluate(() => ({
      hrefs: [...document.querySelectorAll('a[href]')].map((a) => (a as HTMLAnchorElement).href),
      srcs: [...document.querySelectorAll('img[src]')].map(
        (img) => (img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src,
      ),
    }));
    // Social networks block automated requests (429/403), so they are checked for the right address
    // in the footer tests instead of fetched.
    const own = (url: string) =>
      /^https:\/\/(dev\.dukkanti\.com|links\.dukkanti\.ae|imagedelivery\.net)\//.test(url);
    const urls = [...new Set([...hrefs, ...srcs])].filter(own).map((url) => url.split('#')[0]);
    const broken: string[] = [];
    const queue = [...urls];
    const worker = async () => {
      for (let url = queue.shift(); url; url = queue.shift()) {
        const response = await page.request
          .get(url, { maxRedirects: 0, timeout: 30_000 })
          .catch((error: Error) => error);
        if (response instanceof Error) broken.push(`${url} -> ${response.message.split('\n')[0]}`);
        else if (response.status() >= 400) broken.push(`${url} -> ${response.status()}`);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    test.info().annotations.push({ type: 'checked', description: `${urls.length} unique links and images` });
    expect(broken, broken.join('\n')).toEqual([]);
  });

  for (const role of ['guest', 'customer'] as const) {
    test.describe(`as a ${role}`, () => {
      test.use({ storageState: env.storageState[role] });

      test('loading the page logs no JavaScript errors and no failed API calls', async ({
        page,
        homePage,
      }) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(`page error: ${error.message}`));
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(`console: ${message.text()}`);
        });
        const api = recordApiCalls(page);
        await homePage.open();
        await scrollThroughPage(page);
        await page.waitForLoadState('networkidle');
        api.stop();
        const failed = api.calls
          .filter((call) => call.status >= 400)
          .map((c) => `${c.status} ${c.method} ${c.path}`);
        expect(errors, errors.join('\n')).toEqual([]);
        expect(failed, failed.join('\n')).toEqual([]);
      });
    });
  }
});

test.describe('Home performance', { tag: ['@home', '@nonfunctional'] }, () => {
  test('largest contentful paint is under 2.5 s and layout shift under 0.1', async ({ page, homePage }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __lcp: number; __cls: number };
      w.__lcp = 0;
      w.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) w.__lcp = entry.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        })[]) {
          if (!entry.hadRecentInput) w.__cls += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await homePage.open();
    await page.waitForLoadState('load');
    // LCP is final once the user interacts; a click on empty space ends it without navigating.
    await page.mouse.click(1, 1);
    const { lcp, cls } = await page.evaluate(() => {
      const w = window as unknown as { __lcp: number; __cls: number };
      return { lcp: w.__lcp, cls: w.__cls };
    });
    test.info().annotations.push({
      type: 'performance',
      description: `LCP ${Math.round(lcp)} ms, CLS ${cls.toFixed(3)}`,
    });
    expect(lcp, `LCP ${Math.round(lcp)} ms`).toBeLessThan(homeData.performance.lcpMs);
    expect(cls, `CLS ${cls.toFixed(3)}`).toBeLessThan(homeData.performance.cls);
  });

  test('images below the fold load lazily', async ({ page, homePage }) => {
    await homePage.open();
    const eager = await page.evaluate(() => {
      const images = [...document.querySelectorAll('img')];
      const fold = window.innerHeight * 1.5;
      // A copy of a picture already shown at the top (the footer logo repeats the header logo) is
      // served from cache, so lazy-loading it would change nothing.
      const shownAtTop = new Set(
        images.filter((img) => img.getBoundingClientRect().top <= fold).map((img) => img.src),
      );
      return images
        .filter(
          (img) =>
            img.getBoundingClientRect().top > fold && img.loading !== 'lazy' && !shownAtTop.has(img.src),
        )
        .map((img) => img.src.slice(-60));
    });
    expect(eager, `Below-the-fold images without loading="lazy": ${eager.join(', ')}`).toEqual([]);
  });
});

test.describe('Home SEO', { tag: ['@home', '@nonfunctional'] }, () => {
  test('title, description, canonical and exactly one H1', async ({ page, homePage }) => {
    await homePage.open();
    await expect(page).toHaveTitle(/\S/);
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description?.length ?? 0, 'Meta description is missing or too short').toBeGreaterThan(50);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical, 'Canonical must be an absolute https URL').toMatch(/^https:\/\/[^/]+\/$/);
    await expect(page.locator('h1')).toHaveCount(1);
  });

  test('hreflang links point to the English and Arabic pages', async ({ page, homePage }) => {
    knownBug('seo-missing-hreflang');
    await homePage.open();
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveCount(1);
    await expect(page.locator('link[rel="alternate"][hreflang="ar"]')).toHaveCount(1);
  });
});
