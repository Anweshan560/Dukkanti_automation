# Dukkanti — Locator Catalogue

Crawled on 2026-11-17 as a guest and as the signed-in test customer: 34 page types per role, plus the
dialogs, menus and popups they open. The crawl was read-only (no form submits, no cart changes, no OTP).
Cart and checkout were empty, so their filled states are still to be mapped (see the end of this file).

## How to locate things in this app

- **There are no `data-testid` attributes.** The only one in the whole storefront is `data-testid="map"`
  inside Google Maps. Locate by **role + accessible name**, scoped to a landmark or section.
- **Never use `id`s that start with `base-ui-` or `_r_`.** They are React and Base UI auto-ids and change
  between renders and builds.
- **Stable attributes that do exist:** form fields have `name=` (`firstName`, `nickName`, `fullName`,
  `businessName`, …), contact fields have `id="field-<name>"`, the address form has `id="address-form"`,
  the phone menu has `id="mobile-navigation"`, and the header search has `name="searchTerm"`.
- **Scope before you match.** Many names repeat on a page: "See all" (×7 on home), "Shop by country" (hero
  link + section heading), "Syria" (hero chip + section + footer), and every product card has **two links
  with the same name** (image and title).
- **Arabic pages** (`/ar/…`) carry translated names, so role + English name locators work only on English
  pages. For i18n tests, take the expected text from the API's `nameAr` fields or match by `href`.

Shorthand below: `banner = page.getByRole('banner')`, `main = page.getByRole('main')`,
`footer = page.getByRole('contentinfo')`, `dialog = page.getByRole('dialog', { name })`.

---

## 1. Global: header, nav, footer (every page)

### Header, guest

| Element                                                | Locator                                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Skip link                                              | `page.getByRole('link', { name: 'Skip to content' })` → `#main-content`                           |
| Logo                                                   | `banner.getByRole('link', { name: 'Dukkanti' })` → `/`                                            |
| Search box                                             | `banner.getByRole('combobox', { name: 'Search products...' })` (`name=searchTerm`)                |
| Search / Clear buttons                                 | `banner.getByRole('button', { name: 'Search' })`, `{ name: 'Clear search' }` (shown after typing) |
| Request an item                                        | `banner.getByRole('link', { name: 'Request an item' })` → `/request`                              |
| Wishlist (guest)                                       | `banner.getByRole('button', { name: 'Wishlist' })` → opens sign-in                                |
| Sign in                                                | `banner.getByRole('button', { name: 'Sign in' })`                                                 |
| Cart                                                   | `banner.getByRole('button', { name: 'Cart' })`; text "N items" + amount                           |
| Delivery promo                                         | `banner.getByRole('button', { name: "First order? Delivery's on us" })` → delivery dialog         |
| Category nav                                           | `banner.getByRole('navigation', { name: 'Categories' })`                                          |
| ↳ All categories                                       | `nav.getByRole('button', { name: 'All categories' })` (mega menu, not yet mapped)                 |
| ↳ Baskets / Deals / Shop by country / Local businesses | `nav.getByRole('link', { name })`                                                                 |
| ↳ Track order                                          | `nav.getByRole('link', { name: 'Track order' })` → `/account/orders`                              |
| ↳ Help                                                 | `nav.getByRole('link', { name: 'Help' })` → `/contact`                                            |
| ↳ Language                                             | `nav.getByRole('button', { name: 'Language: English' })` (toggles straight to Arabic, no menu)    |

### Header, signed-in customer: what changes

| Element           | Locator                                                                                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account button    | `banner.getByRole('button', { name: 'Account' })`; text "Hello, <first name>"                                                                                                                  |
| Wishlist          | becomes a **link**: `banner.getByRole('link', { name: 'Wishlist' })` → `/account/wishlist?page=1`                                                                                              |
| Delivery location | link named after the **default address nickname** (e.g. "Home") → `/account/addresses`. Its name changes with the data, so locate it by `href`: `nav.locator('a[href$="/account/addresses"]')` |
| Delivery promo    | `banner.getByRole('button', { name: "Spend AED 200, delivery's on us" })` (amount from `/info`)                                                                                                |

### Account menu (customer → Account button)

