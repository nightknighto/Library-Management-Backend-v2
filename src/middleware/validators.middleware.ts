import type { NextFunction, Request, Response } from 'express';
import { ZodError, type z } from 'zod';

/**
 * Namespace containing various validation middlewares for Express routes.
 */
export namespace Validators {
    function isZodError(error: any): error is ZodError {
        return error instanceof ZodError || error?.name === 'ZodError';
    }

    function validate(schema: z.ZodType, key: 'params' | 'query' | 'body') {
        return async (req: Request, res: Response, next: NextFunction) => {
            try {
                // Parse the request data using the schema. If the data is invalid, a ZodError will be thrown.
                // Also filters out any additional properties not defined in the schema.
                req[key] = schema.parse(req[key]);
                next();
            } catch (error) {
                if (isZodError(error)) {
                    const errorMessages = error.errors.map((issue: any) => ({
                        message: `${key}.${issue.path.join('.')} is ${issue.message}`,
                    }));

                    res.status(400).json({
                        error: `Invalid request data for ${key}: ${errorMessages.map(e => e.message).join(', ')}`,
                    });
                } else {
                    console.log('Error in validating request: ', error);
                    res.status(500).json({
                        error: 'Internal Server Error',
                    });
                }
            }
        };
    }

    /**
     * Middleware function to validate the request body against a given Zod schema.
     *
     * @param schema - The Zod schema to validate the request body against.
     * @returns A middleware function that validates the request body.
     *
     * @example
     * // Usage in an Express route
     * app.post('/route', validateBody(schema), (req, res) => {
     *  // Your route handler logic here
     * });
     *
     * @remarks
     * If the request body does not match the schema, the middleware will respond with a 400 Bad Request status
     * and a JSON error message containing details about the validation errors.
     *
     */
    export function validateBody(schema: z.ZodType) {
        return validate(schema, 'body');
    }

    /**
     * Middleware to validate that specified route parameters are numeric.
     *
     * @param params - An array of parameter names to validate.
     * @returns An Express middleware function that checks if the specified parameters are numeric.
     *
     * @example
     * // Usage in an Express route
     * app.get('/route/:id', validateNumericParams(['id']), (req, res) => {
     *   // Your route handler logic here
     * });
     *
     * @remarks
     * If any of the specified parameters are not numeric or are empty strings,
     * the middleware will respond with a 400 Bad Request status and a JSON error message.
     *
     */
    export function validateNumericParams(params: string[]) {
        return async (req: Request, res: Response, next: NextFunction) => {
            for (const param of params) {
                // Check if the parameter is not a number or is an empty string
                if (Number.isNaN(Number(req.params[param])) || req.params[param]?.trim() === '') {
                    res.status(400).json({
                        error: `${param} parameter must be a number`,
                    });
                    return;
                }
            }

            next();
        };
    }

    /**
     * Middleware to validate required query parameters in a request.
     *
     * @param params - An array of strings representing the required query parameters.
     * @returns An Express middleware function that checks if the specified query parameters are present.
     *
     * @example
     * // Usage in an Express route
     * app.get('/route', validateRequiredQueryParams(['param1', 'param2']), (req, res) => {
     *  // Your route handler logic here
     * });
     *
     * @remarks
     * If any of the specified parameters are not present in the query string,
     * the middleware will respond with a 400 Bad Request status and a JSON error message.
     */
    export function validateRequiredQuery(params: string[]) {
        return async (req: Request, res: Response, next: NextFunction) => {
            for (const param of params) {
                // Check if the parameter is not provided
                if (!req.query[param]) {
                    res.status(400).json({
                        error: `${param} query is required`,
                    });
                    return;
                }
            }

            next();
        };
    }

    export function validateParams(schema: z.ZodType) {
        return validate(schema, 'params');
    }

    export function validateQuery(schema: z.ZodType) {
        return validate(schema, 'query');
    }

    // export const validateFile = (req: Request, res: Response, next: NextFunction) => {
    //     if (!req.file) {
    //         res.status(400).json({ error: 'No file uploaded' });
    //         return;
    //     }
    //     if (!req.body.projectName) {
    //         res.status(400).json({ error: 'No ProjectName provided' });
    //         return;
    //     }
    //     next();
    // };
}
