import createHttpError from 'http-errors';
import z from 'zod';
import type { Authenticator, Authorizer } from '../core/index.ts';
import { allOf, anyOf, createHandlerFactory } from '../core/index.ts';
import { UserRepository } from '../features/users/users.repository.ts';
import { JwtUtils } from '../utils/jwt.util.ts';

export type JwtAuthContext = {
    email: string;
};

export const JwtAuthSchema = z.object({
    email: z.string().email(),
});

export const authenticateJwt: Authenticator<JwtAuthContext> = async (req) => {
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
    } catch (_e) {
        throw createHttpError.Unauthorized('Invalid or expired token');
    }

    const existingUser = await UserRepository.getUser(payload.email);
    return existingUser;
};

export const hasRegisteredUser: Authorizer<JwtAuthContext> = async ({ auth }) => {
    const existingUser = await UserRepository.getUser(auth.email);
    return Boolean(existingUser);
};

export const isLibraryStaff: Authorizer<JwtAuthContext> = ({ auth }) =>
    auth.email.endsWith('@library.local');

export const hasWriteAccessHeader: Authorizer<JwtAuthContext> = ({ req }) =>
    req.headers['x-write-access'] === 'enabled';

export const editsOwnAuthorName: Authorizer<JwtAuthContext> = ({ req, auth }) => {
    const authorValue =
        req.body && typeof req.body === 'object'
            ? (req.body as { author?: unknown }).author
            : undefined;

    if (typeof authorValue !== 'string') {
        return false;
    }

    const normalizedAuthor = authorValue.trim().toLowerCase();
    const emailHandle = auth.email.split('@')[0]?.replace(/[._-]/g, ' ').toLowerCase() ?? '';
    return normalizedAuthor === emailHandle;
};

export const isSystemReservedBook: Authorizer<JwtAuthContext> = ({ req }) => {
    const isbn =
        req.params && typeof req.params === 'object'
            ? (req.params as { isbn?: string }).isbn
            : undefined;
    return Boolean(isbn?.startsWith('SYS-'));
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
    errors: {
        unauthenticated: () => new createHttpError.Unauthorized('Authentication required'),
        unauthorized: () =>
            new createHttpError.Forbidden('Authorization policy denied this operation'),
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
    errors: {
        unauthenticated: () => new createHttpError.Unauthorized('Authentication required'),
        unauthorized: () =>
            new createHttpError.Forbidden('Authorization policy denied this operation'),
    },
});