`page.getByRole('menu', { name: 'Account' })`, then `getByRole('menuitem', { name })`:
profile card ("<name> <phone> Member since YYYY"), "N Orders", "N Wishlist", "N Addresses", Orders,
Addresses, Wishlist, My coupons, "Notifications Blocked/Allowed", "Language العربية", "Use browser language",
"Help & support", "Refund and return policy", "WhatsApp Chat on WhatsApp", **Sign out**.

### Sign-out confirmation

`page.getByRole('alertdialog', { name: 'Sign out?' })` → buttons `Cancel`, `Sign out`.

### Search suggestions (type in the search box)

| Element        | Locator                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Popup          | `banner.getByRole('listbox', { name: 'Search suggestions' })`                                                                               |
| Search for "x" | `listbox.getByRole('option', { name: /^Search for “tea”/ })` (name ends with the count)                                                     |
| Groups         | `listbox.getByRole('group', { name: 'Categories' \| 'Brands' \| 'Products' })`                                                              |
| Product option | `group('Products').getByRole('option', { name: /^El Arosa Tea 100 Tea Bags/ })` (name also holds brand, country, price and "Add … to cart") |
| See all        | `listbox.getByRole('option', { name: /^See all \d+/ })`                                                                                     |

### Footer

| Element      | Locator                                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| App badges   | `footer.getByRole('link', { name: /App Store/ })`, `{ name: /Google Play/ }`                                                           |
| Link columns | `footer.getByRole('navigation', { name: 'Shop' \| 'Baskets' \| 'Deals' \| 'Countries' \| 'Help' \| 'Company' })`                       |
| Social       | `footer.getByRole('link', { name: 'Instagram' \| 'Facebook' \| 'WhatsApp' \| 'TikTok' })`                                              |
| Legal        | `footer.getByRole('link', { name: 'Terms & Conditions' \| 'Privacy Policy' \| 'Refund Policy' \| 'Cancellation' \| 'Cookie Policy' })` |
| Language     | `footer.getByRole('button', { name: 'Language: العربية' })`, `{ name: 'Use browser language' }`                                        |
| Copyright    | `footer.getByText(/© \d{4} Dukkanti/)`                                                                                                 |
| Toasts       | `page.getByRole('region', { name: 'Notifications' })` (always in the page)                                                             |

### Phone layout (390 px)

Menu button opens `page.getByRole('dialog', { name: 'Dukkanti' })` (`#mobile-navigation`): Close,
"Request an item Can't find something from home?", All categories, Deals, Baskets, Shop by country, Local
businesses, Account section (guest: `Sign in`; customer: Profile, Orders, Addresses, Wishlist, **`Logout`**),
Language. The phone menu says "Logout" where the desktop says "Sign out".

---

## 2. Dialogs

### Sign in or create an account

`dialog = page.getByRole('dialog', { name: 'Sign in or create an account' })`

| Element         | Locator                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Country code    | `dialog.getByRole('combobox', { name: 'Country code' })` → `getByRole('option', { name: /\+971/ \| /\+977/ \| /\+1$/ })` |
| Mobile number   | `dialog.getByRole('textbox', { name: 'Mobile number' })` (`name=phone`, placeholder "50 000 0000")                       |
| Continue        | `dialog.getByRole('button', { name: 'Continue' })` (disabled until a number is typed)                                    |
| Code step       | four one-digit boxes, `Change`, `Verify and continue` (already in `pages/auth/SignInDialog.ts`)                          |
| Terms / Privacy | `dialog.getByRole('link', { name: 'Terms' \| 'Privacy Policy' })`                                                        |
| Close           | `dialog.getByRole('button', { name: 'Close' })`                                                                          |

The same dialog opens on its own for a guest at an empty `/cart` and at `/account/*`. A guest with items at
`/checkout` gets an inline step instead: heading "Your phone number", button `Send code`.

### Here's how delivery works (delivery promo button)

`page.getByRole('dialog', { name: "Here's how delivery works" })`: Close, list of rules (guest sees "First
order? Delivery's on us"; customer sees "Spend AED 200…"), region "Need a few more things?" (product cards +
`View all` + `Next`), region "Baskets & deals" (basket links + `Buy` buttons + deal links + `Next`).

### Your cart (header Cart button, customer)

