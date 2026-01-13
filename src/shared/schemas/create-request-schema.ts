import z from "zod";

// ============================================================================
// TYPES
// ============================================================================

/**
 * The shape of fields that can be passed to createRequestSchema.
 * Each field (body, query, params) is a record of Zod schemas.
 * 
 * Example: { body: { name: z.string(), age: z.number() } }
 */
type RequestSchemaInput = {
    body?: Record<string, z.ZodTypeAny>;
    query?: Record<string, z.ZodTypeAny>;
    params?: Record<string, z.ZodTypeAny>;
}

/**
 * Converts the input shape to the actual Zod schema types.
 * - If a field is provided, it becomes a ZodObject with those fields
 * - If a field is omitted, it becomes an empty ZodObject (matching Express's default {})
 */
type RequestSchemaOutput<T extends RequestSchemaInput> = {
    body: T['body'] extends Record<string, z.ZodTypeAny>
    ? z.ZodObject<T['body']>
    : z.ZodObject<Record<string, never>>;
    query: T['query'] extends Record<string, z.ZodTypeAny>
    ? z.ZodObject<T['query']>
    : z.ZodObject<Record<string, never>>;
    params: T['params'] extends Record<string, z.ZodTypeAny>
    ? z.ZodObject<T['params']>
    : z.ZodObject<Record<string, never>>;
}

/**
 * Type used by the validation middleware to accept any request schema.
 */
export type RequestSchema = z.ZodObject<{
    body: z.ZodTypeAny;
    query: z.ZodTypeAny;
    params: z.ZodTypeAny;
}>;

// ============================================================================
// SCHEMA FACTORY
// ============================================================================

/** 
 * Schema for fields not defined in the request schema.
 * Accepts undefined or any object, transforms to empty object.
 * This handles cases like GET requests where req.body may be undefined.
 */
const emptySchema = z.union([
    z.undefined(),
    z.record(z.unknown())
]).transform(() => ({}));

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
 * export const CreateBookSchema = createRequestSchema({
 *   body: {
 *     title: z.string(),
 *     author: z.string(),
 *   }
 * });
 * 
 * export const GetBookSchema = createRequestSchema({
 *   params: { id: z.string().uuid() },
 *   query: { includeDetails: z.coerce.boolean().default(false) },
 * });
 */
export function createRequestSchema<
    // This constraint does two things:
    // 1. T extends RequestSchemaInput - must have body/query/params structure
    // 2. Record<Exclude<keyof T, keyof RequestSchemaInput>, never> - disallows extra keys
    T extends RequestSchemaInput & Record<Exclude<keyof T, keyof RequestSchemaInput>, never>
>(shape: T) {
    const schema = z.object({
        body: shape.body ? z.object(shape.body).strict() : emptySchema,
        query: shape.query ? z.object(shape.query) : emptySchema,
        params: shape.params ? z.object(shape.params) : emptySchema,
    });

    // Type assertion needed because TypeScript can't infer conditional types at runtime.
    // We know the structure is correct based on our implementation above.
    return schema as z.ZodObject<RequestSchemaOutput<T>>;
}