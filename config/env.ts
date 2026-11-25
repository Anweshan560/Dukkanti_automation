import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const read = (name: string, fallback = ''): string => process.env[name]?.trim() || fallback;

export interface Credentials {
  /** Full international number, e.g. `+971501234567`. */
  phone: string;
  /** Country code part, e.g. `+971`. */
  dialCode: string;
  /** The number without the country code, as typed into the sign-in dialog. */
  localNumber: string;
  otp: string;
}

/** Country codes the sign-in dialog offers. */
const DIAL_CODES = ['+971', '+977', '+1'];

const credentials = (prefix: string): Credentials | undefined => {
  const raw = read(`${prefix}_PHONE`).replace(/[\s-]/g, '');
  const otp = read(`${prefix}_OTP`);
  if (!raw || !otp) return undefined;
  // A number written without a country code gets <PREFIX>_DIAL_CODE, else CUSTOMER_DIAL_CODE, else UAE.
  const fallbackDialCode = read('CUSTOMER_DIAL_CODE', '+971');
  const phone = raw.startsWith('+') ? raw : `${read(`${prefix}_DIAL_CODE`, fallbackDialCode)}${raw}`;
  const dialCode = DIAL_CODES.find((code) => phone.startsWith(code));
  if (!dialCode) {
    throw new Error(
      `${prefix}_PHONE must start with one of ${DIAL_CODES.join(', ')} (the countries the app accepts).`,
    );
  }
  return { phone, dialCode, localNumber: phone.slice(dialCode.length), otp };
};

const authDir = path.resolve(__dirname, '..', '.auth');

export const env = {
  isCI: !!process.env.CI,
  baseUrl: read('BASE_URL', 'https://dev.dukkanti.com').replace(/\/+$/, ''),
  apiUrl: read('API_URL', 'https://api.stg.dukkanti.com/v1').replace(/\/+$/, ''),

  cloudflareAccess: {
    clientId: read('CF_ACCESS_CLIENT_ID'),
    clientSecret: read('CF_ACCESS_CLIENT_SECRET'),
    cookie: read('CF_AUTHORIZATION'),
  },

  customer: credentials('CUSTOMER'),
  customer2: credentials('CUSTOMER2'),

  stripeTestCard: read('STRIPE_TEST_CARD', '4242424242424242'),

  /** Data the store owner keeps on dev for the tests (tests cannot create coupons or change stock). */
  testData: {
    /** A coupon that works for the test customer: 10 % off the subtotal. */
    couponCode: read('TEST_COUPON_CODE', 'SAVE10'),
    /** A product kept out of stock on purpose. */
    outOfStockSlug: read('OUT_OF_STOCK_PRODUCT_SLUG', 'smart-chef-sucre-vanilline-7g'),
  },

  /** Store settings the suite was written against. Checked once in tests/setup/store.setup.ts. */
  expectedStore: {
    currency: read('EXPECT_CURRENCY', 'AED'),
    deliveryCities: ['Dubai', 'Sharjah', 'Ajman'],
  },

  /** Saved browser sessions, one per role. Written by tests/setup/auth.setup.ts. */
  storageState: {
    guest: path.join(authDir, 'guest.json'),
    customer: path.join(authDir, 'customer.json'),
  },
  /** API token for the customer, written next to the browser session. */
  customerTokenFile: path.join(authDir, 'customer-token.json'),
} as const;

/** Every value that must never appear in a report or a log. */
export const secretValues = (): string[] =>
  [
    env.cloudflareAccess.clientId,
    env.cloudflareAccess.clientSecret,
    env.cloudflareAccess.cookie,
    env.customer?.otp,
    env.customer2?.otp,
    env.stripeTestCard,
  ].filter((value): value is string => !!value && value.length >= 4);

/** Fails with one clear sentence when a required credential is missing. */
export function requireCustomer(which: 'customer' | 'customer2' = 'customer'): Credentials {
  const found = env[which];
  if (!found) {
    const prefix = which === 'customer' ? 'CUSTOMER' : 'CUSTOMER2';
    throw new Error(`${prefix}_PHONE and ${prefix}_OTP are not set. Add them to .env (see .env.example).`);
  }
  return found;
}