`page.getByRole('dialog', { name: 'Your cart' })`: `Close cart`; when empty: "Your cart is empty",
`Start shopping`. **Filled state not mapped yet.**

### Add new address (`/account/addresses` → Add new address)

`dialog = page.getByRole('dialog', { name: 'Add new address' })` (form `#address-form`)

| Element                         | Locator                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Map search                      | `dialog.getByRole('combobox', { name: 'Search building, street or area' })` (Google Places)                                                 |
| Map                             | `dialog.getByRole('region', { name: 'Map' })`, `Zoom in`, `Zoom out`, `Expand map`, `Use my current location`                               |
| Address type                    | `dialog.getByRole('radiogroup', { name: 'Address type' }).getByRole('radio', { name: 'Apartment' \| 'House' \| 'Office' \| 'Other' })`      |
| Nickname                        | `dialog.getByRole('textbox', { name: 'Nickname (optional)' })` (`name=nickName`)                                                            |
| City                            | `dialog.getByRole('radiogroup', { name: 'City *' }).getByRole('radio', { name: 'Dubai' \| 'Sharjah' \| 'Ajman' })`                          |
| Area / Street / Building / Unit | `getByRole('textbox', { name: 'Area *' \| 'Street' \| 'Building name *' \| 'Unit number *' })` (`name=area/street/buildingName/unitNumber`) |
| Extra phone                     | `getByRole('textbox', { name: 'Additional phone number (optional)' })` (`name=phoneNumber`)                                                 |
| Cancel / Save                   | `dialog.getByRole('button', { name: 'Cancel' \| 'Save' })`                                                                                  |

---

## 3. Pages

### Home `/`

Covered by `pages/home/HomePage.ts` and `pages/home/components/*`. Sections in order:
region `Store update` (`Dismiss`) → hero (H1 "Groceries from home…", `Start shopping`, `Shop by country`,
country chips; customer also gets H2 "From your last order" with `View order` + `Reorder`) → "Shop by category" →
"Deals" → "Shop by country" → tablist (`tab` "Featured" / "Best prices" + `tabpanel`) → "Shop by brand" →
"Trending now" → "Local businesses" → request call to action (link whose name starts "Can’t find something from home?").

Scope each "See all" by its section:
`main.locator('section').filter({ has: page.getByRole('heading', { name: 'Deals' }) }).getByRole('link', { name: 'See all' })`.

### Product card (home, listings, deal, basket, related, delivery dialog)

| Element                 | Locator (inside a card scope)                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Image link / title link | `card.getByRole('link', { name: productName })`: **two matches**, use `.first()` for the image or `.last()` for the title                                |
| Wishlist heart          | `getByRole('button', { name: 'Save or unsave <name>' })`; the state is in `aria-pressed`, not the name                                                   |
| In-cart stepper         | after adding: `Increase quantity`, and `Remove` at quantity 1 / `Decrease quantity` above 1                                                              |
| Add one                 | `getByRole('button', { name: 'Add <name> to cart' })`                                                                                                    |
| Deal pack button        | `getByRole('button', { name: /^Add to cart: \d+/ })`, e.g. "Add to cart: 4 4.50 6.00". **The name has no product in it**, so always scope it to the card |
| Badges / text           | "Express", delivery date ("Sun, 22 Nov"), deal label ("Buy any 3, get 1 free"), "20% off", "Brand · Country", price, old price                           |

Card scope: there is no card test id, so `pages/home/components/ProductCard.ts` uses
`PRODUCT_CARD_SELECTOR = 'div:has(> div > button[aria-pressed])'` (the tile around the heart). It works in
English and Arabic. Reuse it everywhere; don't write new card locators.

### Listings `/products`, `/products/{categories|countries|brands}/{slug}`, `?searchTerm=`

Covered by `pages/catalog/ProductListPage.ts`.

