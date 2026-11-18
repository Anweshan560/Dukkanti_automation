import type { APIRequestContext, APIResponse } from '@playwright/test';
import { env } from '../config/env';

export type Query = Record<string, string | number | boolean | undefined>;

/** The error body the API returns. Validation errors put a list in `message`. */
export interface ApiError {
  message: string | string[];
  error?: string;
  statusCode: number;
}

/**
 * Shared base for every API client. One client per resource extends this.
 *
 * Methods return the raw `APIResponse` so tests can assert on status codes, including error ones.
 * Use `json()` when the test only needs the body of a successful call.
 */
export abstract class ResourceApi {
  constructor(
    protected readonly request: APIRequestContext,
    /** Bearer token. Leave undefined to call the API as a guest. */
    protected readonly token?: string,
  ) {}

  /** Path of the resource under the API root, e.g. `/products`. */
  protected abstract readonly resource: string;

  protected url(path = ''): string {
    return `${env.apiUrl}${this.resource}${path}`;
  }

  private headers(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  private static params(query?: Query): Record<string, string | number | boolean> | undefined {
    if (!query) return undefined;
    const defined = Object.entries(query).filter(([, value]) => value !== undefined);
    return Object.fromEntries(defined) as Record<string, string | number | boolean>;
  }

  protected get(path = '', query?: Query): Promise<APIResponse> {
    return this.request.get(this.url(path), { headers: this.headers(), params: ResourceApi.params(query) });
  }

  protected post(path = '', data?: unknown): Promise<APIResponse> {
    return this.request.post(this.url(path), { headers: this.headers(), data });
  }

  protected patch(path = '', data?: unknown): Promise<APIResponse> {
    return this.request.patch(this.url(path), { headers: this.headers(), data });
  }

  protected put(path = '', data?: unknown): Promise<APIResponse> {
    return this.request.put(this.url(path), { headers: this.headers(), data });
  }

  protected delete(path = ''): Promise<APIResponse> {
    return this.request.delete(this.url(path), { headers: this.headers() });
  }

  /**
   * Sends any request under this resource with any body, for negative tests that need values the typed
   * methods do not allow (wrong types, missing fields, extra fields).
   */
  raw(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path = '', data?: unknown): Promise<APIResponse> {
    return this.request.fetch(this.url(path), { method, headers: this.headers(), data });
  }
}

/** The API's error message as one string, whether it sent a string or a list of validation messages. */
export async function errorMessage(response: APIResponse): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as Partial<ApiError>;
  return Array.isArray(body.message) ? body.message.join(' | ') : String(body.message ?? '');
}

/** Parses a successful response, or throws an error that names the call and shows the API's message. */
export async function json<T>(response: APIResponse | Promise<APIResponse>): Promise<T> {
  const resolved = await response;
  if (!resolved.ok()) {
    const body = await resolved.text().catch(() => '');
    throw new Error(`API call failed: ${resolved.status()} ${resolved.url()} ${body.slice(0, 300)}`);
  }
  return (await resolved.json()) as T;
}
