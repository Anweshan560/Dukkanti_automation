# Project guide

A plain-English list of what the automated tests check. Updated whenever tests are added.

## Counts

| Area                              | UI tests | API tests |
| --------------------------------- | -------: | --------: |
| Sign in and sign out              |        8 |        17 |
| Guest is asked to sign in         |        9 |         0 |
| Permissions                       |        0 |        15 |
| Search                            |        5 |         3 |
| Product list, sorting and paging  |        6 |        11 |
| Filters                           |        5 |         7 |
| Category, country and brand pages |        6 |         5 |
| Home and search                   |        1 |         0 |
| Store info                        |        0 |         1 |
| **Total**                         |   **40** |    **59** |

Smoke tests: 4. Tests marked as failing because of a known app bug: 3 (see "Known app bugs" at the end).

## Before the tests (setup)

- **Store check.** Reads the store settings and stops the run if payments are not in Stripe test mode, if the
  order rules (minimum order, delivery fee, free-delivery threshold, cash-on-delivery fee, tax) are missing, or
  if no product is in stock.
- **Guest session.** Gets past Cloudflare Access and confirms the storefront opens.
- **Customer session.** Signs in with the test phone number and code through the sign-in dialog, and saves the
  session so other tests start already signed in.

## Sign in and sign out

UI (`tests/auth/auth.spec.ts`). Each test starts as a guest and signs in by itself.

- **Smoke.** A guest clicks Sign in, enters the phone number, gets the four code boxes, enters the correct
  code, and the header then greets them by name.
- After signing in and reloading the page, the customer is still signed in.
- Choosing Sign out from the account menu and confirming returns the header to "Sign in", and the account
  page asks for sign-in again.
- Cancelling the "Sign out?" confirmation leaves the customer signed in.
- A wrong code shows "Invalid OTP", stays on the code step, and the visitor remains a guest.
- Continue is disabled while the number is empty; a number that is too short shows "Enter a valid mobile
  number" and the code step does not open.
- Change, on the code step, goes back to the phone step with the same country code selected.
- Close shuts the dialog and the visitor remains a guest.

API (`tests/auth/auth.api.spec.ts`)

- Asking for a code with a valid number succeeds and says the user already exists.
- Asking for a code is refused (400, with the validation message) when the number is missing, too short, not
  text, made of letters, or written without its country code.
- Logging in with the right number and code returns a token and the customer's profile.
- The returned token works: asking "who am I" with it returns the same customer.
- Logging in is refused with 401 "Invalid OTP" for a wrong code and for a code shorter than 4 digits, and no
  token is returned.
- Logging in is refused with 400 and the right messages when the body is empty, the code is missing, or the
  code is sent as a number instead of text.
- "Who am I" returns the customer's profile, without any secret fields, when signed in.
- "Who am I" is refused with 401 when there is no token, a made-up token, or the token is sent the wrong way.

## Guest is asked to sign in

UI (`tests/auth/auth.spec.ts`)

- Opening the cart, checkout, profile, orders, addresses or wishlist page as a guest opens the sign-in dialog
  (6 tests).
- **Smoke.** Clicking Add to cart on a product as a guest opens the sign-in dialog, and the cart still shows
  0 items.
- Clicking the cart button or the wishlist button in the header as a guest opens the sign-in dialog (2 tests).

## Permissions

API (`tests/auth/auth.api.spec.ts`)

- A guest is refused (401) on each customer-only endpoint: cart, orders, wishlist, addresses, coupons (5 tests).
- A signed-in customer is refused (403 "Forbidden resource") on each staff endpoint: admin products, admin
  users, admin orders, suppliers, stock (5 tests).
- A guest is refused (401) on the same staff endpoints (5 tests).

## Search

UI (`tests/catalog/catalog.spec.ts`)

- Typing a word in the header search box shows suggestions: an offer to search for that word and at least one
  product.
