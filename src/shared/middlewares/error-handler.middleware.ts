import type { Request, Response, NextFunction } from "express";
import createHttpError from "http-errors";
import z, { ZodError } from "zod";

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

        if (createHttpError.isHttpError(err)) {
            statusCode = err.statusCode;
            code = err.name;
            message = err.message;
        } else {
            console.error('Error:', err.message || err);
        }

        res.status(statusCode).json({
            success: false,
            error: {
                code,
                message,
                ...(details && { details })
            }
        } satisfies ErrorResponse);
    } catch (handlerError) {
        console.error('Error in globalErrorHandler:', handlerError);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                status: 500,
                message: 'An unexpected error occurred'
            }
        } satisfies ErrorResponse);
    }
}