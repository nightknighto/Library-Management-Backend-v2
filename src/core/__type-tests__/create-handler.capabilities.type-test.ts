import type { Request } from 'express';
import createHttpError from 'http-errors';
import { z } from 'zod';
import {
    type AfterAuthorizationRequest,
    allOf,
    anyOf,
    createContract,
    createHandler,
    createHandlerFactory,
    not,
    type Authorizer,
} from '../index.ts';
import type { Equal, Expect, ExpectFalse, Extends, IsAny } from './type-test.utils.ts';

/**
 * HUMAN GUIDE - Capability lane
 *
 * Put tests here when:
 * - You are validating exactly one feature axis in isolation.
 * - Examples: request typing only, auth typing only, pagination rule only.
 *
 * Do not put tests here when:
 * - The test intentionally combines multiple axes (use the interaction lane file).
 * - The test encodes a historical bug that must never return (use the regression lane file).
 *
 * Fast decision rule:
 * - If the test title can be phrased as "feature X works by itself", this file is correct.
 *
 * This file is compile-only and validated by `pnpm check`.
 */
type AuthContext = {
    userId: string;
    role: 'staff' | 'member';
};

const AuthSchema = z.object({
    userId: z.string(),
    role: z.enum(['staff', 'member']),
});

const UpdateBookContract = createContract({
    request: {
        body: {
            title: z.string(),
            totalQuantity: z.number().int().min(1),
        },
        params: {
            isbn: z.string(),
        },
        query: {
            dryRun: z.coerce.boolean().default(false),
        },
    },
    response: z.object({
        updated: z.boolean(),
    }),
});

const ListBooksContract = createContract({
    request: {
        query: {
            page: z.coerce.number().default(1),
            limit: z.coerce.number().default(10),
        },
    },
    response: z.array(z.string()),
    pagination: { response: true },
});

createHandler(UpdateBookContract, async ({ req }) => {
    type _bodyNotAny = ExpectFalse<IsAny<typeof req.body>>;
    type _bodyExact = Expect<Equal<typeof req.body, { title: string; totalQuantity: number }>>;
    type _paramsExact = Expect<Equal<typeof req.params, { isbn: string }>>;
    type _queryExact = Expect<Equal<typeof req.query, { dryRun: boolean }>>;

    return { data: { updated: true } };
});

// @ts-expect-error handler data must satisfy the response schema
createHandler(UpdateBookContract, async ({ req }) => ({ data: { updated: 'no' } }));

createHandler(ListBooksContract, async ({ req }) => ({
    data: ['book-1'],
    pagination: {
        totalCount: 1,
        page: 1,
        limit: 10,
    },
}));

// @ts-expect-error response-paginated contracts require pagination in handler result
createHandler(ListBooksContract, async ({ req }) => ({ data: ['book-1'] }));

// @ts-expect-error contracts without response pagination do not accept pagination payload
createHandler(UpdateBookContract, async ({ req }) => ({
    data: { updated: true },
    pagination: {
        totalCount: 1,
        page: 1,
        limit: 10,
    },
}));

// @ts-expect-error handlers do not accept unknown top-level result keys
createHandler(UpdateBookContract, async ({ req }) => ({
    data: { updated: true },
    metax: { timestamp: '2026-01-01T00:00:00.000Z' },
}));

// @ts-expect-error response-paginated handlers do not accept unknown top-level result keys
createHandler(ListBooksContract, async ({ req }) => ({
    data: ['book-1'],
    pagination: {
        totalCount: 1,
        page: 1,
        limit: 10,
    },
    metax: { timestamp: '2026-01-01T00:00:00.000Z' },
}));

createHandler(UpdateBookContract, async ({ req }) => ({
    data: { updated: true },
    cookies: [
        {
            action: 'set',
            name: 'session',
            value: 'token',
            options: { httpOnly: true, sameSite: 'lax' },
        },
        {
            action: 'clear',
            name: 'legacy-session',
        },
    ],
}));

createHandler(
    UpdateBookContract,
    {
        access: 'protected',
        security: {
            authenticate: async () => ({ userId: 'u-1', role: 'staff' as const }),
            authSchema: AuthSchema,
        },
    },
    async ({ req, auth }) => {
        type _authExact = Expect<Extends<typeof auth, AuthContext>>;
        return { data: { updated: true } };
    },
);

