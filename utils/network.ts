import type { Page, Request, Response } from '@playwright/test';
import { env } from '../config/env';

export interface RecordedCall {
  method: string;
  /** Path relative to the API root, including the query string, e.g. `/products?limit=5`. */
  path: string;
  status: number;
}

const isApiUrl = (url: string): boolean => url.startsWith(env.apiUrl);
const apiPath = (url: string): string => url.slice(env.apiUrl.length);

const matches = (path: string, pattern: string | RegExp): boolean =>
  typeof pattern === 'string' ? path.split('?')[0] === pattern : pattern.test(path);

/**
 * Waits for the UI to call the API. Start it BEFORE the action that triggers the call:
 *
 *   const response = waitForApi(page, 'POST', '/cart/add');
 *   await productPage.addToCart();
 *   expect((await response).status()).toBe(200);
 */
export function waitForApi(
  page: Page,
  method: string,
  pathPattern: string | RegExp,
  timeout = 10_000,
): Promise<Response> {
  return page.waitForResponse(
    (response) => {
      const request: Request = response.request();
      return (
        isApiUrl(response.url()) &&
        request.method() === method.toUpperCase() &&
        matches(apiPath(response.url()), pathPattern)
      );
    },
    { timeout },
  );
}

/** Records every API call the page makes from now on. Call `stop()` to detach. */
export function recordApiCalls(page: Page): { calls: RecordedCall[]; stop: () => void } {
  const calls: RecordedCall[] = [];
  const listener = (response: Response): void => {
    if (!isApiUrl(response.url())) return;
    calls.push({
      method: response.request().method(),
      path: apiPath(response.url()),
      status: response.status(),
    });
  };
  page.on('response', listener);
  return { calls, stop: () => page.off('response', listener) };
}
