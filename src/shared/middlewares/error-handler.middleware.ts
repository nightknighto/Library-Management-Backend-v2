import type { Request, Response, NextFunction } from "express";
import createHttpError from "http-errors";
import { ZodError } from "zod";

type ErrorResponse = {
    success: false;
    error: {
        code: string;
        status: number;
        message: string;
        details?: any;
    }
}

export function globalErrorHandler(err: any, req: Request, res: Response<ErrorResponse>, next: NextFunction) {
    try {
        let statusCode = 500;
        let code = 'INTERNAL_SERVER_ERROR';
        let message = 'An unexpected error occurred';
        let details: any = null;


        // Handle Zod validation errors (e.g., response validation failures)
        if (err instanceof ZodError) {
            if ((err as any).isOutputValidationError) {
                // Output validation error - internal problem
                console.error('Zod Validation Error:', err.flatten());
            } else {
                console.log(err.toString());
                // Input validation error - client problem
                statusCode = 400;
                code = 'VALIDATION_ERROR';
                message = 'Invalid request data';
                details = err.flatten();
            }
        }

        else if (createHttpError.isHttpError(err)) {
            statusCode = err.statusCode;
            code = err.name;
            message = err.message;
        }

        else {
            console.error('Error:', err.message || err);
        }

        res.status(500).json({
            success: false,
            error: {
                code,
                status: statusCode,
                message,
                ...(details && { details })
            }
        });
    } catch (handlerError) {
        console.error('Error in globalErrorHandler:', handlerError);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                status: 500,
                message: 'An unexpected error occurred'
            }
        });
    }
}