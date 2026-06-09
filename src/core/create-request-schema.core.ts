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
 *
 * `body` and `params` accept either a plain object of Zod schemas or a full
 * `z.ZodType` whose output is a plain object (e.g. `z.object()`,
 * `z.discriminatedUnion()`, `z.union()` of objects, or refined/transformed
 * object schemas). Schemas that produce non-object types (e.g. `z.string()`,
 * `z.number()`) are rejected at compile time.
 *
 * `query` only accepts a plain object of Zod schemas because pagination
 * merging operates on the plain shape at the type level.
 *
 * @example
 * const schemaInput: RequestSchemaInput = {
 *   body: { name: z.string(), age: z.number() },
 *   query: { page: z.coerce.number().optional() },
 * };
 *
 * @example
 * const schemaInputWithZodObject: RequestSchemaInput = {
 *   body: z.object({ name: z.string(), age: z.number() }),
 *   params: z.object({ id: z.string().uuid() }),
 *   query: { include: z.coerce.boolean().default(false) },
 * };
 *
 * @example
 * const schemaInputWithDiscriminatedUnion: RequestSchemaInput = {
 *   body: z.discriminatedUnion('type', [
 *     z.object({ type: z.literal('book'), title: z.string() }),
 *     z.object({ type: z.literal('magazine'), issue: z.number() }),
 *   ]),
 *   query: { page: z.coerce.number().default(1) },
 * };
 */
export type RequestSchemaInput = {
    /**
     * Request body schema for JSON payloads.
     *
     * Accepts either a plain object of Zod schemas (wrapped in strict mode at
     * runtime, rejecting unknown keys) or a full `z.ZodType` whose inferred
     * output is a plain object (used as-is, preserving your chosen mode).
     *
     * When a plain object is provided, `createRequestSchema` wraps it with
     * `z.strictObject()` at runtime. When a Zod schema is provided (e.g.
     * `z.object()`, `z.strictObject()`, `z.discriminatedUnion()`, a
     * `.refine()` or `.transform()` chain), it is used directly so you control
     * the validation mode.
     *
     * Primitives like `z.string()` or `z.number()` are rejected at compile
     * time because their output is not a plain object.
     *
     * @example
     * body: { name: z.string(), email: z.string().email() }
     *
     * @example
     * body: z.object({ name: z.string(), email: z.string().email() })
     *
     * @example
     * body: z.discriminatedUnion('type', [
     *   z.object({ type: z.literal('a'), value: z.string() }),
     *   z.object({ type: z.literal('b'), count: z.number() }),
     * ])
     *
     * @example
     * body: z.object({ password: z.string(), confirm: z.string() })
     *   .refine(data => data.password === data.confirm)
     */
    body?: Record<string, z.ZodType> | z.ZodType<Record<string, any>>;
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
     * Accepts either a plain object of Zod schemas (wrapped in strip mode at
     * runtime, unknown keys removed) or a full `z.ZodType` whose inferred
     * output is a plain object (used as-is, preserving your chosen mode).
     *
     * Primitives like `z.string()` or `z.number()` are rejected at compile
     * time because their output is not a plain object.
     *
     * @example
     * params: { id: z.string().uuid() }
     *
     * @example
     * params: z.object({ id: z.string().uuid(), slug: z.string() })
     */
    params?: Record<string, z.ZodType> | z.ZodType<Record<string, any>>;
};

/**
 * Converts the input shape to the actual Zod schema types.
 *
 * - When a field is a plain `Record<string, z.ZodType>`, it becomes a
 *   `z.ZodObject` wrapping that shape (strict for body, strip for
 *   query/params).
 * - When a field is a `z.ZodType` (e.g. `z.object()`,
 *   `z.discriminatedUnion()`), it is passed through directly, preserving
 *   the schema's own type and mode.
 * - If a field is omitted, it becomes an empty `z.ZodObject` (matching
 *   Express's default `{}`).
 *
 * @example
 * type Output = RequestSchemaOutput<{ body: { name: z.ZodString } }>;
 * // Output['body'] is z.ZodObject<{ name: z.ZodString }>
 *
 * @example
 * type OutputWithZodObject = RequestSchemaOutput<{
 *   body: z.ZodObject<{ name: z.ZodString }>;
 * }>;
 * // OutputWithZodObject['body'] is z.ZodObject<{ name: z.ZodString }> (passed through)
 */
