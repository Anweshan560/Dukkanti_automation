import type { APIResponse } from '@playwright/test';
import type { Credentials } from '../config/env';
import type { AddressInput, CustomerProfileInput } from '../utils/testData';
import { json, ResourceApi } from './ResourceApi';

export interface User {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phoneNumber: string;
  isTest: boolean;
  language: string;
  role: string;
  createdAt: string;
}

export interface LoginResponse {
  user: User;
  token: string;
}

export interface Address extends AddressInput {
  id: string;
}

export class UsersApi extends ResourceApi {
  protected readonly resource = '/users';

  requestOtp(phoneNumber: string): Promise<APIResponse> {
    return this.post('/request-otp', { phoneNumber });
  }

  login(body: { phoneNumber?: string; otp?: string; couponCode?: string }): Promise<APIResponse> {
    return this.post('/login', body);
  }

  /** Requests an OTP, logs in with it and returns the token. Throws a readable error if either step fails. */
  async loginAs(credentials: Credentials): Promise<LoginResponse> {
    await json(this.requestOtp(credentials.phone));
    return json<LoginResponse>(this.login({ phoneNumber: credentials.phone, otp: credentials.otp }));
  }

  me(): Promise<APIResponse> {
    return this.get('/me');
  }

  updateProfile(profile: Partial<CustomerProfileInput>): Promise<APIResponse> {
    return this.patch('/profile', profile);
  }

  listAddresses(): Promise<APIResponse> {
    return this.get('/addresses');
  }

  createAddress(address: Partial<AddressInput>): Promise<APIResponse> {
    return this.post('/address', address);
  }

  updateAddress(id: string, address: Partial<AddressInput>): Promise<APIResponse> {
    return this.patch(`/address/${encodeURIComponent(id)}`, address);
  }

  deleteAddress(id: string): Promise<APIResponse> {
    return this.delete(`/address/${encodeURIComponent(id)}`);
  }
}
