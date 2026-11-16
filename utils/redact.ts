import { secretValues } from '../config/env';

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Removes secrets, bearer tokens, JWTs and card numbers from text before it is written anywhere. */
export function redact(text: string): string {
  let result = text;
  for (const secret of secretValues()) {
    result = result.replace(new RegExp(escapeRegExp(secret), 'g'), '[REDACTED]');
  }
  return result
    .replace(/Bearer\s+[\w.~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}\b/g, '[REDACTED_JWT]')
    .replace(/\b(?:\d[ -]?){13,19}\b/g, '[REDACTED_CARD]');
}

/** Strips terminal colour codes that Playwright puts in error messages. */
export const stripAnsi = (text: string): string => text.replace(/\u001b\[[0-9;]*m/g, '');
