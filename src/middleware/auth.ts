import type { Request, Response, NextFunction } from 'express';
import { JwtService } from '../services/index.ts';

// Extend Express Request type to include user
declare global {
    namespace Express {
        interface Request {
            user?: {
                email: string;
            };
        }
    }
}

/**
 * Express middleware for JWT token authentication.
 * 
 * Validates the Authorization header for a Bearer token, verifies the JWT token,
 * and attaches the authenticated user information to the request object.
 * 
 * @throws {401} When no token is provided, token format is invalid, or token verification fails
 * @throws {404} When the authenticated user's email is not found in the token
 * @throws {500} When an unexpected authentication error occurs
 * 
 * @example
 * ```typescript
 * app.get('/protected', authenticate, (req, res) => {
 *   // req.user.email is available here
 *   res.json({ message: 'Protected route accessed' });
 * });
 * ```
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;

        // If no auth header and auth is optional, continue
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided or bad token format' });
        }

        const token = authHeader.split(' ')[1];

        try {
            const user = JwtService.verifyToken(token!);

            if (!user.email) {
                return res.status(401).json({ error: 'Invalid token' });
            }

            // Add user to request object
            req.user = {
                email: user.email,
            };

            next();
        } catch (error) {
            return res.status(401).json({ error: 'Invalid token' });
        }
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
};