createHandler(
    UpdateBookContract,
    {
        access: 'protected',
        security: {
            authenticate: async () => ({ userId: 'u-1', role: 'staff' as const }),
        },
    },
    async ({ req, auth }) => {
        type _authExact = Expect<Extends<typeof auth, AuthContext>>;
        return { data: { updated: true } };
    },
);

createHandler(
    UpdateBookContract,
    {
        access: 'protected',
        security: {
            authenticate: async () => ({ userId: 'u-1', role: 'staff' as const }),
        },
    },
    async ({ req, auth }) => {
        type _authNotAny = ExpectFalse<IsAny<typeof auth>>;
        type _authExact = Expect<Extends<typeof auth, AuthContext>>;
        return { data: { updated: true } };
    },
);

createHandler(
    UpdateBookContract,
    {
        access: 'optional',
        security: {
            authenticate: async (_req) => ({ userId: 'u-2', role: 'member' as const }),
        },
    },
    async ({ req, auth }) => {
        type _authHasUndefined = Expect<Extends<undefined, typeof auth>>;
        type _authNotAny = ExpectFalse<IsAny<typeof auth>>;
        type _authShape = Expect<Extends<Exclude<typeof auth, undefined>, AuthContext>>;
        return { data: { updated: true } };
    },
);

// @ts-expect-error public handlers do not receive auth parameter
createHandler(UpdateBookContract, async ({ req, auth: _auth }) => ({ data: { updated: true } }));

createHandler(
    UpdateBookContract,
    {
        access: 'protected',
        security: {
            authenticate: async () => ({ userId: 'u-3', role: 'staff' as const }),
            authSchema: AuthSchema,
            authorize: {
                afterValidation: [
                    async ({ req, auth }) => {
                        type _authorizedReqBody = Expect<
                            Equal<typeof req.body, { title: string; totalQuantity: number }>
                        >;
                        type _authorizedAuth = Expect<Extends<typeof auth, AuthContext>>;
                        if (!(auth.role === 'staff' && req.body.title.length > 0)) throw new createHttpError.Forbidden('denied'); return true;
                    },
                ],
            },
        },
    },
    async ({ req, auth: _auth }) => ({ data: { updated: true } }),
);

createHandler(
    UpdateBookContract,
    {
        access: 'protected',
        security: {
            authenticate: async () => ({ userId: 'u-3', role: 'staff' as const }),
            authSchema: AuthSchema,
            authorize: {
                beforeValidation: [
                    async ({ req, auth }) => {
                        type _authorizedReq = Expect<Equal<typeof req, Request>>;
                        type _authorizedAuth = Expect<Extends<typeof auth, AuthContext>>;
                        if (auth.role !== 'staff') throw new createHttpError.Forbidden('denied'); return true;
                    },
                ],
            },
        },
    },
    async ({ req, auth: _auth }) => ({ data: { updated: true } }),
);

const composedPolicy = allOf<AuthContext>([
    async ({ auth }) => { if (auth.role !== 'staff') throw new createHttpError.Forbidden('denied'); return true; },
    anyOf<AuthContext>([
        async ({ auth }) => { if (!auth.userId.startsWith('u-')) throw new createHttpError.Forbidden('denied'); return true; },
        not<AuthContext>(async ({ auth }) => { if (auth.role === 'member') throw new createHttpError.Forbidden('denied'); return true; }),
    ]),
]);

createHandler(
    UpdateBookContract,
    {
        access: 'protected',
        security: {
            authenticate: async () => ({ userId: 'u-4', role: 'staff' as const }),
            authorize: { beforeValidation: [composedPolicy] },
        },
        errors: {
            unauthenticated: (req) => {
                type _reqShape = Expect<Extends<typeof req, Request>>;
                return new createHttpError.Unauthorized('Unauthenticated');
            },
        },
    },
    async ({ req, auth: _auth }) => ({ data: { updated: true } }),
);

const publicFactory = createHandlerFactory<AuthContext>({
    access: 'public',
});