export type RequestSchemaOutput<T extends RequestSchemaInput> = {
    /**
     * Zod schema for body.
     *
     * When a plain object is provided, this is `z.ZodObject` (strict mode).
     * When a Zod schema is provided (e.g. `z.object()`,
     * `z.discriminatedUnion()`), the schema is passed through directly.
     */
    body: T['body'] extends z.ZodType<Record<string, any>>
    ? T['body']
    : T['body'] extends Record<string, z.ZodType>
    ? z.ZodObject<T['body']>
    : z.ZodObject<Record<string, never>>;
    /**
     * Zod object schema for query (unknown keys stripped).
     */
    query: T['query'] extends Record<string, z.ZodType>
    ? z.ZodObject<T['query']>
    : z.ZodObject<Record<string, never>>;
    /**
     * Zod schema for params.
     *
     * When a plain object is provided, this is `z.ZodObject` (strip mode).
     * When a Zod schema is provided, the schema is passed through directly.
     */
    params: T['params'] extends z.ZodType<Record<string, any>>
    ? T['params']
    : T['params'] extends Record<string, z.ZodType>
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
 * - `body`: When a plain object is provided, uses strict mode (rejects unknown
 *   properties). When a Zod schema is provided (e.g. `z.object()`,
 *   `z.discriminatedUnion()`, `.refine()`, `.transform()`), the schema is used
 *   as-is so you control the validation mode.
 * - `query`: Strips unknown properties (lenient for framework-added params).
 *   Only accepts plain objects because pagination merging needs the raw shape.
 * - `params`: When a plain object is provided, strips unknown properties. When
 *   a Zod schema is provided, it is used as-is.
 * - Omitted fields default to empty object `{}` (matching Express convention)
 *
 * **Type Safety:**
 * - Only allows `body`, `query`, `params` keys (typos like `boby` cause compile error)
 * - `body` and `params` reject schemas producing non-object types (`z.string()`,
 *   `z.number()`, etc.) at compile time
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
 * export const CreateBookRequestSchema = createRequestSchema({
 *   body: z.object({
 *     title: z.string(),
 *     author: z.string(),
 *   }),
 * });
 *
 * @example
 * export const GetBookRequestSchema = createRequestSchema({
 *   params: z.object({ id: z.string().uuid() }),
 *   query: { includeDetails: z.coerce.boolean().default(false) },
 * });
 *
 * @example
 * export const BatchCreateSchema = createRequestSchema({
 *   body: z.discriminatedUnion('type', [
 *     z.object({ type: z.literal('book'), title: z.string() }),
 *     z.object({ type: z.literal('magazine'), issue: z.number() }),
 *   ]),
 * });
 */
function isZodSchema(value: unknown): value is z.ZodType {
    return value instanceof z.ZodType;
}

function isPlainRecord(value: unknown): value is Record<string, z.ZodType> {
    return (
        typeof value === 'object' &&
        value !== null &&
        !isZodSchema(value)
    );
}

export function createRequestSchema<
    T extends RequestSchemaInput & Record<Exclude<keyof T, keyof RequestSchemaInput>, never>,
>(shape: T) {
    const schema = z.object({
        body: isZodSchema(shape.body)
            ? shape.body
            : isPlainRecord(shape.body)
              ? z.strictObject(shape.body)
              : emptySchema,
        query: isPlainRecord(shape.query) ? z.object(shape.query) : emptySchema,
        params: isZodSchema(shape.params)
            ? shape.params
            : isPlainRecord(shape.params)
              ? z.object(shape.params)
              : emptySchema,
    });

    return schema as z.ZodObject<RequestSchemaOutput<T>>;
}
