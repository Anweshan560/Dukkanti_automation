# Dukkanti — What to Automate, What to Test by Hand

Written 2026-11-17, from the full crawl in [LOCATORS.md](LOCATORS.md) and the pages, flows and API in
[APP_MAP.md](APP_MAP.md).

## The rule used

**Automate** a check when it is repeatable, has one clear right answer, and would hurt if it broke without
anyone noticing: money, sign-in, the order flow, data the API controls, and the rules that keep regressing.

**Test by hand** when the answer needs human judgement (does it look right, does it read well), when the
behaviour lives outside our control (Google Maps, Stripe 3-D Secure, SMS, the phone's share sheet,
notifications, app stores), when it needs admin access we don't have, or when it changes too often to be
worth the upkeep.

**Hybrid**: automate the part that is stable and leave the rest to a short manual checklist.

Where it runs: **API** = `*.api.spec.ts` (fast, no browser), **UI** = Playwright in the browser,
**Visual** = screenshot comparison (opt-in, per OS).

---

## 1. What is already automated

| Area                        | UI  | API | Notes                                                                                                       |
| --------------------------- | --- | --- | ----------------------------------------------------------------------------------------------------------- |
| Framework, `/info`          | ✓   | ✓   | Store settings checked before every run (`store.setup.ts`)                                                  |
| Sign in / out, guest gating | ✓   | ✓   | OTP happy and wrong paths, token rules, 401/403, gated pages                                                |
| Catalog and search          | ✓   | ✓   | Typeahead, filters, sort, paging, infinite scroll, lookups                                                  |
| Home page                   | ✓   | ✓   | All sections, header, i18n, a11y (axe), performance, SEO, links, data quality, deal pricing in cart, visual |
| Product page                | ✓   | ✓   | Price, deal pack, stepper, related, breadcrumb, share, Arabic slug, 404                                     |
| Cart and coupons            | ✓   | ✓   | Lines, totals at every threshold, drawer, deal lines, quick adds, coupons, invalid input, permissions       |
| Checkout                    | ✓   | ✓   | COD and Stripe (good, declined, empty card), minimum order, address picker, double submit, server failure   |
| Same-day cut-off            | ✓   | ✓   | `deliveryDay.serial.spec.ts`: API promise vs Dubai time; "Today"/"Tomorrow" and countdown with a frozen clock |
| Orders                      | ✓   | ✓   | Pending / Past tabs, end of list, detail amounts, WhatsApp, Order again (replace / add), privacy, paging     |
| Account                     | ✓   | ✓   | Profile, addresses (incl. "Discard unsaved changes?"), wishlist, My coupons                                 |
| Deals, baskets, forms, static | ✓ | ✓   | Deal and basket pages, basket Buy / Customize as a customer, contact / business / sell / request forms, policy pages, 404 |
| Pay page (WhatsApp link)    | ✓   | ✓   | `tests/payment`: pay / paid / can't pay / not found states, Stripe Checkout with good and declined cards, one Stripe page per order, no personal data, old pay links redirect |
| Security                    |     | ✓   | Forged tokens, prices and totals sent by the shopper ignored, quantity cap, protected profile fields, address and order privacy (needs `CUSTOMER2_*`), site and API headers (`tests/security`) |
| API contract                |     | ✓   | `tests/contract`: responses checked against the OpenAPI spec (`/v1/api-json`), endpoint coverage, auth marks |
| Every page (sprint 9)       | ✓   |     | `tests/sweep`: axe, JS errors and failed loads, broken links, 390 px, Arabic, LCP/CLS; dialogs: focus, axe, Escape |
| Screenshots                 | ✓   |     | Home sections, 8 guest page types, cart / checkout / account (opt-in `npm run test:visual`, personal data masked) |

Written 2026-11-17, updated 2026-11-18. Everything in the sprint plan is now automated. Real bugs found are listed
in `known-bugs.json` (`npm run known-bugs`). Next: run the suite on every PR and nightly (CI), see section 6.

## 2. Automate next (in priority order)

### P1: money and the order flow (smoke + regression)

| Feature               | Test                                                                                                                      | Layer                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Cart totals           | Subtotal, VAT 5 %, delivery fee 20 below AED 200 / free above, COD fee 10, min order AED 50 block, `remainingToMinimum`   | API + 1 UI              |
| Cart actions          | Add, change qty, remove, clear, from card / product page / pack button / drawer; header count & amount follow             | UI + API                |
| Deals in cart         | Every promotion type (buy X get Y, N for X, mix and match, % off, amount off), per-order limit, no double discount        | API (UI for 1 per type) |
| Coupons               | Apply valid, reject invalid / expired / already used, remove, total updates                                               | API + 1 UI              |
| Checkout, COD         | Address pick, delivery preference, out-of-stock preference, place order → order page & "Your orders"                      | UI smoke                |
| Checkout, card        | Stripe test card `4242…` success; declined card `4000 0000 0000 0002` shows the error and no order                        | UI smoke                |
| Order detail          | Lines, quantities, subtotal / fee / VAT / total match the cart that was checked out; WhatsApp link holds the order number | UI + API                |
| Reorder / Order again | Copies the order lines into the cart (`POST /cart/copy-order`); out-of-stock lines are handled                            | UI + API                |
| Order privacy         | Customer A gets 404 for customer B's order (needs `CUSTOMER2_*`)                                                          | API                     |
| Product page          | Price, deal link, qty stepper (min 1, disabled minus), Add to cart line price, pack button, related products, breadcrumb  | UI                      |