| Element                | Locator                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Breadcrumb             | `main.getByRole('navigation', { name: 'Breadcrumb' })`                                                                                                        |
| Filters panel          | `main.getByRole('complementary')`                                                                                                                             |
| Express delivery       | `filters.getByRole('button', { name: 'Express delivery' })` (`[pressed]` when on)                                                                             |
| Category / subcategory | `filters.getByRole('button', { name: 'Dairy Products' })` (`[pressed]`); subcategories appear under the chosen one; `Show more`                               |
| Country filter         | `filters.getByRole('textbox', { name: 'Search countries...' })` + `filters.getByRole('group', { name: 'Country of origin' }).getByRole('checkbox', { name })` |
| Brand filter           | `filters.getByRole('textbox', { name: 'Search brands...' })` + `group('Brand').getByRole('checkbox', { name })`                                               |
| Heading                | `main.getByRole('heading', { level: 1 })` ("All products", category name, …)                                                                                  |
| Sort                   | `main.getByRole('combobox', { name: 'Sort by' })` → Featured / Price: low to high / Price: high to low / Name: A to Z                                         |
| Count                  | `main.getByText(/^\d+ products$/)`                                                                                                                            |
| No results             | "Nothing matches these filters" + `Clear filters` button                                                                                                      |

### Product page `/products/{slug}`

| Element            | Locator                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Breadcrumb         | `main.getByRole('navigation', { name: 'breadcrumb' })`: **lower-case "b" here**, upper-case on listings. Use `{ name: /breadcrumb/i }` |
| Image              | `main.getByRole('img', { name: productName }).first()`                                                                                 |
| Wishlist / Share   | `getByRole('button', { name: 'Save or unsave <name>' })`, `getByRole('button', { name: 'Share' })`                                     |
| Country / brand    | `main.getByRole('link', { name: 'Syria' }).first()`, `getByRole('link', { name: 'Derby' })`                                            |
| Title              | `main.getByRole('heading', { level: 1 })`                                                                                              |
| Delivery           | text "Arrives Today" / date                                                                                                            |
| Deal link          | `main.getByRole('link', { name: 'Buy any 3, get 1 free' })` → `/deals/{slug}`                                                          |
| Quantity           | `getByRole('button', { name: 'Decrease quantity' })` (disabled at 1), `{ name: 'Increase quantity' }`                                  |
| Add to cart        | `getByRole('button', { name: /^Add to cart \d/ })` (name holds the line price)                                                         |
| Add pack           | `getByRole('button', { name: /^Add pack of \d+/ })`                                                                                    |
| Same-day countdown | text "Want it today? … Order within HH:MM:SS"                                                                                          |
| Related            | H2 "Related products", `link` "More <category>", product cards                                                                         |

### Index pages `/categories`, `/countries`, `/brands`, `/local-businesses`

H1 + `main.getByRole('searchbox', { name: 'Search categories...' | 'Search countries...' | 'Search brands...' })`

- one link per entry (`/products/{kind}/{slug}`). `/brands` loads more as you scroll. `/local-businesses`
  reuses "Search brands...". Covered by `pages/catalog/DirectoryPage.ts`.

### Baskets `/baskets`, `/baskets/{slug}`

- List: H1 "Baskets"; per basket a link (name = title + description), `Customize` link and, for some, a `Buy` button.
- Detail: text "Basket", H1 = basket name, "N products", description, `Share`, product cards, H2 "You may find
  these interesting", `Next`.

### Deals `/deals`, `/deals/{slug}`

- List: H1 "Deals"; per deal a link named "<label> <name> Ends <date>".
- Detail: H1 = label ("Buy 2 get 1 free"), paragraph "<name> · Ends <date>", product cards with pack buttons,
  H2 "More deals" + `See all` + other deal links.

### Forms (guest and customer)

| Page        | Fields (role + name, `name=` attribute)                                                                                                                                                                                                                | Submit                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `/request`  | textbox "Item name"; combobox "Country of origin"; textbox "Brand (optional)"; radiogroup "Budget per unit" (10–49, 50–99, 100–199, 200–499); textbox "Notes (optional)"                                                                               | `Add request to cart` (asks a guest to sign in) |
| `/contact`  | textbox "Name" (`fullName`, `#field-fullName`), "Email" (`email`), "Phone number" (`phoneNumber`), "Message" (`message`)                                                                                                                               | `Submit`                                        |
| `/business` | textbox "Company name" (`companyName`), "Contact name" (`contactName`), "Email", "Phone number" (`phone`), "Message"                                                                                                                                   | `Submit`                                        |
| `/sell`     | textbox "Business name" (`businessName`), "Contact person" (`contactPerson`), "Email", "Phone number" (`phone`), combobox "Business type", textbox "City" (`city`), "Instagram handle (optional)" (`instagram`), "Describe your products" (`products`) | `Submit application`                            |
| `/account`  | textbox "First name *" (`firstName`), "Last name *" (`lastName`), "Mobile number" (read-only, "Verified"), "Email (optional)" (`email`)                                                                                                                | `Save changes`; also `Delete account`           |

