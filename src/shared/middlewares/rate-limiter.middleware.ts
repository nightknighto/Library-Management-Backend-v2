import rateLimit from 'express-rate-limit';

export const rateLimiter = rateLimit({
    windowMs: 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
});
