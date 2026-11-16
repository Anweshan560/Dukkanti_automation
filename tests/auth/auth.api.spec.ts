import type { ApiError, LoginResponse, User } from '../../api';
import { env, requireCustomer } from '../../config/env';
import { expect, test } from '../../fixtures/test';

const userShape = {
  id: expect.any(String),
  phoneNumber: expect.any(String),
  role: 'customer',
  language: expect.stringMatching(/^(en|ar)$/),
  isTest: expect.any(Boolean),
  createdAt: expect.any(String),
};

test.describe('Request OTP API', { tag: '@auth' }, () => {
  test('should accept the request when the phone number is valid', async ({ api }) => {
    const response = await test.step('POST /users/request-otp with the test phone number', () =>
      api.users.requestOtp(requireCustomer().phone));

    await test.step('Responds with success and says the user already exists', async () => {
      // The API spec documents 200; the API answers 201. Either is a success.
      expect([200, 201]).toContain(response.status());
      expect(await response.json()).toEqual({
        success: true,
        message: 'OTP sent successfully',
        userExists: true,
      });
    });
  });

  const invalidNumbers = [
    {
      name: 'is missing',
      body: {},
      messages: ['phoneNumber should not be empty', 'Enter a valid mobile number'],
    },
    { name: 'is too short', body: { phoneNumber: '123' }, messages: ['Enter a valid mobile number'] },
    { name: 'is not a string', body: { phoneNumber: 12345 }, messages: ['Enter a valid mobile number'] },
    { name: 'is text', body: { phoneNumber: 'not-a-number' }, messages: ['Enter a valid mobile number'] },
  ];

  for (const { name, body, messages } of invalidNumbers) {
    test(`should reject the request with 400 when the phone number ${name}`, async ({ request }) => {
      const response = await test.step('POST /users/request-otp', () =>
        request.post(`${env.apiUrl}/users/request-otp`, { data: body }));

      await test.step('Responds 400 with the validation messages', async () => {
        expect(response.status()).toBe(400);
        const error = (await response.json()) as ApiError;
        expect(error).toEqual({ message: messages, error: 'Bad Request', statusCode: 400 });
      });
    });
  }

  test('should reject a phone number written without its country code', async ({ api }) => {
    const response =
      await test.step('POST /users/request-otp with the number without "+" and country code', () =>
        api.users.requestOtp(requireCustomer().localNumber));

    await test.step('Responds 400 "Enter a valid mobile number"', async () => {
      expect(response.status()).toBe(400);
      expect(((await response.json()) as ApiError).message).toEqual(['Enter a valid mobile number']);
    });
  });
});