### Account pages (customer)

All share `main.getByRole('complementary')`: summary links "Profile", "N Orders", "N Wishlist", "N Addresses",
and `navigation "Account menu"` (Profile, Orders, Addresses, Wishlist, My coupons, button `Sign out`).

| Page                   | What is on it                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/account`             | profile form (above) + region "Notifications" (permission state: "Blocked" or "Allowed")                                                                                                                                                                                                                                                                                                                                                            |
| `/account/orders`      | H1 "Your orders"; `navigation "Order sections"` → buttons `Pending` / `Past orders` (`[pressed]`); region "Pending"; one link per order `View order #10397` (status, arrival, items, total, `progressbar`); H2 "Past orders"; "You’ve reached the end"                                                                                                                                                                                              |
| `/pay/{orderId}`       | H1 "Order #N" / "Order #N is paid" / "This order can't be paid online" / "We couldn't find this order"; paragraph "Amount to pay"; button `Pay <amount>`; `Continue shopping`; `Chat with us on WhatsApp`. Stripe Checkout: H2 "Dukkanti order #N", amount "AED 85.13" (no-break space), form in `iframe[src*=elements-inner-habanero]`: `Pay without Link`, `Card number`, `Expiration (MM/YY)`, `Security code`, `Name on card`, `Country`, `Pay` |
| `/account/orders/{id}` | `All orders`, H1 "Order #N", "Placed <date>", `Chat with us on WhatsApp` (pre-filled with the order number), status + `progressbar`, `Order again`, H2 "N items" + `list` of lines ("7 × 11.50 = 80.50"), deliver-to, payment method, out-of-stock preference, Subtotal / Delivery fee / VAT / Total, H2 "Order timeline" + `list` with `time`                                                                                                      |
| `/account/addresses`   | H1 "Addresses"; one `article` per address: button (full address), `Edit`, "Default" or `Set as default`, `Remove`; `Add new address`                                                                                                                                                                                                                                                                                                                |
| `/account/wishlist`    | H1 "Wishlist", "N saved items"; empty: H2 "Your wishlist is empty" + `Continue shopping`                                                                                                                                                                                                                                                                                                                                                            |
| `/account/coupons`     | H1 "My coupons", "Add products to your cart to use coupons.", empty: "No coupons yet"                                                                                                                                                                                                                                                                                                                                                               |
| `/cart` (empty)        | "Your cart is empty", `Continue shopping`                                                                                                                                                                                                                                                                                                                                                                                                           |
| `/checkout` (empty)    | H1 "Checkout", "Your cart is empty", `Continue shopping`                                                                                                                                                                                                                                                                                                                                                                                            |

### Static pages `/delivery`, `/return`, `/refund`, `/cancellation`, `/terms`, `/privacy`, `/cookies`, `/about`

A side navigation with H2 "Help & policies", H1 = policy title, H2 per section (e.g. Delivery Policy → Delivery
Coverage, Delivery Time, Delivery Fees, Shipping Process, Delivery Confirmation, Address Information).

### 404

Any unknown path answers **HTTP 404**: "Error 404", H1 "Page not found", links `Go home`, `All products`, `All categories`.

---

## 4. Not mapped yet

- Cart drawer, `/cart` and `/checkout` **with items**: coupon box, delivery slot, payment (Stripe Elements
  iframe and COD), place order. Map this at the start of the cart and checkout sprints, with a filled cart.
- "All categories" mega menu.
- Edit address dialog and the remove-address confirmation.
- Delete account confirmation (do not open it on the shared test customer).
- Sign-in code step: already in `pages/auth/SignInDialog.ts`.

The raw crawl (accessibility tree and element attributes for every page) can be regenerated with the crawler
used for this file. Ask for it to be added under `scripts/` if it should be kept.
