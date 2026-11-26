# Dukkanti — App Map

Explored on 2026-11-16 as a guest and as a signed-in customer, and through the API spec. Cart and checkout
were seen empty only; their filled states get mapped in their own sprints.

## 1. Environments

| Thing         | Value                                                                                   |
| ------------- | --------------------------------------------------------------------------------------- |
| Storefront    | `https://dev.dukkanti.com` — behind Cloudflare Access (team `badeelocal`)               |
| API           | `https://api.stg.dukkanti.com/v1` — NestJS, **not** behind Cloudflare Access            |
| API spec      | `https://api.stg.dukkanti.com/v1/api-json` — OpenAPI, 166 operations, bearer JWT auth   |
| Payments      | Stripe in test mode (`pk_test_…` served by `GET /v1/info`), plus cash on delivery (COD) |
| Locale        | English and Arabic (`PARAGLIDE_LOCALE` cookie), currency AED                            |
| Delivery area | Dubai, Sharjah, Ajman                                                                   |

Store settings exposed by `GET /v1/info` (the setup check will assert these before a run):
`minOrderAmount` 50, `deliveryFee` 20, `deliveryCutOff` 200 (free delivery above), `codFee` 10,
`taxPercentage` 5, `sameDayDeliveryEnabled` true, `sameDayCutoff` 11:00, `localBrandsEnabled` true,
`generalNotice` (banner text).

## 2. Roles

| Role     | Can do                                                                                              |
| -------- | --------------------------------------------------------------------------------------------------- |
| Guest    | Browse, search, filter, view product/deal/basket pages, submit contact/business/sell/request forms. |
| Customer | Everything above plus cart, wishlist, delivery location, checkout, orders, addresses, profile.      |
| Admin    | Exists in the API (`/v1/admin/*`) but **out of scope** — no admin access.                           |

Since 2026-11-25 a guest **has a cart**, kept in the browser (`localStorage` keys `guest_cart` and
`guest_cart_changed_at`, no cart API calls). Add to cart, "+" on cards and basket "Buy" work without signing in,
and the header cart button opens the cart drawer. At `/checkout` a guest with items gets an inline "Your phone
number" step, with address and payment locked until the number is verified; with an empty cart `/checkout`
sends them away. Wishlist (heart and header), "Delivering to Dubai", an empty `/cart`, `/account` and
`/account/*` still open the sign-in dialog.

## 3. Pages (guest view)

| Path                                                                                           | What it is                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                                                            | Home: notice banner, hero, categories, deals, countries, Featured/Best prices tabs, brands, trending, local businesses                                                                                     |
| `/products`                                                                                    | All products: filters (Express delivery, category/subcategory, country, brand), sort, search. Server-rendered listing                                                                                      |
| `/products?searchTerm=tea`                                                                     | Search results                                                                                                                                                                                             |
| `/products/categories/{id}`                                                                    | Category listing with subcategory chips                                                                                                                                                                    |
| `/products/countries/{id}`                                                                     | Country listing                                                                                                                                                                                            |
| `/products/brands/{id}`                                                                        | Brand listing                                                                                                                                                                                              |
| `/products/{slug}`                                                                             | Product page: gallery, Share, quantity stepper, Add to cart, promotion pack buttons, Related products                                                                                                      |
| `/pay/{orderId}` (no sign-in, noindex)                                                         | Pay page from the WhatsApp link: "Order #N" + Pay → Stripe Checkout (`?paid=1` on return), "is paid", "can't be paid online" (unpaid card checkout, `awaiting-payment`), 404 "We couldn't find this order" |
| `/categories`, `/countries`, `/brands`, `/local-businesses`                                    | Index pages, each with a search box                                                                                                                                                                        |
| `/baskets`, `/baskets/{slug}`                                                                  | Curated baskets (Buy / Share)                                                                                                                                                                              |
| `/deals`, `/deals/{slug}`                                                                      | Promotions: buy X get Y, bundle price, mix and match, percentage off, amount off                                                                                                                           |
| `/request`                                                                                     | Request an item form (name, country, brand, radio options, notes)                                                                                                                                          |
| `/contact`                                                                                     | Contact form (fullName, email, phoneNumber, message)                                                                                                                                                       |
| `/business`                                                                                    | Business inquiry form                                                                                                                                                                                      |
| `/sell`                                                                                        | Sell on Dukkanti application form                                                                                                                                                                          |
| `/delivery`, `/return`, `/refund`, `/cancellation`, `/terms`, `/privacy`, `/cookies`, `/about` | Static policy pages                                                                                                                                                                                        |

