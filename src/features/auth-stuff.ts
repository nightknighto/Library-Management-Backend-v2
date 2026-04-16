import createHttpError from "http-errors";
import z from "zod";
import type { Authenticator, Authorizer } from "../core/types.core.ts";
import { JwtUtils } from "../utils/jwt.util.ts";
import { UserRepository } from "./users/users.repository.ts";
import { allOf, createHandlerFactory, not } from "../core/create-handler.core.ts";

export type JwtAuthContext = {
    email: string;
};

export const JwtAuthSchema = z.object({
    email: z.string().email(),
});

export const authenticateJwt: Authenticator<JwtAuthContext> = async (req) => {
    const authorizationHeader = req.headers.authorization;
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authorizationHeader.split(' ')[1];
    if (!token) {
        return null;
    }

    let payload: ReturnType<typeof JwtUtils.verifyToken>
    try {
        payload = JwtUtils.verifyToken(token);
    } catch (e) {
        throw createHttpError.Unauthorized('Invalid or expired token')
    }

    const existingUser = await UserRepository.getUser(payload.email);
    return existingUser
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
    const authorValue = req.body && typeof req.body === 'object'
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
    const isbn = req.params && typeof req.params === 'object'
        ? (req.params as { isbn?: string }).isbn
        : undefined;
    return Boolean(isbn?.startsWith('SYS-'));
};


// Example 3: allOf + not
// Delete allowed only for staff, and system-reserved books cannot be deleted.
export const deleteBookPolicy = allOf<JwtAuthContext>([
    hasRegisteredUser,
    isLibraryStaff,
    not<JwtAuthContext>(isSystemReservedBook),
]);


export const createJwtAuthHandler = createHandlerFactory<JwtAuthContext>({
    access: 'protected',
    security: {
        authenticate: authenticateJwt,
        authSchema: JwtAuthSchema,
    },
    errors: {
        unauthorized: () => new createHttpError.Unauthorized('Authentication required'),
        forbidden: () => new createHttpError.Forbidden('Authorization policy denied this operation'),
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
        unauthorized: () => new createHttpError.Unauthorized('Authentication required'),
        forbidden: () => new createHttpError.Forbidden('Authorization policy denied this operation'),
    },
});