publicFactory(
    UpdateBookContract,
    // @ts-expect-error protected handlers require explicit access override for public-default factory
    async ({ req: _req, auth: _auth }) => {
        return { data: { updated: true } };
    },
);

publicFactory(
    UpdateBookContract,
    {
        access: 'protected',
        security: {
            authenticate: async () => ({ userId: 'u-5', role: 'staff' as const }),
            authSchema: AuthSchema,
        },
    },
    async ({ req, auth }) => {
        type _authExact = Expect<Extends<typeof auth, AuthContext>>;
        return { data: { updated: true } };
    },
);

const privateFactoryAuthSchemaAndAuthenticate = createHandlerFactory({
    access: 'protected',
    security: {
        authSchema: AuthSchema,
        authenticate: async () => ({ userId: 'u-5', role: 'staff' as const }),
    },
});

privateFactoryAuthSchemaAndAuthenticate(
    UpdateBookContract,
    {
        security: {
            authorize: {
                beforeValidation: [
                    async ({ req, auth }) => {
                        type _authorizedReq = Expect<Equal<typeof req, Request>>;
                        type _authorizedAuth = Expect<Extends<typeof auth, AuthContext>>;
                        if (auth.role !== 'staff') throw new createHttpError.Forbidden('denied'); return true;
                    },
                ],
            },
        },
    },
    async ({ req, auth }) => {
        type _authExact = Expect<Extends<typeof auth, AuthContext>>;
        return { data: { updated: true } };
    },
);

privateFactoryAuthSchemaAndAuthenticate(
    UpdateBookContract,
    {
        security: {
            authorize: {
                afterValidation: [
                    async ({ req, auth }) => {
                        type _authorizedReqBody = Expect<
                            Equal<typeof req.body, { title: string; totalQuantity: number }>
                        >;
                        type _authorizedAuth = Expect<Extends<typeof auth, AuthContext>>;
                        if (!(auth.role === 'staff' && req.body.title.length > 0)) throw new createHttpError.Forbidden('denied'); return true;
                    },
                ],
            },
        },
    },
    async ({ req, auth }) => {
        type _authExact = Expect<Extends<typeof auth, AuthContext>>;
        return { data: { updated: true } };
    },
);

const privateFactoryAuthenticateOnly = createHandlerFactory({
    access: 'protected',
    security: {
        authenticate: async () => ({ userId: 'u-5', role: 'staff' as const }),
    },
});

privateFactoryAuthenticateOnly(
    UpdateBookContract,
    {
        security: {
            authorize: {
                beforeValidation: [
                    async ({ req, auth }) => {
                        type _authorizedReq = Expect<Equal<typeof req, Request>>;
                        type _authorizedAuth = Expect<Extends<typeof auth, AuthContext>>;
                        if (auth.role !== 'staff') throw new createHttpError.Forbidden('denied'); return true;
                    },
                ],
            },
        },
    },
    async ({ req, auth }) => {
        type _authExact = Expect<Extends<typeof auth, AuthContext>>;
        return { data: { updated: true } };
    },
);

const privateFactoryInheritedAfterAuthorize = createHandlerFactory({
    access: 'protected',
    security: {
        authenticate: async () => ({ userId: 'u-5', role: 'staff' as const }),
    },
});

privateFactoryInheritedAfterAuthorize(
    UpdateBookContract,
    {
        security: {
            authorize: {
                afterValidation: [
                    async ({ req, auth }) => {
                        type _authorizedReqBody = Expect<
                            Equal<typeof req.body, { title: string; totalQuantity: number }>
                        >;
                        type _authorizedAuth = Expect<Extends<typeof auth, AuthContext>>;
                        if (!(auth.role === 'staff' && req.body.title.length > 0)) throw new createHttpError.Forbidden('denied'); return true;
                    },
                ],
            },
        },
    },
    async ({ req, auth }) => {
        type _authExact = Expect<Extends<typeof auth, AuthContext>>;
        return { data: { updated: true } };
    },
);

/**
 * Mixed-phase authorization: both buckets in a single handler call.
 */
