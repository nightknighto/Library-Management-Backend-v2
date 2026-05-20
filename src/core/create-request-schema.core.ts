/**
 * @file create-request-schema.core.ts
 *
 * Builds a unified Zod request schema for body/query/params and exports
 * related types for contract and middleware usage.
 */

import z from 'zod';

// ============================================================================
// TYPES
// ============================================================================

/**
 * The shape of fields that can be passed to createRequestSchema.
 * Each field (body, query, params) is a record of Zod schemas.
 *
 * @example
 * const schemaInput: RequestSchemaInput = {
 *   body: { name: z.string(), age: z.number() },
 *   query: { page: z.coerce.number().optional() },
 * };
 */
export type RequestSchemaInput = {
    /**
     * Request body schema for JSON payloads.
     *
     * When createRequestSchema builds the runtime schema, body validation is strict
     * (unknown keys cause validation errors).
     */
    body?: Record<string, z.ZodType>;
    /**
     * Query string schema for URL parameters.
     *
     * Query validation is lenient (unknown keys are stripped).
     * When used via createContract with pagination.request enabled, the framework
        * injects `page` and `limit` if they are missing; your own `page`/`limit`
        * definitions take precedence.
        *
        * Injected `page`/`limit` fields are numeric (via z.coerce.number()) with
        * defaults (page=1, limit=10) and maxLimit=100 unless overridden.
     */
    query?: Record<string, z.ZodType>;
    /**
     * Route params schema for dynamic path segments.
     *
     * Params validation is lenient (unknown keys are stripped).
     */
    params?: Record<string, z.ZodType>;
};

/**
 * Converts the input shape to the actual Zod schema types.
 * - If a field is provided, it becomes a ZodObject with those fields
 * - If a field is omitted, it becomes an empty ZodObject (matching Express's default {})
 *
 * @example
 * type Output = RequestSchemaOutput<{ body: { name: z.ZodString } }>;
 */
export type RequestSchemaOutput<T extends RequestSchemaInput> = {
    /**
     * Zod object schema for body (strict mode).
     */
    body: T['body'] extends Record<string, z.ZodType>
    ? z.ZodObject<T['body']>
    : z.ZodObject<Record<string, never>>;
    /**
     * Zod object schema for query (unknown keys stripped).
     */
    query: T['query'] extends Record<string, z.ZodType>
    ? z.ZodObject<T['query']>
    : z.ZodObject<Record<string, never>>;
    /**
     * Zod object schema for params (unknown keys stripped).
     */
    params: T['params'] extends Record<string, z.ZodType>
    ? z.ZodObject<T['params']>
    : z.ZodObject<Record<string, never>>;
};

/**
 * Type used by the validation middleware to accept any request schema.
 *
 * @example
 * function validate(schema: RequestSchema) {
 *   return schema.parse({ body: {}, query: {}, params: {} });
 * }
 */
export type RequestSchema = z.ZodObject<{
    body: z.ZodType<any>;
    query: z.ZodType<any>;
    params: z.ZodType<any>;
}>;

// ============================================================================
// SCHEMA FACTORY
// ============================================================================

/**
 * Schema for fields not defined in the request schema.
 * Accepts undefined or any object, transforms to empty object.
 * This handles cases like GET requests where req.body may be undefined.
 */
const emptySchema = z
    .union([z.undefined(), z.record(z.string(), z.unknown())])
    .transform(() => ({}));

/**
 * Creates a unified request validation schema for Express routes.
 *
 * **Behavior:**
 * - `body`: Uses strict mode (rejects unknown properties with error)
 * - `query`: Strips unknown properties (lenient for framework-added params)
 * - `params`: Strips unknown properties
 * - Omitted fields default to empty object `{}` (matching Express convention)
 *
 * **Type Safety:**
 * - Only allows `body`, `query`, `params` keys (typos like `boby` cause compile error)
 * - Infers exact types for use with `ValidatedRequest<T>` in controllers
 *
 * @example
 * export const CreateBookRequestSchema = createRequestSchema({
 *   body: {
 *     title: z.string(),
 *     author: z.string(),
 *   }
 * });
 *
 * @example
 * export const GetBookRequestSchema = createRequestSchema({
 *   params: { id: z.string().uuid() },
 *   query: { includeDetails: z.coerce.boolean().default(false) },
 * });
 */
export function createRequestSchema<
    // This constraint does two things:
    // 1. T extends RequestSchemaInput - must have body/query/params structure
    // 2. Record<Exclude<keyof T, keyof RequestSchemaInput>, never> - disallows extra keys
    T extends RequestSchemaInput & Record<Exclude<keyof T, keyof RequestSchemaInput>, never>,
>(shape: T) {
    const schema = z.object({
        body: shape.body ? z.strictObject(shape.body) : emptySchema,
        query: shape.query ? z.object(shape.query) : emptySchema,
        params: shape.params ? z.object(shape.params) : emptySchema,
    });

    // Type assertion needed because TypeScript can't infer conditional types at runtime.
    // We know the structure is correct based on our implementation above.
    return schema as z.ZodObject<RequestSchemaOutput<T>>;
}
