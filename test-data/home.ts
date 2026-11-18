/**
 * Everything the home page tests treat as fixed. Change it here, not in the tests.
 *
 * Lists that the business manages in the CMS (categories, countries, brands, local businesses) are also
 * compared against the API, so a change in the CMS shows up as a clear "list changed" failure.
 */

const num = (name: string, fallback: number): number => {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? fallback : Number(raw);
};

export const homeData = {
  /** Order rules. Confirmed against GET /info by the store setup check and by the home API tests. */
  thresholds: {
    minimumOrder: num('EXPECT_MIN_ORDER', 50),
    freeDelivery: num('EXPECT_FREE_DELIVERY', 200),
    deliveryFee: num('EXPECT_DELIVERY_FEE', 20),
    /**
     * How the threshold bar turns a remaining amount into a whole number. 37.50 is shown as "38".
     * Every price on dev ends in .00 or .50, so "ceil" and "round half up" give the same result there.
     */
    rounding: 'ceil' as 'ceil' | 'round',
  },

  search: {
    placeholder: 'Search groceries, brands or countries',
    byProduct: 'freekeh',
    byBrand: 'Loyal',
    byCountry: 'Syria',
    arabic: 'أرز',
    noResults: 'zzqxjvwk',
    xss: '<script>alert(1)</script>',
    special: `%_&'"\\;--`,
  },

  hero: {
    heading: 'Groceries from home, delivered to your door.',
    subtext:
      'Olive oil, freekeh, kaak and the pantry staples you grew up with, from Palestine, Syria, Lebanon, Jordan, Egypt and more.',
    sameDayBadge: 'Same-day delivery across Dubai, Sharjah and Ajman',
    freeDeliveryBadge: 'Free delivery over',
  },

  /** Shop by category: names in display order. */
  categories: [
    'Dairy Products',
    'Cans & Jars',
    'Pasta, Rice & More',
    'Home Baking',
    'Herbs & Spices',
    'Bakery',
  ],

  /** Number of deal cards the home page shows when enough deals are running. */
  maxDealCards: 4,
  /** Product thumbnails shown on one deal card, at most. */
  maxDealThumbnails: 4,

  countriesSubtitle: 'Everything on Dukkanti is grouped by where it comes from.',
  countries: [
    'Syria',
    'Palestine',
    'Egypt',
    'Jordan',
    'Tunisia',
    'Lebanon',
    'Morocco',
    'UAE',
    'Turkey',
    'India',
    'Saudi Arabia',
    'Bahrain',
    'Oman',
  ],

  brands: [
    'Al Alali',
    'Bayara',
    'Himalaya',
    'Loyal',
    'Alokozay',
    'Tiffany',
    'Lacnor',
    'Shan',
    'Vatika',
    'Al Ain',
    'Cool & cool',
    'Crunchos',
  ],

  localBusinesses: ['Kings Palace', 'Ola Stitch', 'Bogja'],

  /** Products in each home product row. */
  productRows: { featured: 10, bestPrices: 10, trending: 5 },

  requestCta: {
    heading: 'Can’t find something from home?',
    text: 'Tell us what you miss and we’ll try to source it for you.',
  },

  footer: {
    tagline: 'Beloved Arab groceries and specialty items, carefully delivered to your doorstep.',
    appDownloadUrl: 'https://links.dukkanti.ae/web-download-dukkanti-app',
    /** The footer "Countries" column. */
    countries: ['Syria', 'Palestine', 'Egypt', 'Jordan', 'Tunisia'],
    help: [
      { name: 'Track order', path: '/account/orders' },
      { name: 'Delivery', path: '/delivery' },
      { name: 'Return Policy', path: '/return' },
      { name: 'Request an item', path: '/request' },
      { name: 'Contact us', path: '/contact' },
    ],
    company: [
      { name: 'About Us', path: '/about' },
      { name: 'Sell on Dukkanti', path: '/sell' },
      { name: 'Business inquiry', path: '/business' },
    ],
    legal: [
      { name: 'Terms & Conditions', path: '/terms' },
      { name: 'Privacy Policy', path: '/privacy' },
      { name: 'Refund Policy', path: '/refund' },
      { name: 'Cancellation', path: '/cancellation' },
      { name: 'Cookie Policy', path: '/cookies' },
    ],
    social: [
      { name: 'Instagram', url: /^https:\/\/www\.instagram\.com\/dukkanti_?$/ },
      { name: 'Facebook', url: /^https:\/\/www\.facebook\.com\/dukkanti$/ },
      { name: 'WhatsApp', url: /^https:\/\/wa\.me\/97180038552684$/ },
      { name: 'TikTok', url: /^https:\/\/www\.tiktok\.com\/@dukkanti$/ },
    ],
    copyright: (year: number): string => `© ${year} Dukkanti · Dubai, UAE`,
  },

  /** Words that mean test or broken data reached the page. Matched as whole words. */
  forbiddenWords: [/\bTEST\b/, /\bfoobar\b/i, /\blorem\b/i, /\bundefined\b/i, /\bnull\b/i, /\bNaN\b/],

  viewports: {
    mobile: { width: 375, height: 812 },
    tablet: { width: 768, height: 1024 },
    desktop: { width: 1440, height: 900 },
  },

  performance: { lcpMs: 2500, cls: 0.1 },
} as const;

/** The whole number the threshold bar shows for a remaining amount. */
export function thresholdDisplay(remaining: number): number {
  // Round to cents first so 37.4999999 from float maths does not become 38 by accident.
  const cents = Math.round(remaining * 100) / 100;
  return homeData.thresholds.rounding === 'ceil' ? Math.ceil(cents) : Math.round(cents);
}