createHandler(
    UpdateBookContract,
    {
        access: 'protected',
        security: {
            authenticate: async () => ({ userId: 'u-mix', role: 'staff' as const }),
            authSchema: AuthSchema,
            authorize: {
                beforeValidation: [
                    async ({ auth }) => {
                        type _authBefore = Expect<Extends<typeof auth, AuthContext>>;
                        if (auth.role !== 'staff') throw new createHttpError.Forbidden('denied'); return true;
                    },
                ],
                afterValidation: [
                    async ({ req, auth }) => {
                        type _bodyAfter = Expect<
                            Equal<typeof req.body, { title: string; totalQuantity: number }>
                        >;
                        type _authAfter = Expect<Extends<typeof auth, AuthContext>>;
                        if (req.body.title.length === 0) throw new createHttpError.Forbidden('denied'); return true;
                    },
                ],
            },
        },
    },
    async ({ req, auth: _auth }) => ({ data: { updated: true } }),
);

/**
 * Buckets are arrays only - a bare authorizer is rejected.
 */
createHandler(
    UpdateBookContract,
    {
        access: 'protected',
        security: {
            authenticate: async () => ({ userId: 'u-arr', role: 'staff' as const }),
            authorize: {
                // @ts-expect-error beforeValidation must be an array of authorizers
                beforeValidation: async () => true,
            },
        },
    },
    async () => ({ data: { updated: true } }),
);

/**
 * Contravariance: an after-typed authorizer cannot be placed in beforeValidation.
 */
const afterTypedPolicy: Authorizer<
    AuthContext,
    AfterAuthorizationRequest<typeof UpdateBookContract>
> = async ({ req }) => { if (req.body.title.length === 0) throw new createHttpError.Forbidden('denied'); return true; };

createHandler(
    UpdateBookContract,
    {
        access: 'protected',
        security: {
            authenticate: async () => ({ userId: 'u-contra', role: 'staff' as const }),
            authorize: {
                // @ts-expect-error after-typed authorizer rejected in beforeValidation (contravariance)
                beforeValidation: [afterTypedPolicy],
            },
        },
    },
    async () => ({ data: { updated: true } }),
);

/**
 * Dedicated negative assertions for missing `security.authenticate`.
 */

// @ts-expect-error protected handlers require security.authenticate
createHandler(
    UpdateBookContract,
    {
        access: 'protected',
        // security: {
        //     authenticate: async () => ({ userId: "u-5", role: "staff" as const }),
        // }
    },
    async ({ req }) => ({ data: { updated: true } }),
);

// @ts-expect-error optional handlers require security.authenticate
createHandler(
    UpdateBookContract,
    {
        access: 'optional',
        // security: {
        //     authenticate: async () => ({ userId: "u-5", role: "staff" as const }),
        // }
    },
    async ({ req }) => ({ data: { updated: true } }),
);

const protectedFactoryWithoutAuthenticate = createHandlerFactory<AuthContext>({
    access: 'protected',
});

// NOTE: With context-object handlers, TypeScript cannot prevent destructuring
// `auth` when the factory lacks authenticate in defaults. This would fail at runtime.
protectedFactoryWithoutAuthenticate(UpdateBookContract, async ({ req: _req, auth: _auth }) => ({ data: { updated: true } }));

const optionalFactoryWithoutAuthenticate = createHandlerFactory<AuthContext>({
    access: 'optional',
});

// NOTE: Same as above — runtime failure, not compile-time.
optionalFactoryWithoutAuthenticate(UpdateBookContract, async ({ req: _req, auth: _auth }) => ({ data: { updated: true } }));

const protectedFactoryAuthSchemaWithoutAuthenticate = createHandlerFactory<AuthContext>({
    access: 'protected',
    security: {
        authSchema: AuthSchema,
    },
});

// NOTE: Same as above — runtime failure, not compile-time.
protectedFactoryAuthSchemaWithoutAuthenticate(UpdateBookContract, async ({ req: _req, auth: _auth }) => ({ data: { updated: true } }));

const optionalFactoryAuthSchemaWithoutAuthenticate = createHandlerFactory<AuthContext>({
    access: 'optional',
    security: {
        authSchema: AuthSchema,
    },
});

