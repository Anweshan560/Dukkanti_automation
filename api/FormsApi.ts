import type { APIResponse } from '@playwright/test';
import type { ContactMessageInput } from '../utils/testData';
import { ResourceApi } from './ResourceApi';

export interface BusinessInquiryInput {
  fullName: string;
  businessName: string;
  email: string;
  phoneNumber: string;
}

export class FormsApi extends ResourceApi {
  protected readonly resource = '/forms';

  contact(body: Partial<ContactMessageInput>): Promise<APIResponse> {
    return this.post('/contact', body);
  }

  business(body: Partial<BusinessInquiryInput>): Promise<APIResponse> {
    return this.post('/business', body);
  }
}
