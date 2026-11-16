import { faker } from '@faker-js/faker';

/** Everything the suite creates carries this marker so cleanup can find it: `qa` + 6 digits. */
export const QA_MARKER = /qa\d{6}$/;

export const qaSuffix = (): string => `qa${faker.string.numeric(6)}`;

/** `Blue Mug` -> `Blue Mug qa482913` */
export const qaName = (base: string): string => `${base} ${qaSuffix()}`;

export const isQaMarked = (value: string | null | undefined): boolean =>
  !!value && QA_MARKER.test(value.trim());

export interface AddressInput {
  city: string;
  area: string;
  street: string;
  buildingName: string;
  unitNumber: string;
  nickName: string;
  phoneNumber?: string;
  addressType: 'Apartment' | 'Office' | 'House' | 'Other';
  geoPoint: { type: 'Point'; coordinates: [number, number] };
  googleMapsUrl: string | null;
}

/** A deliverable Dubai address. The marker goes in `nickName`. */
export function buildAddress(overrides: Partial<AddressInput> = {}): AddressInput {
  return {
    city: 'Dubai',
    area: 'Downtown',
    street: faker.location.street(),
    buildingName: `${faker.company.name()} Tower`,
    unitNumber: faker.string.numeric(4),
    nickName: qaName('Home'),
    addressType: 'Apartment',
    // GeoJSON order: [longitude, latitude]
    geoPoint: { type: 'Point', coordinates: [55.2708, 25.2048] },
    googleMapsUrl: null,
    ...overrides,
  };
}

export interface CustomerProfileInput {
  firstName: string;
  lastName: string;
  email: string;
  language: 'en' | 'ar';
}

/** Profile details for the logged-in customer. The marker goes in `lastName`. */
export function buildCustomer(overrides: Partial<CustomerProfileInput> = {}): CustomerProfileInput {
  const firstName = faker.person.firstName();
  return {
    firstName,
    lastName: qaName(faker.person.lastName()),
    email: `${firstName.toLowerCase()}.${qaSuffix()}@example.com`,
    language: 'en',
    ...overrides,
  };
}

export interface ContactMessageInput {
  fullName: string;
  email: string;
  phoneNumber: string;
  message: string;
}

/** A contact-form submission. The marker goes in `fullName`. */
export function buildContactMessage(overrides: Partial<ContactMessageInput> = {}): ContactMessageInput {
  return {
    fullName: qaName(faker.person.fullName()),
    email: `contact.${qaSuffix()}@example.com`,
    phoneNumber: `+97150${faker.string.numeric(7)}`,
    message: `Automated test message, please ignore. ${faker.lorem.sentence()}`,
    ...overrides,
  };
}