### P2: account and content

| Feature         | Test                                                                                                                                                                             | Layer                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Profile         | Edit first / last name and email, validation (required, email format), mobile read-only; restore the name afterwards                                                             | UI + API                                 |
| Addresses       | Add (fields only; see "Hybrid" for the map), edit, set default, remove; required-field errors; city limited to Dubai / Sharjah / Ajman; header location link follows the default | UI + API                                 |
| Wishlist        | Save from card and product page, count in account menu and summary, unsave, empty state                                                                                          | UI + API (home already partly covers it) |
| Orders list     | Pending / Past orders switch, order count matches the API, "You’ve reached the end"                                                                                              | UI                                       |
| My coupons      | Empty state and, if a coupon exists, it lists and applies                                                                                                                        | UI                                       |
| Baskets         | List and detail render from `/baskets`; `Buy` adds all basket products; `Customize` opens the basket                                                                             | UI + API                                 |
| Deals pages     | List = running promotions from the API, detail lists only products in the deal, expired deals hidden                                                                             | UI + API                                 |
| Forms           | Contact, business, sell, request: required-field messages, email / phone validation, success message; API 400 on empty bodies. Mark submissions with a `qa######` name           | UI + API                                 |
| Request an item | Adds a special line to the cart at the lowest price of the chosen budget                                                                                                         | UI (home covers the happy path)          |
| Index pages     | `/categories`, `/countries`, `/brands`, `/local-businesses` match the API and their search box filters                                                                           | UI (catalog covers most)                 |
| 404             | Unknown path → HTTP 404 + "Page not found" + three links; unknown product / deal / basket slug too                                                                               | UI                                       |
| Static pages    | Every policy page answers 200 with its H1 and side menu; footer links point to them                                                                                              | UI (cheap, one loop)                     |

### P3: cross-cutting (runs on the pages above, little extra code)

| Feature               | Test                                                                                                                                         | Layer  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Arabic / RTL          | Each main page under `/ar/` has `dir="rtl"`, `lang="ar"`, translated H1 / title / nav (from API `nameAr`), and no English left in the header | UI     |
| Language switch       | Header and footer switches, "Use browser language", choice kept after a reload                                                               | UI     |
| Accessibility         | axe (serious / critical) on every page type and every dialog; keyboard: Tab order, Escape closes dialogs, focus returns                      | UI     |
| Responsive            | Phone menu (`#mobile-navigation`) opens, links work, no sideways scroll on each page type at 390 px                                          | UI     |
| Cross-browser         | Smoke set on Firefox, WebKit, Pixel 7, iPhone 14 (already configured, weekly)                                                                | UI     |
| Visual                | Screenshot per section for the key pages (product, listing, cart, checkout, account) at 1440 px                                              | Visual |
| Performance           | LCP < 2.5 s, CLS < 0.1 on home, listing, product page                                                                                        | UI     |
| Broken links / images | Crawl every page type: every link and image answers 2xx / 3xx (home already does this)                                                       | UI     |
| Console / API errors  | No JS errors and no failed API calls while loading each page type                                                                            | UI     |
| API contract          | Response shapes against the OpenAPI spec for the in-scope endpoints; known 500s stay in `known-bugs.json`                                    | API    |

## 3. Hybrid (automate the stable part, check the rest by hand)

| Feature                     | Automate                                                                                              | By hand                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Address with Google Maps    | Fill the text fields, save, and check the address through the API; or create it via the API           | Searching a place, dragging the pin, "Use my current location", the map on a phone |
| Same-day delivery countdown | With `page.clock` fixed before / after the 11:00 cut-off: "Arrives Today" vs next day, countdown text | That it ticks smoothly and reads naturally around midnight                         |
| Search relevance            | That the results contain the term and match the API count                                             | Whether the order of results makes sense to a shopper                              |
| Arabic                      | Direction, translated landmarks, no missing keys                                                      | Translation quality, mirrored icons, and that the RTL layout looks right           |
| Store announcement banner   | Text = `/info.generalNotice`, Dismiss hides it for the visit                                          | Whether the message is current and makes sense (e.g. "paused" next to "same-day")  |
| Order status                | Status labels and progress bar for whatever states exist                                              | Moving an order through Placed → Packed → On the way → Delivered (needs admin)     |
| Visual                      | Screenshot diffs catch layout breaks                                                                  | Reviewing and approving each new baseline                                          |