### Pages that need a signed-in customer

| Path                 | What it is                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `/cart`              | Cart. Empty state: "Your cart is empty", Continue shopping                                                                    |
| `/checkout`          | Checkout. Loads addresses, cart and a Stripe customer session (`POST /payment/customer-session`)                              |
| `/account`           | Profile: first name, last name, mobile (read-only, "Verified"), email (optional), Save changes, Delete account, Notifications |
| `/account/orders`    | Your orders. Empty state: "No orders yet"                                                                                     |
| `/account/addresses` | Addresses. Empty state: "No addresses yet", Add new address                                                                   |
| `/account/wishlist`  | Wishlist with a saved-items count                                                                                             |
| My coupons           | In the account menu (page not opened yet)                                                                                     |

The account pages share a side menu (Profile, Orders, Addresses, Wishlist, My coupons, Sign out) with counters
for orders, wishlist and addresses. When signed in, the header shows an "Account" button ("Hello, <name>") and
Wishlist becomes a link. Every signed-in page calls `GET /users/me`, `/cart`, `/users/addresses`, `/wishlist`
and `/orders?limit=1&page=1`.

Header: delivery location button, Track order, Help, language switch, search combobox with typeahead
(suggests categories, brands and products, plus "See all N"), Request an item, Wishlist, Sign in, Cart.
There is no `/login`, `/search` or `/wishlist` route (all 404).

### Product listing behaviour

- 20 products per batch; more load automatically as the visitor scrolls (`GET /products?limit=20&page=N`).
- Sort by: Featured, Price: low to high, Price: high to low, Name: A to Z. The address gets
  `?sortBy=price&sortDirection=asc`; the API gets `sort=price:asc`.
- One filter becomes a path (`/products/countries/egypt`); two or more become a query
  (`/products?countries=egypt&brands=loyal`). API filter params: `categories`, `subCategories`, `countries`,
  `brands`, `searchTerm`, `promotionId`.
- No match: "Nothing matches these filters" and, when a filter is set, a "Clear filters" button.
- `GET /brands` leaves out local businesses; `GET /brands?localOnly=true` returns only them.
- The "all brands" page adds entries as the visitor scrolls.

### Sign-in dialog

Step 1: country code picker (UAE +971, Nepal +977, USA +1) and mobile number → Continue
(`POST /users/request-otp`, returns `{ success, message, userExists }`). Step 2, "Enter the code": four
single-digit boxes, Change, Verify and continue (`POST /users/login`, returns `{ user, token }`). Signing in
also creates the account. A wrong code shows "Invalid OTP" (API: 401). Sign out is in the header account menu and
asks "Sign out?" (Cancel / Sign out) first. There is no logout endpoint; earlier tokens stay valid. Turnstile is not enforced on dev. The session is kept in `localStorage`
under `dukkanti_auth`.

## 4. Flows

1. **Search** — type in header search → `GET /products?limit=5&searchTerm=` → Enter → `/products?searchTerm=`.
2. **Browse** — home → category / country / brand / deal / basket → product page.
3. **Sign in** — any gated action → dialog → phone → OTP → `POST /users/login` → JWT.
4. **Cart** — add, change quantity, remove, clear, promotions applied, coupon apply/remove. `GET /cart` returns
   `items, subTotal, vat, deliveryFee, codFee, discount, promotionDiscount, appliedCoupons, minimumOrder,
remainingToMinimum, deliveryCutOff, total, notices`.
5. **Checkout** — address, delivery preference, card (Stripe) or COD → `POST /cart/checkout`
   → `POST /payment/orders/{id}/confirm`.
