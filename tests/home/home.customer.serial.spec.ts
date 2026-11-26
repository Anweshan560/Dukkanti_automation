/**
 * Home page tests that change the shared test customer's cart, wishlist or profile.
 *
 * There is one test customer and the cart lives on the server, so these tests run one after another in
 * this file (mode "default"), and the file is kept out of the cross-browser run. Every test starts from
 * an empty cart and wishlist, set up through the API.
 */
import {
  buildApi,
  json,
  type Cart,
  type Product,
  type Promotion,
  type StoreInfo,
  type User,
} from '../../api';
import { env } from '../../config/env';
import { expect, test } from '../../fixtures/test';
import type { HomePage } from '../../pages/home/HomePage';
import { homeData, thresholdDisplay } from '../../test-data/home';
import { clickToNavigate, isClippedWithoutEllipsis, sameMoney } from '../../utils/dom';
import { knownBug } from '../../utils/knownBug';
import { waitForApi } from '../../utils/network';
import { qaName } from '../../utils/testData';

test.use({ storageState: env.storageState.customer });
// One test at a time for the whole file: they all share one cart.
test.describe.configure({ mode: 'default' });

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** What the threshold bar should say and show for a cart subtotal. */
function expectedBar(subTotal: number, info: Pick<StoreInfo, 'minOrderAmount' | 'deliveryCutOff'>) {
  if (subTotal <= 0) {
    // Rule from the test brief: remaining = threshold - subtotal, so an empty cart shows the full minimum.
    return {
      text: `${thresholdDisplay(info.minOrderAmount)} more and you're good to go`,
      percent: 0,
      checkout: false,
    };
  }
  if (subTotal < info.minOrderAmount) {
    return {
      text: `${thresholdDisplay(info.minOrderAmount - subTotal)} more and you're good to go`,
      percent: Math.round((subTotal / info.minOrderAmount) * 100),
      checkout: false,
    };
  }
  if (subTotal < info.deliveryCutOff) {
    return {
      text: `You're ${thresholdDisplay(info.deliveryCutOff - subTotal)} away from free delivery`,
      percent: Math.round((subTotal / info.deliveryCutOff) * 100),
      checkout: false,
    };
  }
  return { text: "Nice! Your delivery's free", percent: 100, checkout: true };
}

async function expectBar(homePage: HomePage, subTotal: number, info: StoreInfo): Promise<void> {
  const want = expectedBar(subTotal, info);
  await homePage.thresholdBar.expectText(want.text);
  await expect(homePage.thresholdBar.progress).toHaveAttribute('aria-valuenow', String(want.percent));
  if (want.checkout) await expect(homePage.thresholdBar.checkoutLink).toBeVisible();
  else await expect(homePage.thresholdBar.checkoutLink).toHaveCount(0);
}