## 4. Leave for manual testing

| Area                                            | Why it stays manual                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Real OTP by SMS                                 | Tests use the fixed test OTP. Delivery to real UAE / Nepal / US numbers, delays and resends need a real phone |
| Stripe 3-D Secure and real cards                | 3DS pop-ups and bank pages are Stripe's iframe and change often; check a 3DS test card by hand each release   |
| Browser notifications                           | The permission prompt and push delivery (OneSignal) can't be driven reliably                                  |
| Share button                                    | Opens the phone's own share sheet                                                                             |
| App Store / Google Play, WhatsApp, social links | Automation checks the `href` only; that they open the right app is manual                                     |
| Delete account                                  | Destroys the shared test customer; check on a throw-away account by hand                                      |
| Admin-side effects                              | Refunds, order status changes, stock, promotions: no admin access                                             |
| Emails or calls after forms                     | Whether the team receives contact / business / sell / request submissions                                     |
| Look and feel, copy, images                     | Design review, wording, product photo quality, the "TEST" / Lorem ipsum content on dev                        |
| Screen reader experience                        | axe finds rule breaks; listening with VoiceOver / TalkBack shows whether it actually makes sense              |
| Real phones and slow networks                   | Touch, the on-screen keyboard covering fields, 3G, the Safari address bar                                     |
| Exploratory testing                             | New features, odd combinations, anything no one has thought of yet: one session per sprint                    |
| Production Cloudflare / Turnstile               | Not enforced on dev, so the bot check is only seen on production                                              |

## 5. Testability gaps to raise with the developers

These make the automated tests more fragile than they need to be:

1. **No `data-testid` anywhere.** Product cards especially have no root to grab (today: `div:has(> div > button[aria-pressed])`).
   Ask for `data-testid` on product card, cart line, order card, address card, deal card and basket card.
2. **Deal pack buttons are named only by prices** ("Add to cart: 4 4.50 6.00"), with no product name. That is
   ambiguous for tests and for screen-reader users.
3. **Each card has two links with the same name** (image and title). Make the image link decorative (`aria-hidden`, `tabindex=-1`).
4. **The header delivery link is named after the address nickname** ("Home"), so its name changes with the data. Give it a stable label such as "Delivering to Home".
5. **Inconsistent names:** "Breadcrumb" vs "breadcrumb", "Sign out" (desktop) vs "Logout" (phone menu),
   country filter is a `textbox` on listings but a `searchbox` on index pages.
6. **No way to set up data without admin:** promotions, coupons and stock can't be created by tests. Ask for a
   seeded set of test promotions and coupons that don't expire (today's `TEST …` deals end on 2026-11-18).
7. **The Sell form posts straight from the browser to a Make.com webhook** (`hook.eu1.make.com/…`), not through
   the API. The webhook address is public (anyone can post to it; not tested for rate limits), and every test submission reaches
   whatever that automation feeds. Route it through `/forms/*` like the other forms, or give tests a way to mark
   submissions as test data.
8. **Hand-made records on dev change what tests see:** e.g. a category "anweshan category" (Arabic name
   "caregory") now comes first in `/categories` and on the home page. Agree on a naming rule (`qa…`) and on who
   may add data to dev.
9. **The OpenAPI spec is out of date** (`/v1/api-json`): `/baskets` is missing, nullable fields are typed
   `object`, `GET /orders/{id}` lists fields the API never sends, error codes such as 404 are not documented,
   and endpoints that need a token (e.g. `/suppliers`, `/zoho/sync/*`) are not marked as such. Anyone generating
   a client from the spec gets wrong types. `tests/contract` tracks this.
10. **The store notice and the delivery promise can disagree:** on 2026-11-18 the notice said "Deliveries will be
   paused and will resume on Sunday", while `/info` and `/cart` still promised delivery the next day (Thursday).
   The notice is free text the backend does not know about; ask whether a pause should move `deliveryEstimate`.

## 6. Suggested next sprints

| Sprint | Scope                                      | Size                         |
| ------ | ------------------------------------------ | ---------------------------- |
| 3      | Product page                               | ~15 UI, ~6 API               |
| 4      | Cart (totals, actions, coupons)            | ~20 UI, ~25 API              |
| 5      | Checkout (COD, card, declined, minimum)    | ~10 UI, ~8 API               |
| 6      | Orders (list, detail, reorder, privacy)    | ~10 UI, ~6 API               |
| 7      | Account, addresses, wishlist               | ~15 UI, ~15 API              |
| 8      | Deals, baskets, forms, static, 404         | ~20 UI, ~10 API              |
| 9      | Arabic and a11y sweep over every page type | ~2 test loops over all pages |

Start with Sprint 4 (cart) if money matters most. It also builds the cart helpers that checkout and orders need.