// NOTE: Same as above — runtime failure, not compile-time.
optionalFactoryAuthSchemaWithoutAuthenticate(UpdateBookContract, async ({ req: _req, auth: _auth }) => ({ data: { updated: true } }));

// @ts-expect-error public handlers must not accept security options
createHandler(
    UpdateBookContract,
    {
        security: {
            authenticate: async () => ({ userId: 'u-public-1', role: 'staff' as const }),
        },
    },
    async ({ req }) => ({ data: { updated: true } }),
);

// @ts-expect-error public handlers must not accept security options
createHandler(
    UpdateBookContract,
    {
        security: {
            authorize: { beforeValidation: [async () => true] },
        },
    },
    async ({ req }) => ({ data: { updated: true } }),
);

// @ts-expect-error public factory handlers must not accept security options
publicFactory(
    UpdateBookContract,
    {
        security: {
            authenticate: async () => ({ userId: 'u-public-2', role: 'staff' as const }),
        },
    },
    async ({ req }) => ({ data: { updated: true } }),
);

// @ts-expect-error public factories must not accept security defaults
createHandlerFactory<AuthContext>({
    access: 'public',
    security: {
        authenticate: async () => ({ userId: 'u-public-default-1', role: 'staff' as const }),
    },
});

// @ts-expect-error public factories must not accept security defaults when access is omitted
createHandlerFactory<AuthContext>({
    security: {
        authenticate: async () => ({ userId: 'u-public-default-2', role: 'staff' as const }),
    },
});

publicFactory(
    UpdateBookContract,
    {
        access: 'public',
        // @ts-expect-error public factory handlers must not accept security options even when access is explicit
        security: {
            authorize: { beforeValidation: [async () => true] },
        },
    },
    async ({ req }) => ({ data: { updated: true } }),
);

const ZodObjectBodyContract = createContract({
    request: {
        body: z.object({
            email: z.string().email(),
            password: z.string().min(8),
        }),
        params: z.object({
            userId: z.string().uuid(),
        }),
        query: {
            verbose: z.coerce.boolean().default(false),
        },
    },
    response: z.boolean(),
});

createHandler(
    ZodObjectBodyContract,
    async ({ req }) => {
        type ZodObjBodyHandlerBody = typeof req.body;
        type _handlerBodyNotAny = ExpectFalse<IsAny<ZodObjBodyHandlerBody>>;
        type _handlerBodyExact = Expect<
            Equal<ZodObjBodyHandlerBody, { email: string; password: string }>
        >;

        type ZodObjBodyHandlerParams = typeof req.params;
        type _handlerParamsNotAny = ExpectFalse<IsAny<ZodObjBodyHandlerParams>>;
        type _handlerParamsExact = Expect<
            Equal<ZodObjBodyHandlerParams, { userId: string }>
        >;

        type ZodObjBodyHandlerQuery = typeof req.query;
        type _handlerQueryExact = Expect<
            Equal<ZodObjBodyHandlerQuery, { verbose: boolean }>
        >;

        void req.body.email;
        void req.body.password;
        void req.params.userId;
        void req.query.verbose;

        return { data: true };
    },
);

/**
 * Capability: strict authorizer return contract.
 *
 * An authorizer MUST return the literal `true` to allow and throw an HttpError
 * to deny. A bare boolean return carries no denial reason and is rejected.
 */
const _strictAllow: Authorizer<AuthContext> = async () => true;
const _strictAllowGuard: Authorizer<AuthContext> = async ({ auth }) => {
    if (auth.role !== 'staff') throw new createHttpError.Forbidden('denied');
    return true;
};

// @ts-expect-error a literal `false` return is not assignable to the strict authorizer type
const _booleanFalseReturn: Authorizer<AuthContext> = async () => false;

// @ts-expect-error a boolean expression return is rejected (must return literal `true`)
const _booleanExprReturn: Authorizer<AuthContext> = async ({ auth }) => auth.role === 'staff';

// @ts-expect-error an authorizer that omits `return true` (void return) is rejected
const _voidReturn: Authorizer<AuthContext> = ({ auth }) => {
    if (auth.role !== 'staff') throw new createHttpError.Forbidden('denied');
};
