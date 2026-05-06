/**
 * @file sanitize-response.core.ts
 *
 * Validates and sanitizes response payloads against Zod schemas.
 */

import type z from "zod";

/**
 * Validates and sanitizes response data against a Zod schema.
 *
 * @param schema - The Zod schema to validate against
 * @param data - The data to sanitize
 * @returns Validated and parsed data
 */
export function sanitizeResponse<S extends z.ZodTypeAny, D extends z.input<S>>(
    schema: S,
    data: D,
): z.output<S> {
    return schema.parse(data);
}