6. **Orders** — list, order detail, reorder (`POST /cart/copy-order`).
7. **Account** — profile, addresses, wishlist, coupons, sign out, delete account.

## 5. API endpoints in scope

Errors are JSON: `{ message, error, statusCode }`; validation errors return `message` as an array.

### Public (no token)

| Method | Path                                                                                  | Notes                                                                                                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/info`                                                                               | Store settings (see section 1)                                                                                                                                                                                  |
| GET    | `/products`                                                                           | `{ data, total, page, limit, totalPages }`. Params seen: `limit`, `page`, `sort` (`featured:desc`, `price:asc`), `searchTerm`, `categories`, `promotionId`, `wishlist`, `excludeProductIds`                     |
| GET    | `/products/{id}`, `/products/slug/{slug}`, `/products/{id}/similar`                   | 404 `Product not found` for unknown id/slug                                                                                                                                                                     |
| GET    | `/categories`, `/countries`, `/brands` (`?localOnly=true`), `/baskets`, `/promotions` | Plain arrays                                                                                                                                                                                                    |
| POST   | `/forms/contact`, `/forms/business`                                                   | 400 with field messages on empty body                                                                                                                                                                           |
| POST   | `/users/request-otp`                                                                  | `{ phoneNumber, turnstileToken? }`                                                                                                                                                                              |
| POST   | `/users/login`                                                                        | `{ phoneNumber, otp, couponCode, attribution? }`                                                                                                                                                                |
| GET    | `/payment/orders/{orderId}`, POST `/payment/orders/{orderId}/link`                    | Public pay page. `/link` reuses one Stripe Checkout session per order; 409 when paid or not payable (card checkouts). Old buttons `GET /payment/pay/{id}` and `/payment/cod/{id}` redirect (302) to `/pay/{id}` |

### Customer (bearer token) — 401 `Authentication token is required` without one, 401 `Invalid or expired token` with a bad one

| Resource | Endpoints                                                                                                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Users    | GET/DELETE `/users/me`, PATCH `/users/profile` (`firstName, lastName, email, language`)                                                                                            |
| Address  | GET `/users/addresses`, POST `/users/address`, PATCH/DELETE `/users/address/{id}` (`city, area, street, buildingName, unitNumber, nickName, addressType, geoPoint, googleMapsUrl`) |
| Cart     | GET `/cart`, POST `/cart/add`, `/cart/add/bulk`, `/cart/sync`, `/cart/copy-order`, `/cart/checkout`; PATCH `/cart/update`; DELETE `/cart/{itemId}`, `/cart/clear`                  |
| Coupons  | GET/POST `/coupons`, POST `/coupons/apply`, `/coupons/remove` (`{ code }`)                                                                                                         |
| Wishlist | GET/DELETE `/wishlist`, POST `/wishlist/add`, DELETE `/wishlist/{itemId}`                                                                                                          |
| Orders   | GET `/orders?page&limit&state=active                                                                                                                                               | past`, GET `/orders/{id}` |
| Payment  | POST `/payment/customer-session`, POST `/payment/orders/{orderId}/confirm`                                                                                                         |

### Rate limits (measured)

The API answers 429 `Too many requests. Please try again later.` with no `Retry-After` or rate-limit
headers. Refused calls (400/404) count towards the limit. The tests wait out a 429 (`utils/rateLimit.ts`).

| Endpoint              | Limit                           | Measured   |
| --------------------- | ------------------------------- | ---------- |
| POST `/cart/checkout` | ~10 calls per customer, ~10 min | 2026-11-17 |
| POST `/coupons/apply` | 10 calls per customer, ~1 min   | 2026-11-26 |
| POST `/forms/*`       | 5 calls per caller, over 45 min | 2026-11-26 |

### Out of scope

`/admin/*`, `/suppliers`, `/margins`, `/keywords`, `/product-staging`, `/stock`, `/zoho/sync/*`,
`/upload/translate`. The spec lists suppliers and Zoho sync without auth, but they do return 401 without a token.

## 6. What the app does not have

Compared with the original feature list: no customer-facing **returns/refunds flow** found yet (only policy
pages; refunds are admin-side), no **inventory** view beyond `inStock` on a product, no **reports**, and
**admin product management** is not reachable. Confirmed after signing in: the customer account has none of these.

## 7. Possible app bugs found while exploring

| #   | Request                                              | Got                       | Expected                               |
| --- | ---------------------------------------------------- | ------------------------- | -------------------------------------- |
| 1   | `GET /v1/products?page=-1`, `?page=0`, `?limit=-1`   | 500 Internal server error | 400 validation error                   |
| 2   | `GET /v1/products/does-not-exist`                    | 500 Internal server error | 400 or 404                             |
| 3   | `GET /v1/products?limit=0`                           | 200 with a full page      | 400, or an empty page                  |
| 4   | `POST /v1/users/request-otp`, `POST /v1/users/login` | 201                       | 200, as the API spec documents (minor) |
| 5   | `GET /v1/products?limit=1000`                        | 200 with 1000 products    | An upper limit on page size            |
| 6   | `GET /v1/products?sort=bogus:asc`                    | 200, sort ignored         | 400, or a documented fallback          |

One behaviour to confirm rather than a clear bug: price sorting uses the price **before** discount, so in
"Price: high to low" a discounted item selling at 420 (was 525) is listed above one selling at 457.

## 8. Test data without admin access

Tests cannot create products, promotions or coupons. What a customer **can** create and clean up: addresses
(`nickName` ends in `qa######`), profile names, cart items, wishlist items, orders, form submissions
(name ends in `qa######`). Products are picked at run time from `GET /products` (in stock, express, known price)
instead of being hard-coded. Promotions named `TEST …` exist on dev but expire on 2026-11-18.

The test customer is an existing account with a real-looking name and `isTest: false`. Profile tests will
change its name and must put it back afterwards.

## 9. Proposed sprints

| Sprint | Feature                 | UI tests                                                           | API tests                                      |
| ------ | ----------------------- | ------------------------------------------------------------------ | ---------------------------------------------- |
| 0      | Framework (Phase 1)     | 1 smoke: home loads and search returns results                     | 1: `GET /info` shape                           |
| 1      | Auth and guest gating   | sign in with OTP, sign out, guest is asked to sign in              | request-otp, login, `/users/me`, 400/401 cases |
| 2      | Catalog and search      | search, typeahead, filters, sort, category/country/brand           | `/products` params, pagination, lookups, 404   |
| 3      | Product page            | details, quantity, related, promotion packs, share                 | by id, by slug, similar                        |
| 4      | Cart                    | add, update, remove, clear, totals, delivery fee threshold         | cart endpoints, validation, permissions        |
| 5      | Checkout and payments   | COD order, Stripe test card order, min order amount, declined card | checkout, confirm, payment page                |
| 6      | Orders                  | order appears in Your orders, detail, reorder                      | list, detail, another user's order is 404      |
| 7      | Account and addresses   | profile edit, address add/edit/delete, language                    | profile, address CRUD, validation              |
| 8      | Wishlist                | save, unsave, wishlist view                                        | wishlist endpoints                             |
| 9      | Deals, baskets, coupons | deal pricing in cart, basket Buy, coupon apply/remove              | promotions, baskets, coupons                   |
| 10     | Forms and static pages  | contact, business, sell, request, policy pages, Arabic             | forms validation                               |

Smoke set (about 12): home loads, search, category browse, product page, sign in, add to cart, update cart,
COD checkout, card checkout, order in Your orders, add address, sign out.

No "exclusive" tests are planned: store-wide settings are admin-only, so that project stays empty in the config.
