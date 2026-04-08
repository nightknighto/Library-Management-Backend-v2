import type { NextFunction, Request, Response } from 'express';
import { ZodError, type z } from 'zod';
import type { RequestSchema } from '../schemas/create-request-schema.ts';

function isZodError(error: any): error is ZodError {
    return error instanceof ZodError || error?.name === 'ZodError';
}

/**
 * Express middleware that validates and sanitizes the request using a Zod-based schema.
 *
 * The provided `schema` (typically built from `createRequestSchema`) is used to parse
 * the incoming request's `body`, `query`, and `params`. If validation passes, these
 * properties are overwritten on the request object with their validated equivalents,
 * thus removing any unknown fields and ensuring strong typing downstream.
 *
 * If validation fails, responds with a 400 and a detailed error array. If another
 * (non-validation) error occurs, responds with a 500.
 *
 * @param schema - A Zod-based schema describing the request shape.
 * @returns Express middleware for request validation.
 */
export function validateRequest(schema: RequestSchema) {
    return async (req: Request, res: Response, next: NextFunction) => {
        // Parse the request data using the schema. If the data is invalid, a ZodError will be thrown.
        // Also filters out any additional properties not defined in the schema.
        const validated = await schema.parseAsync({
            body: req.body,
            query: req.query,
            params: req.params,
        });

        req.body = validated.body;
        req.params = validated.params;
        req.query = validated.query;

        next();
    };
}

/**
 * Type for a validated Express request with strong typing.
 * 
 * Maps a validated request schema type to Express's `Request` type, automatically
 * extracting and typing the `params`, `body`, and `query` properties based on the
 * inferred schema type. If a property is not defined in the schema, it defaults to
 * a sensible fallback type.
 * 
 * @template T - The inferred type from a request schema (e.g., `z.infer<typeof GetBookRequestSchema>`).
 *               Should have `params?`, `body?`, and `query?` properties matching your schema.
 * 
 * @example
 * ```typescript
 * const GetBookRequestSchema = createRequestSchema({
 *   params: z.object({ id: z.string() }),
 *   query: z.object({ includeDetails: z.boolean().optional() }),
 * });
 * 
 * type GetBookRequest = z.infer<typeof GetBookRequestSchema>;
 * 
 * function getBook(req: ValidatedRequest<GetBookRequest>, res: Response) {
 *   // req.params.id is typed as string
 *   // req.query.includeDetails is typed as boolean | undefined
 * }
 * ```
 */
export type ValidatedRequest<T> = Request<
    T extends { params: infer P } ? P : Record<string, string>,
    any,
    T extends { body: infer B } ? B : unknown,
    T extends { query: infer Q } ? Q : Record<string, unknown>
>;