test.describe('Home as a signed-in customer: cart, wishlist and deals', { tag: '@home' }, () => {
  let info: StoreInfo;
  /** In stock, no deal, and its price divides both thresholds (e.g. 12.50), so every threshold can be hit exactly. */
  let product: Product;

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    try {
      const api = buildApi(request);
      info = await json<StoreInfo>(api.info.getInfo());
      product = await api.products.findPurchasable({
        priceDivides: [info.minOrderAmount, info.deliveryCutOff],
      });
    } finally {
      await request.dispose();
    }
  });

  test.beforeEach(async ({ customerApi }) => {
    await json(customerApi.cart.clear());
    await json(customerApi.wishlist.clear());
  });

  test.afterEach(async ({ customerApi }) => {
    await customerApi.cart.clear();
    await customerApi.wishlist.clear();
  });

  test.describe('cart badge, floating button and threshold bar', () => {
    test(
      'adding and removing from a card updates the header cart, floating button and threshold bar together',
      { tag: ['@smoke', '@pricing'] },
      async ({ homePage, customerApi }) => {
        await homePage.openForCustomer();
        const card = homePage.productTabs.card(0);
        const cardProduct = await json<Product>(customerApi.products.getBySlug(await card.slug()));
        test.skip(!cardProduct.inStock, `First featured product "${cardProduct.name}" is out of stock`);
        const page = homePage.header.banner.page();

        await test.step('Empty cart: no floating button, header says 0 items', async () => {
          await homePage.header.expectCart(0, 0);
          await expect(homePage.floatingCart.root).toHaveCount(0);
        });

        await test.step('"+" adds one: header, floating badge and bar all agree with the cart', async () => {
          const added = waitForApi(page, 'POST', '/cart/add');
          await card.addButton.click();
          expect((await added).status()).toBe(201);
          const cart = await customerApi.cart.current();
          expect(cart.items).toHaveLength(1);
          expect(cart.subTotal).toBeCloseTo(cardProduct.price, 2);
          await homePage.header.expectCart(1, cart.subTotal);
          await homePage.floatingCart.expectCount(1);
          await expectBar(homePage, cart.subTotal, info);
          await expect(card.quantity()).toHaveText('1');
        });

        await test.step('The stepper raises the quantity without a reload', async () => {
          const updated = waitForApi(page, 'PATCH', '/cart/update');
          await card.increaseButton.click();
          expect((await updated).status()).toBe(200);
          const cart = await customerApi.cart.current();
          expect(cart.items[0].quantity).toBe(2);
          await homePage.header.expectCart(1, cart.subTotal);
          await homePage.floatingCart.expectCount(1);
          await expectBar(homePage, cart.subTotal, info);
        });

        await test.step('Minus back to 0 removes it and everything returns to empty', async () => {
          await card.decreaseButton.click();
          await expect(card.quantity()).toHaveText('1');
          await card.decreaseButton.click();
          await expect(card.addButton).toBeVisible();
          await expect.poll(async () => (await customerApi.cart.current()).items.length).toBe(0);
          await homePage.header.expectCart(0, 0);
          await expect(homePage.floatingCart.root).toHaveCount(0);
        });
      },
    );

    /** Cart states, each worked out from the product price so the subtotal lands exactly on the boundary. */
    const states: { name: string; tags: string[]; quantity: (atMin: number, atFree: number) => number }[] = [
      { name: 'below the minimum order', tags: ['@smoke'], quantity: () => 1 },
      { name: 'exactly at the minimum order', tags: [], quantity: (atMin) => atMin },
      {
        name: 'between the minimum and free delivery',
        tags: [],
        quantity: (atMin, atFree) => Math.round((atMin + atFree) / 2),
      },
      { name: 'exactly at the free-delivery threshold', tags: [], quantity: (_, atFree) => atFree },
      { name: 'above the free-delivery threshold', tags: [], quantity: (_, atFree) => atFree + 1 },
    ];
    for (const state of states) {
      test(
        `threshold bar message, amount and fill are right with a cart ${state.name}`,
        {
          tag: ['@pricing', '@states', ...state.tags],
        },
        async ({ homePage, customerApi }) => {
          const quantity = state.quantity(
            info.minOrderAmount / product.price,
            info.deliveryCutOff / product.price,
          );
          const cart = await customerApi.cart.seed([{ productId: product.id, quantity }]);
          expect(cart.subTotal).toBeCloseTo(round2(product.price * quantity), 2);

          await homePage.openForCustomer();
          await homePage.header.expectCart(1, cart.subTotal);
          await expectBar(homePage, cart.subTotal, info);
        },
      );
    }

    test(
      'threshold bar with an empty cart shows the full minimum order amount',
      { tag: ['@pricing', '@states'] },
      async ({ homePage }) => {
        knownBug('threshold-empty-cart-message');
        await homePage.openForCustomer();
        await homePage.header.expectCart(0, 0);
        await expectBar(homePage, 0, info);
      },
    );

    test(
      'screen readers hear the remaining amount, not just "more and you\'re good to go"',
      { tag: ['@nonfunctional', '@pricing'] },
      async ({ homePage, customerApi }) => {
        knownBug('threshold-amount-not-announced');
        const cart = await customerApi.cart.seed([{ productId: product.id, quantity: 1 }]);
        await homePage.openForCustomer();
        const amount = thresholdDisplay(info.minOrderAmount - cart.subTotal);
        await expect(homePage.thresholdBar.progress).toHaveAccessibleName(new RegExp(`\\b${amount}\\b`));
        await expect(homePage.thresholdBar.message).toHaveAccessibleName(new RegExp(`\\b${amount}\\b`));
      },
    );

    test(
      'the threshold info opens "Here\'s how delivery works" with the store\'s amounts',
      { tag: '@regression' },
      async ({ homePage }) => {
        await homePage.openForCustomer();
        await homePage.thresholdBar.openInfo();
        const dialog = homePage.thresholdBar.infoDialog;
        await expect(dialog).toContainText(`Orders start from AED ${info.minOrderAmount}`);
        await expect(dialog).toContainText(`Spend AED ${info.deliveryCutOff}, delivery's on us`);
        await expect(dialog).toContainText(`delivery is only AED ${info.deliveryFee}`);
        await expect(dialog).toContainText('Delivering to Dubai, Sharjah & Ajman');
      },
    );

    test(
      'header cart says "1 item" / "2 items" with a two-decimal total, and opens the cart',
      {
        tag: '@smoke',
      },
      async ({ homePage, customerApi, api }) => {
        const second = (await api.products.firstPage('featured:desc', 40)).find(
          (p) => p.inStock && p.id !== product.id && !p.promotion,
        );
        test.skip(!second, 'Needs a second in-stock product');
        if (!second) return;

        let cart = await customerApi.cart.seed([{ productId: product.id, quantity: 1 }]);
        await homePage.openForCustomer();
        await homePage.header.expectCart(1, cart.subTotal);

        cart = await customerApi.cart.seed([
          { productId: product.id, quantity: 1 },
          { productId: second.id, quantity: 1 },
        ]);
        await homePage.openForCustomer();
        await homePage.header.expectCart(2, cart.subTotal);
        await expect(homePage.header.cartButton.locator('svg')).not.toHaveCount(0);

        await homePage.header.clickUntil(
          homePage.header.cartButton,
          homePage.cartDrawer.root,
          'The cart drawer',
        );
        await expect(homePage.cartDrawer.line(product.name)).toBeVisible();
        await expect(homePage.cartDrawer.line(second.name)).toBeVisible();
      },
    );

    test(
      'floating "View cart" matches the header count, opens the cart and stays pinned while scrolling',
      {
        tag: '@smoke',
      },
      async ({ page, homePage, customerApi }) => {
        await customerApi.cart.seed([{ productId: product.id, quantity: 2 }]);
        await homePage.openForCustomer();
        const floating = homePage.floatingCart;
        await floating.expectCount(await homePage.header.cartLineCount());

        // It must stay on screen in the bottom-right corner wherever the page is scrolled. Near the footer
        // it lifts a little (a deliberate CSS transition), so the check is "in the corner", not "same pixel".
        const isFixed = await floating.root.evaluate((element) => {
          for (let node: Element | null = element; node; node = node.parentElement) {
            if (getComputedStyle(node).position === 'fixed') return true;
          }
          return false;
        });
        expect(isFixed, 'The floating cart is not position: fixed').toBe(true);
        const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
        for (const [where, fraction] of [
          ['top', 0],
          ['middle', 0.5],
          ['bottom', 1],
        ] as const) {
          await page.evaluate((f) => window.scrollTo(0, document.body.scrollHeight * f), fraction);
          await expect
            .poll(
              async () => {
                const box = await floating.root.boundingBox();
                if (!box) return 'not on screen';
                const right = viewport.width - (box.x + box.width);
                const bottom = viewport.height - (box.y + box.height);
                return right >= 0 && right <= 40 && bottom >= 0 && bottom <= 120
                  ? 'in the corner'
                  : `right gap ${right}, bottom gap ${bottom}`;
              },
              { message: `Floating cart position with the page scrolled to the ${where}` },
            )
            .toBe('in the corner');
        }

        await homePage.header.clickUntil(
          floating.root,
          homePage.cartDrawer.root,
          'The cart drawer from the floating button',
        );
      },
    );
  });

  test.describe('on a phone', () => {
    test.use({ viewport: homeData.viewports.mobile, isMobile: true, hasTouch: true });

    test(
      'the floating cart button never covers a product "+" button',
      { tag: '@nonfunctional' },
      async ({ homePage, customerApi }) => {
        await customerApi.cart.seed([{ productId: product.id, quantity: 1 }]);
        await homePage.openForCustomer();
        await expect(homePage.floatingCart.root).toBeVisible();
        const covered: string[] = [];
        for (const row of [homePage.productTabs.root, homePage.trending.root]) {
          await row.scrollIntoViewIfNeeded();
          for (const button of await row
            .getByRole('button', { name: /^Add .+ to cart$/ })
            .filter({ visible: true })
            .all()) {
            // Bring the button to the middle of the screen, where a shopper would tap it, and see
            // what is actually on top at its centre.
            const hit = await button.evaluate(async (element) => {
              element.scrollIntoView({ block: 'center', inline: 'center' });
              await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
              const box = element.getBoundingClientRect();
              const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
              return {
                free: !top || element === top || element.contains(top),
                on: top?.closest('button')?.getAttribute('aria-label') ?? top?.tagName,
              };
            });
            if (!hit.free) covered.push(`${await button.getAttribute('aria-label')} (under "${hit.on}")`);
          }
        }
        expect(covered, `The floating cart covers: ${covered.join(', ')}`).toEqual([]);
      },
    );
  });

  test.describe('wishlist', () => {
    test(
      'the heart saves a product, survives a reload, shows on the wishlist page and unsaves',
      {
        tag: '@regression',
      },
      async ({ page, homePage, customerApi }) => {
        await homePage.openForCustomer();
        const card = homePage.productTabs.card(0);
        const name = await card.name();
        await card.expectWishlisted(false);

        const added = waitForApi(page, 'POST', '/wishlist/add');
        await card.wishlistButton.click();
        expect((await added).status()).toBe(201);
        await card.expectWishlisted(true);
        expect((await customerApi.wishlist.current()).items.map((item) => item.product.name)).toContain(name);

        await page.reload();
        await homePage.expectLoaded();
        await homePage.productTabs.card(0).expectWishlisted(true);

        await page.goto('/account/wishlist');
        await expect(page.getByRole('main').getByRole('link', { name, exact: true }).first()).toBeVisible();

        await homePage.openForCustomer();
        await homePage.productTabs.card(0).wishlistButton.click();
        await homePage.productTabs.card(0).expectWishlisted(false);
        await expect.poll(async () => (await customerApi.wishlist.current()).items.length).toBe(0);
      },
    );
  });

  test.describe('last order', () => {
    test(
      '"Reorder" puts the last order\'s products in the cart and updates the header and bar',
      {
        tag: ['@regression', '@states'],
      },
      async ({ page, homePage, customerApi }) => {
        const order = await customerApi.orders.latest();
        test.skip(!order, 'The test customer has no orders');
        if (!order) return;

        const loaded = waitForApi(page, 'GET', `/orders/${order.id}`, 30_000);
        await homePage.openForCustomer();
        await loaded;
        const copied = waitForApi(page, 'POST', '/cart/copy-order');
        await homePage.hero.lastOrder.reorderButton.click();
        expect((await copied).status()).toBe(201);

        const cart = await customerApi.cart.current();
        const wanted = order.items
          .filter((item) => item.product.inStock)
          .map((item) => [item.product.id, item.quantity]);
        expect(cart.items.map((item) => [item.product.id, item.quantity]).sort()).toEqual(wanted.sort());
        await expect(homePage.cartDrawer.root, 'The cart opens after a reorder').toBeVisible();
        // The drawer is modal and hides the header from assistive tech until it closes.
        await homePage.cartDrawer.closeButton.click();
        await expect(homePage.cartDrawer.root).toBeHidden();
        await homePage.header.expectCart(cart.items.length, cart.subTotal);
        await expectBar(homePage, cart.subTotal, info);
      },
    );
  });

  test.describe('request an item', () => {
    test(
      'a complete request is added to the cart as a special item',
      { tag: '@regression' },
      async ({ page, homePage, customerApi }) => {
        const itemName = qaName('Nabulsi cheese');
        await homePage.openForCustomer();
        await clickToNavigate(page, homePage.requestItem.link, /\/request$/);
        await page.getByRole('textbox', { name: 'Item name' }).fill(itemName);
        await page.getByRole('combobox', { name: 'Country of origin' }).click();
        await page.getByRole('option', { name: 'Palestine' }).click();
        await page.getByRole('radio', { name: '10–49' }).click();

        const added = waitForApi(page, 'POST', '/cart/add');
        await page.getByRole('button', { name: 'Add request to cart' }).click();
        expect((await added).status()).toBe(201);

        const cart = await customerApi.cart.current();
        const request = cart.specialItems.find((item) => item.name === itemName);
        expect(request, 'The request is not in the cart').toBeTruthy();
        expect(request).toMatchObject({
          quantity: 1,
          minPrice: 10,
          maxPrice: 49,
          description: 'Country of origin: Palestine',
        });
        // The lowest price in the budget counts toward the order total.
        expect(cart.subTotal).toBeCloseTo(10, 2);
        await homePage.header.expectCart(1, 10);
      },
    );
  });

  test.describe('profile name in the header', () => {
    test(
      'a very long first name is cut with an ellipsis instead of breaking the header',
      { tag: '@regression' },
      async ({ homePage, customerApi, cleanup }) => {
        const me = await json<User>(customerApi.users.me());
        cleanup.add('restore the profile name', () =>
          json(
            customerApi.users.updateProfile({ firstName: me.firstName ?? '', lastName: me.lastName ?? '' }),
          ),
        );
        const longName = 'Maximiliana-Alexandrina-Konstantinopolis';
        await json(customerApi.users.updateProfile({ firstName: longName }));

        await homePage.openForCustomer();
        const name = homePage.header.accountButton.getByText(longName, { exact: true });
        await expect(name).toBeVisible();
        const truncated = await name.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            ellipsis: style.textOverflow === 'ellipsis',
            overflowing: element.scrollWidth > element.clientWidth,
          };
        });
        expect(truncated, 'The long name should be cut with an ellipsis').toEqual({
          ellipsis: true,
          overflowing: true,
        });
        expect(await isClippedWithoutEllipsis(name)).toBe(false);
        const header = await homePage.header.banner.boundingBox();
        expect(header?.height ?? 0, 'The long name made the header taller').toBeLessThan(200);
      },
    );
  });
});