test.describe('Login API', { tag: '@auth' }, () => {
  test('should return a token and the user when the phone number and code are correct', async ({ api }) => {
    const customer = requireCustomer();

    const response = await test.step('Request a code, then POST /users/login with it', async () => {
      await api.users.requestOtp(customer.phone);
      return api.users.login({ phoneNumber: customer.phone, otp: customer.otp });
    });

    await test.step('Responds with a JWT and the customer profile', async () => {
      expect([200, 201]).toContain(response.status());
      const body = (await response.json()) as LoginResponse;
      expect(body.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
      expect(body.user).toEqual(expect.objectContaining({ ...userShape, phoneNumber: customer.phone }));
    });
  });

  test('should let the customer call the API with the token it returned', async ({ api, request }) => {
    const customer = requireCustomer();
    const { token } = await test.step('Log in', () => api.users.loginAs(customer));

    const response = await test.step('GET /users/me with the new token', () =>
      request.get(`${env.apiUrl}/users/me`, { headers: { Authorization: `Bearer ${token}` } }));

    await test.step('Responds 200 with the same customer', async () => {
      expect(response.status()).toBe(200);
      expect(((await response.json()) as User).phoneNumber).toBe(customer.phone);
    });
  });

  test('should reject the login with 401 "Invalid OTP" when the code is wrong', async ({ api }) => {
    const customer = requireCustomer();
    const wrongCode = customer.otp === '0000' ? '1111' : '0000';

    const response = await test.step('POST /users/login with a wrong code', () =>
      api.users.login({ phoneNumber: customer.phone, otp: wrongCode }));

    await test.step('Responds 401 and returns no token', async () => {
      expect(response.status()).toBe(401);
      const body = await response.json();
      expect(body).toEqual({ message: 'Invalid OTP', error: 'Unauthorized', statusCode: 401 });
      expect(body).not.toHaveProperty('token');
    });
  });

  test('should reject the login with 401 when the code is shorter than 4 digits', async ({ api }) => {
    const response = await test.step('POST /users/login with a 2-digit code', () =>
      api.users.login({ phoneNumber: requireCustomer().phone, otp: '12' }));

    await test.step('Responds 401 "Invalid OTP"', async () => {
      expect(response.status()).toBe(401);
      expect(((await response.json()) as ApiError).message).toBe('Invalid OTP');
    });
  });

  test('should reject the login with 400 when the body is empty', async ({ api }) => {
    const response = await test.step('POST /users/login with {}', () => api.users.login({}));

    await test.step('Responds 400 and names every missing field', async () => {
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({
        message: [
          'phoneNumber should not be empty',
          'Enter a valid mobile number',
          'otp should not be empty',
          'otp must be a string',
        ],
        error: 'Bad Request',
        statusCode: 400,
      });
    });
  });

  test('should reject the login with 400 when the code is missing', async ({ api }) => {
    const response = await test.step('POST /users/login with only the phone number', () =>
      api.users.login({ phoneNumber: requireCustomer().phone }));

    await test.step('Responds 400 with the otp messages', async () => {
      expect(response.status()).toBe(400);
      expect(((await response.json()) as ApiError).message).toEqual([
        'otp should not be empty',
        'otp must be a string',
      ]);
    });
  });

  test('should reject the login with 400 when the code is sent as a number', async ({ request }) => {
    const response = await test.step('POST /users/login with otp as a JSON number', () =>
      request.post(`${env.apiUrl}/users/login`, {
        data: { phoneNumber: requireCustomer().phone, otp: 1234 },
      }));

    await test.step('Responds 400 "otp must be a string"', async () => {
      expect(response.status()).toBe(400);
      expect(((await response.json()) as ApiError).message).toEqual(['otp must be a string']);
    });
  });
});

test.describe('Current user API', { tag: '@auth' }, () => {
  test('should return the profile of the signed-in customer', async ({ customerApi }) => {
    const response = await test.step('GET /users/me with the customer token', () => customerApi.users.me());

    await test.step('Responds 200 with the customer profile and no secrets', async () => {
      expect(response.status()).toBe(200);
      const user = await response.json();
      expect(user).toEqual(expect.objectContaining({ ...userShape, phoneNumber: requireCustomer().phone }));
      expect(user).not.toHaveProperty('otp');
      expect(user).not.toHaveProperty('token');
      expect(user).not.toHaveProperty('password');
    });
  });

  test('should respond 401 "Authentication token is required" when there is no token', async ({ api }) => {
    const response = await test.step('GET /users/me without a token', () => api.users.me());

    await test.step('Responds 401', async () => {
      expect(response.status()).toBe(401);
      expect(await response.json()).toEqual({
        message: 'Authentication token is required',
        error: 'Unauthorized',
        statusCode: 401,
      });
    });
  });

  test('should respond 401 "Invalid or expired token" when the token is not valid', async ({ request }) => {
    const response = await test.step('GET /users/me with a made-up token', () =>
      request.get(`${env.apiUrl}/users/me`, { headers: { Authorization: 'Bearer abc.def.ghi' } }));

    await test.step('Responds 401', async () => {
      expect(response.status()).toBe(401);
      expect(((await response.json()) as ApiError).message).toBe('Invalid or expired token');
    });
  });

  test('should respond 401 when the token is sent with the wrong scheme', async ({
    request,
    customerToken,
  }) => {
    const response = await test.step('GET /users/me with "Basic <token>" instead of "Bearer <token>"', () =>
      request.get(`${env.apiUrl}/users/me`, { headers: { Authorization: `Basic ${customerToken}` } }));

    await test.step('Responds 401', async () => {
      expect(response.status()).toBe(401);
      expect(((await response.json()) as ApiError).message).toBe('Authentication token is required');
    });
  });
});

test.describe('Permissions', { tag: ['@auth', '@permissions'] }, () => {
  const customerOnly = ['/cart', '/orders?page=1&limit=1', '/wishlist', '/users/addresses', '/coupons'];

  for (const path of customerOnly) {
    test(`should respond 401 when a guest calls GET ${path}`, async ({ request }) => {
      const response = await test.step(`GET ${path} without a token`, () =>
        request.get(`${env.apiUrl}${path}`));

      await test.step('Responds 401 "Authentication token is required"', async () => {
        expect(response.status()).toBe(401);
        expect(((await response.json()) as ApiError).message).toBe('Authentication token is required');
      });
    });
  }

  const staffOnly = ['/admin/products', '/admin/users', '/admin/orders', '/suppliers', '/stock/suppliers'];

  for (const path of staffOnly) {
    test(`should respond 403 when a customer calls the staff endpoint GET ${path}`, async ({
      request,
      customerToken,
    }) => {
      const response = await test.step(`GET ${path} with the customer token`, () =>
        request.get(`${env.apiUrl}${path}`, { headers: { Authorization: `Bearer ${customerToken}` } }));

      await test.step('Responds 403 "Forbidden resource"', async () => {
        expect(response.status()).toBe(403);
        expect(await response.json()).toEqual({
          message: 'Forbidden resource',
          error: 'Forbidden',
          statusCode: 403,
        });
      });
    });

    test(`should respond 401 when a guest calls the staff endpoint GET ${path}`, async ({ request }) => {
      const response = await test.step(`GET ${path} without a token`, () =>
        request.get(`${env.apiUrl}${path}`));

      await test.step('Responds 401', async () => {
        expect(response.status()).toBe(401);
      });
    });
  }
});
