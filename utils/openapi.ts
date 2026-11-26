import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import type { APIRequestContext } from '@playwright/test';

/**
 * Checks API responses against the backend's own OpenAPI 3.0 spec (GET /v1/api-json).
 *
 * The spec is fetched at run time, so the check follows the backend: when the spec changes, so does
 * what is expected. OpenAPI 3.0 schemas are not plain JSON Schema (`nullable`, `example`), so they are
 * converted first.
 */

type Json = Record<string, unknown>;

export interface OpenApiSpec {
  openapi: string;
  paths: Record<
    string,
    Record<
      string,
      { responses?: Record<string, { content?: Record<string, { schema?: Json }> }>; security?: unknown[] }
    >
  >;
  components?: { schemas?: Record<string, Json> };
}

export async function fetchSpec(request: APIRequestContext, apiBaseUrl: string): Promise<OpenApiSpec> {
  const response = await request.get(`${apiBaseUrl.replace(/\/$/, '')}/api-json`);
  if (!response.ok()) throw new Error(`GET /api-json answered ${response.status()}`);
  return (await response.json()) as OpenApiSpec;
}

/** OpenAPI 3.0 → JSON Schema: `nullable: true` becomes "or null"; `#/components/schemas/X` → `spec#/definitions/X`. */
function toJsonSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toJsonSchema);
  if (!node || typeof node !== 'object') return node;
  const out: Json = {};
  for (const [key, value] of Object.entries(node as Json)) {
    if (key === 'example' || key === 'examples' || key === 'nullable') continue;
    if (key === '$ref' && typeof value === 'string')
      out.$ref = value.replace('#/components/schemas/', 'spec#/definitions/');
    else out[key] = toJsonSchema(value);
  }
  if ((node as Json).nullable === true) return { anyOf: [{ type: 'null' }, out] };
  return out;
}

export class ContractChecker {
  private readonly ajv: Ajv;
  private readonly cache = new Map<string, ValidateFunction>();

  constructor(readonly spec: OpenApiSpec) {
    this.ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.ajv);
    this.ajv.addSchema({ $id: 'spec', definitions: toJsonSchema(spec.components?.schemas ?? {}) as Json });
  }

  /** The documented operation, e.g. ('get', '/v1/products/{id}'), or undefined. */
  operation(method: string, path: string) {
    return this.spec.paths[path]?.[method.toLowerCase()];
  }

  /** Response codes the spec documents for an operation. */
  documentedStatuses(method: string, path: string): string[] {
    return Object.keys(this.operation(method, path)?.responses ?? {});
  }

  /**
   * Problems with a response body, one line each ("/items/0/price must be number"), or [] when it matches.
   * Throws when the spec has no JSON schema for this operation and status.
   */
  check(method: string, path: string, status: number, body: unknown): string[] {
    const key = `${method.toUpperCase()} ${path} ${status}`;
    let validate = this.cache.get(key);
    if (!validate) {
      const schema = this.operation(method, path)?.responses?.[String(status)]?.content?.['application/json']
        ?.schema;
      if (!schema) throw new Error(`The spec has no JSON response schema for ${key}`);
      validate = this.ajv.compile(toJsonSchema(schema) as Json);
      this.cache.set(key, validate);
    }
    return validate(body) ? [] : describe(validate.errors ?? []);
  }

  /** Paths the spec documents, as written there ("/v1/products/{id}"). */
  get paths(): string[] {
    return Object.keys(this.spec.paths);
  }
}

/** One readable line per problem; the same problem on every list item is reported once ("/items/* ..."). */
function describe(errors: ErrorObject[]): string[] {
  const lines = errors
    .filter((e) => e.keyword !== 'anyOf' && e.keyword !== 'allOf')
    .map((e) => {
      const where = (e.instancePath || '/').replace(/\/\d+(?=\/|$)/g, '/*');
      const detail =
        e.keyword === 'required'
          ? `is missing "${(e.params as { missingProperty: string }).missingProperty}"`
          : e.keyword === 'type' && e.message === 'must be null'
            ? null
            : e.message;
      return detail ? `${where} ${detail}` : null;
    })
    .filter((line): line is string => line !== null);
  return [...new Set(lines)];
}