test.describe('Home deal pricing in the cart (API)', { tag: ['@home', '@pricing', '@api'] }, () => {
  test.beforeEach(async ({ customerApi }) => {
    await json(customerApi.cart.clear());
  });
  test.afterEach(async ({ customerApi }) => {
    await customerApi.cart.clear();
  });

  /** A running deal of this type with at least `count` in-stock products, or a skip. */
  async function dealWithProducts(
    api: import('../../api').Api,
    type: string,
    count = 1,
    check: (promotion: Promotion) => boolean = () => true,
  ): Promise<{ promotion: Promotion; products: Product[] }> {
    for (const promotion of (await api.promotions.active()).filter((p) => p.type === type && check(p))) {
      const page = await json<{ data: Product[] }>(
        api.products.list({ promotionId: promotion.id, limit: 50 }),
      );
      const products = page.data.filter((p) => p.inStock);
      if (products.length >= count) return { promotion, products };
    }
    test.skip(true, `No running "${type}" deal with ${count} in-stock product(s)`);
    throw new Error('unreachable');
  }

  const subtotalFor = async (
    customerApi: import('../../api').Api,
    lines: { productId: string; quantity: number }[],
  ) => (await customerApi.cart.seed(lines)).subTotal;

  test('"Buy X get Y free": no discount below X+Y, Y free at X+Y, twice that at double', async ({
    api,
    customerApi,
  }) => {
    const { promotion, products } = await dealWithProducts(api, 'buy_x_get_y');
    const buy = promotion.buyQuantity ?? 0;
    const get = promotion.getQuantity ?? 0;
    const price = products[0].price;
    const cap = promotion.maxApplicationsPerOrder ?? Infinity;
    const expected = (quantity: number) => {
      const free = Math.min(Math.floor(quantity / (buy + get)), cap) * get;
      return round2((quantity - free) * price);
    };
    for (const quantity of [buy, buy + get, 2 * (buy + get)]) {
      await test.step(`${quantity} × ${products[0].name} at ${price}`, async () => {
        const subTotal = await subtotalFor(customerApi, [{ productId: products[0].id, quantity }]);
        expect(
          sameMoney(subTotal, expected(quantity)),
          `${quantity} items: expected ${expected(quantity)}, cart says ${subTotal}`,
        ).toBe(true);
      });
    }
  });

  test('"Buy X get Y free" stops at the per-order limit', async ({ api, customerApi }) => {
    const { promotion, products } = await dealWithProducts(
      api,
      'buy_x_get_y',
      1,
      (p) => !!p.maxApplicationsPerOrder,
    );
    const group = (promotion.buyQuantity ?? 0) + (promotion.getQuantity ?? 0);
    const cap = promotion.maxApplicationsPerOrder ?? 0;
    const quantity = group * (cap + 1);
    const subTotal = await subtotalFor(customerApi, [{ productId: products[0].id, quantity }]);
    const expected = round2((quantity - cap * (promotion.getQuantity ?? 0)) * products[0].price);
    expect(sameMoney(subTotal, expected), `Expected ${expected}, cart says ${subTotal}`).toBe(true);
  });

  test('"N for AED X": N items cost X, one more is added at full price', async ({ api, customerApi }) => {
    const { promotion, products } = await dealWithProducts(api, 'bundle_price');
    const n = promotion.buyQuantity ?? 0;
    const item = products[0];
    expect(
      sameMoney(await subtotalFor(customerApi, [{ productId: item.id, quantity: n }]), promotion.value),
    ).toBe(true);
    const plusOne = await subtotalFor(customerApi, [{ productId: item.id, quantity: n + 1 }]);
    expect(
      sameMoney(plusOne, promotion.value + item.price),
      `Expected ${promotion.value + item.price}, cart says ${plusOne}`,
    ).toBe(true);
  });

  test('"Buy any X, get Y free": mixed products qualify and the cheapest one is free', async ({
    api,
    customerApi,
  }) => {
    const { promotion, products } = await dealWithProducts(api, 'mix_and_match', 2);
    const sorted = [...products].sort((a, b) => a.price - b.price);
    const cheap = sorted[0];
    const dear = sorted.reverse().find((p) => p.price > cheap.price);
    test.skip(!dear, 'All products in the deal cost the same, so "which one is free" cannot be told apart');
    if (!dear) return;
    const buy = promotion.buyQuantity ?? 0;
    const get = promotion.getQuantity ?? 0;
    const subTotal = await subtotalFor(customerApi, [
      { productId: dear.id, quantity: buy },
      { productId: cheap.id, quantity: get },
    ]);
    const expected = round2(buy * dear.price);
    expect(
      sameMoney(subTotal, expected),
      `Expected the ${get} cheapest free (${expected}), cart says ${subTotal}`,
    ).toBe(true);
  });

  test('"N% off": price is the original minus N%, and the cart does not take it off twice', async ({
    api,
    customerApi,
  }) => {
    const { promotion, products } = await dealWithProducts(api, 'percentage_off');
    const item = products.find((p) => p.compareAtPrice) ?? products[0];
    const original = item.compareAtPrice ?? 0;
    expect(item.price).toBeCloseTo(round2(original * (1 - promotion.value / 100)), 2);
    const cart: Cart = await customerApi.cart.seed([{ productId: item.id, quantity: 2 }]);
    expect(
      sameMoney(cart.subTotal, round2(item.price * 2)),
      `Subtotal ${cart.subTotal} for 2 × ${item.price}`,
    ).toBe(true);
    expect(sameMoney(cart.promotionDiscount, round2((original - item.price) * 2)), 'Reported discount').toBe(
      true,
    );
    expect(cart.discount, 'A second discount was applied on top of the deal').toBe(0);
  });

  test(
    'the header shows the deal-adjusted subtotal from the cart',
    { tag: '@smoke' },
    async ({ api, customerApi, homePage }) => {
      const { promotion, products } = await dealWithProducts(api, 'buy_x_get_y');
      const quantity = (promotion.buyQuantity ?? 0) + (promotion.getQuantity ?? 0);
      const cart = await customerApi.cart.seed([{ productId: products[0].id, quantity }]);
      expect(cart.promotionDiscount).toBeGreaterThan(0);
      await homePage.openForCustomer();
      await homePage.header.expectCart(1, cart.subTotal);
    },
  );
});

// Cart and wishlist API tests moved to tests/cart/cart.serial.api.spec.ts and tests/account/.
