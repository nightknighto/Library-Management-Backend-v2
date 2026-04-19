import rateLimit from 'express-rate-limit';
import type { ErrorResponse } from '../../core/types.core.ts';

export const rateLimiter = (windowMs: number, maxRequests: number) => rateLimit({
    windowMs,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: "Too many requests, please try again later."
    } satisfies ErrorResponse
});
