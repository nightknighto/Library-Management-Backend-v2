import createHttpError from 'http-errors';
import z from 'zod';
import type { Authorizer } from '../core/index.ts';
import { allOf, anyOf, createAuthenticator, createHandlerFactory } from '../core/index.ts';
import { UserRepository } from '../features/users/users.repository.ts';
import { JwtUtils } from '../utils/jwt.util.ts';

export type JwtAuthContext = {
    email: string;
};

export const JwtAuthSchema = z.object({
    email: z.string().email(),
});

export const authenticateJwt = createAuthenticator<JwtAuthContext>(
    async (req) => {
        const authorizationHeader = req.headers.authorization;
        if (!authorizationHeader?.startsWith('Bearer ')) {
            return null;
        }

        const token = authorizationHeader.split(' ')[1];
        if (!token) {
            return null;
        }

        let payload: ReturnType<typeof JwtUtils.verifyToken>;
        try {
            payload = JwtUtils.verifyToken(token);
        } catch {
            throw createHttpError.Unauthorized('Invalid or expired token');
        }

        const existingUser = await UserRepository.getUser(payload.email);
        return existingUser;
    },
    { onMissingCredentials: () => new createHttpError.Unauthorized('Authentication required') },
);

export const hasRegisteredUser: Authorizer<JwtAuthContext> = async ({ auth }) => {
    const existingUser = await UserRepository.getUser(auth.email);
    if (!existingUser) {
        throw new createHttpError.Forbidden('Registered user only');
    }
    return true;
};

export const isLibraryStaff: Authorizer<JwtAuthContext> = async ({ auth }) => {
    if (!auth.email.endsWith('@library.local')) {
        throw new createHttpError.Forbidden('Library staff only');
    }
    return true;
};

export const hasWriteAccessHeader: Authorizer<JwtAuthContext> = async ({ req }) => {
    if (req.headers['x-write-access'] !== 'enabled') {
        throw new createHttpError.Forbidden('Write access header required');
    }
    return true;
};

export const editsOwnAuthorName: Authorizer<JwtAuthContext> = async ({ req, auth }) => {
    const authorValue =
        req.body && typeof req.body === 'object'
            ? (req.body as { author?: unknown }).author
            : undefined;

    if (typeof authorValue !== 'string') {
        throw new createHttpError.Forbidden('Author must match your account name');
    }

    const normalizedAuthor = authorValue.trim().toLowerCase();
    const emailHandle = auth.email.split('@')[0]?.replace(/[._-]/g, ' ').toLowerCase() ?? '';
    if (normalizedAuthor !== emailHandle) {
        throw new createHttpError.Forbidden('Author must match your account name');
    }
    return true;
};

export const isSystemReservedBook: Authorizer<JwtAuthContext> = async ({ req }) => {
    const isbn =
        req.params && typeof req.params === 'object'
            ? (req.params as { isbn?: string }).isbn
            : undefined;
    if (!isbn?.startsWith('SYS-')) {
        throw new createHttpError.Forbidden('Not a system-reserved book');
    }
    return true;
};

/**
 * Reusable composite authorization policy for editing books.
 *
 * This is the canonical case where `allOf` is still essential: AND-combining
 * policies INSIDE an `anyOf` branch. A handler's `authorize` bucket array can
 * only express top-level AND; it cannot express "(A and B) or C". For that you
 * need `allOf` to produce a single authorizer that becomes one branch of the
 * `anyOf`.
 *
 * Semantics: staff may edit any book; everyone else may edit only if they are a
 * registered user AND the payload `author` matches their email handle.
 *
 * Exported as a single `Authorizer` value so it can be reused across handlers
 * and passed directly to other combinators (`anyOf`/`not`) — something a bare
 * policy array cannot do.
 *
 * @example
 * createHandler(contract, {
 *   access: 'protected',
 *   security: {
 *     authorize: { beforeValidation: [canEditBook] },
 *   },
 * }, handler);
 */
export const canEditBook: Authorizer<JwtAuthContext> = anyOf<JwtAuthContext>([
    isLibraryStaff,
    allOf<JwtAuthContext>([hasRegisteredUser, editsOwnAuthorName]),
]);

export const createJwtAuthHandler = createHandlerFactory<JwtAuthContext>({
    access: 'protected',
    security: {
        authenticate: authenticateJwt,
        authSchema: JwtAuthSchema,
    },
});

export const createJwtAuthHandler2 = createHandlerFactory({
    access: 'protected',
    security: {
        authenticate: (req) => ({ email: 'a@library.local' }),
        authSchema: z.object({
            email: z.string().email(),
        }),
    },
});