- Picking a product from the suggestions opens that product's page.
- The results page names the search, shows the same number of results the API reports, and lists the same
  first products in the same order.
- A search that matches nothing shows "0 products" and "Nothing matches these filters".
- With only a search term set, no "Clear filters" button is offered.

API (`tests/catalog/catalog.api.spec.ts`)

- Searching for a word from a product's name returns results, and searching for the full name returns that
  product.
- Upper and lower case in the search term give the same number of results.
- A search that matches nothing returns an empty list and a total of 0.

## Product list, sorting and paging

UI

- The "All products" page shows the total the API reports, a first batch of 20 products, and "Featured" as
  the sort.
- Scrolling to the end of the list loads the next products (page 2 is requested and at least 40 are shown).
- Choosing "Price: low to high", "Price: high to low" or "Name: A to Z" records the sort in the page address
  and shows the products in the order the API returns for that sort (3 tests).
- Opening a link that already contains a sort shows that sort selected and the products in that order.

API

- A guest gets a page of products with paging details (page, limit, total, number of pages), and every
  product has the fields the storefront shows.
- Page 2 shares no product with page 1.
- A page number past the last page returns an empty list.
- A limit that is not a number is refused with 400 and a validation message.
- **Known bug.** Page 0, a negative page and a negative limit should each be refused with 400; the API
  answers 500 (3 tests).
- A promotion id that is not a valid id is refused with 400 and a validation message.
- Sorting by price ascending and descending orders products by their price before discount (2 tests).
- Sorting by name gives alphabetical order, both A-to-Z and Z-to-A.

## Filters

UI

- Ticking a country under "Country of origin" opens that country's listing with its product count.
- Ticking a brand opens that brand's listing with its product count.
- Picking a category opens that category's listing with its product count and its subcategories.
- A country and a brand can be combined: the address carries both, the count matches the API, and "Clear all"
  returns to the full list.
- A country and brand with nothing in common show "Nothing matches these filters"; "Clear filters" brings
  back all products.

API

- Filtering by category, by subcategory, by country or by brand returns only matching products (4 tests).
- Combining brand and country returns no more than the brand alone, and every result matches both.
- A category that does not exist returns an empty list.
- Filtering by a promotion returns only products in that deal.

## Category, country and brand pages

UI

- **Smoke.** Opening a category page shows the category name, its product count and its products.
- Opening a country page or a brand page shows its name and product count (2 tests).
- The "all categories", "all countries" and "all brands" pages list their entries, the search box narrows the
  list, and clicking an entry opens its products (3 tests).

API

- Categories come with an id, English and Arabic names and their subcategories, and ids are unique.
- Only visible countries are returned.
- Brands are active and unique; with "local only", every brand returned is a local business; local businesses
  are not in the normal brand list.
- Filtering brands by category returns a shorter list of brands that do sell in that category.
- Active promotions each have a name, a type, a value and an end date in the future.

## Home and search

UI (`tests/home/home.spec.ts`)

- **Smoke.** A guest opens the home page, types a word from a real product name into the search box, presses
  Enter, and sees a results page that names the search and lists at least one product.

## Store info

API (`tests/info/info.api.spec.ts`)

- Without signing in, asking for the store settings succeeds and returns every setting the storefront needs
  (minimum order, delivery fee, free-delivery threshold, cash-on-delivery fee, tax, same-day delivery cutoff,
  delivery estimate, and a Stripe test-mode key), each of the right type.

## Cleanup

- **Addresses.** Deletes the test customer's saved addresses whose nickname ends in `qa` + 6 digits.

## Known app bugs

Tests for these are expected to fail until the app is fixed, and the run stays green. When one starts passing,
the run flags it so the marker can be removed. Run `npm run known-bugs` for the current list.

| Key                       | What is wrong                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `products-pagination-500` | Listing products with page 0, a negative page or a negative limit answers 500, not 400. |
| `products-invalid-id-500` | Asking for a product with a malformed id answers 500. Not used by a test yet.           |
