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
        try {
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
        } catch (error) {
            if (isZodError(error)) {
                // Improved error handling for request validation errors.
                const errorMessages = error.errors.map((issue: any) => ({
                    message: `${issue.path.length ? issue.path.join('.') : '[root]'}: ${issue.message}`,
                    path: issue.path
                }));

                res.status(400).json({
                    error: "Invalid request data.",
                    details: errorMessages
                });
            } else {
                console.error('Error in validating request: ', error);
                res.status(500).json({
                    error: 'Internal Server Error',
                });
            }
        }
    };
}

/**
 * Type for a validated Express request.
 * Takes the inferred type from a request schema (e.g., z.infer<typeof GetBookRequestSchema>)
 * and maps it to Express's Request type.
 * 
 * @example
 * type GetBookRequest = z.infer<typeof GetBookRequestSchema>;
 * function handler(req: ValidatedRequest<GetBookRequest>, res: Response) { ... }
 */
export type ValidatedRequest<T> = Request<
    T extends { params: infer P } ? P : Record<string, string>,
    any,
    T extends { body: infer B } ? B : unknown,
    T extends { query: infer Q } ? Q : Record<string, unknown>
>;

