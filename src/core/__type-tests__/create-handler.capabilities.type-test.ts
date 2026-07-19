import type { Request } from 'express';
import createHttpError from 'http-errors';
import { z } from 'zod';
import {
    type AfterAuthorizationRequest,
    allOf,
    anyOf,
    type Authenticator,
    createAuthenticator,
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
        },
    },
    async ({ req, auth }) => {
        type _authExact = Expect<Extends<typeof auth, AuthContext>>;
        return { data: { updated: true } };
    },
);

const privateFactoryAuthenticateAndAuthorize = createHandlerFactory({
    access: 'protected',
    security: {
        authenticate: async () => ({ userId: 'u-5', role: 'staff' as const }),
    },
});

privateFactoryAuthenticateAndAuthorize(
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

privateFactoryAuthenticateAndAuthorize(
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

/**
 * Invariant: `authSchema` has been removed from the framework security surface.
 *
 * The authenticator is the single source of its output's validity. If it needs
 * schema validation, it performs that internally and throws the appropriate
 * error. Reintroducing a framework-level `authSchema` would resurrect the last
 * framework-owned auth error and the fail-wrong failure mode documented in
 * docs/specs/2026-07-07-authschema-removal.md.
 */
createHandler(
    UpdateBookContract,
    {
        access: 'protected',
        security: {
            authenticate: async () => ({ userId: 'u-no-schema', role: 'staff' as const }),
            // @ts-expect-error SecurityOptions no longer accepts authSchema
            authSchema: z.object({ userId: z.string() }),
        },
    },
    async () => ({ data: { updated: true } }),
);

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
 * Capability: ZodObject query + pagination merges page/limit and flows the
 * merged shape (including injected page/limit) into the handler's req.query.
 */
const ZodObjectQueryContract = createContract({
    request: {
        query: z.object({ search: z.string().optional(), sort: z.string() }),
    },
    response: z.array(z.string()),
    pagination: { request: true },
});

createHandler(
    ZodObjectQueryContract,
    async ({ req }) => {
        type HandlerQuery = typeof req.query;
        type _handlerQueryNotAny = ExpectFalse<IsAny<HandlerQuery>>;
        type _handlerQueryExact = Expect<
            Equal<HandlerQuery, { search?: string | undefined; sort: string; page: number; limit: number }>
        >;

        void req.query.search;
        void req.query.sort;
        void req.query.page;
        void req.query.limit;

        return { data: [req.query.sort] };
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

/**
 * Capability: createAuthenticator infers TAuth from the callback return.
 *
 * The factory is inference-stable by construction — TAuth pins from the callback
 * return (argument 1) with no backward flow into a handler signature, unlike an
 * inline `authenticate` inside createHandler which can degrade TAuthContext to
 * `unknown` (see docs/rules/create-handler-auth-inference-limitations.md).
 */
const _inferredAuthSimple = createAuthenticator(async (req) => ({ userId: 'u-auth', role: 'staff' as const }));
type _inferredAuthSimpleT = Expect<
    Equal<typeof _inferredAuthSimple, Authenticator<{ userId: string; role: 'staff' }, Request>>
>;

const _inferredAuthWithAbsence = createAuthenticator(async (req) => {
    if (!req.headers.authorization) return null;
    return { userId: 'u-auth', role: 'staff' as const };
});
type _inferredAuthWithAbsenceT = Expect<
    Equal<typeof _inferredAuthWithAbsence, Authenticator<{ userId: string; role: 'staff' }, Request>>
>;

/**
 * Capability: onMissingCredentials is carried on the returned Authenticator.
 *
 * Parameterless by design (D2): the no-credentials message is mechanism-specific
 * — a constant traveling with the authenticator — so it does not depend on the
 * request. Request-specific concerns like i18n belong to the error-rendering layer.
 */
const _authWithDefault = createAuthenticator(
    async () => ({ userId: 'u-auth', role: 'staff' as const }),
    {
        onMissingCredentials: () => new createHttpError.Unauthorized('Missing Bearer token'),
    },
);
type _onMissingTyped = Expect<
    Equal<
        typeof _authWithDefault.onMissingCredentials,
        (() => createHttpError.HttpError) | undefined
    >
>;

// =========================================================================
// Capability: .extend() — factory-extends-factory (single-axis coverage)
//
// Multi-axis behavior (chaining, access transitions, TAuth threading across
// layers) lives in the interaction lane. Here we assert each axis in isolation.
// =========================================================================

const _protectedBase = createHandlerFactory<AuthContext>({
    access: 'protected',
    security: {
        authenticate: async () => ({ userId: 'u-1', role: 'staff' }),
    },
});

// Capability: .extend exists on a secured factory and returns a factory of the
// same kind (TAuth threaded from the parent, access inherited when omitted).
const _derivedInheritAccess = _protectedBase.extend();
// Derived factory is structurally assignable to the parent factory type.
type _derivedInheritAccessExtendsParent = Expect<Extends<typeof _derivedInheritAccess, typeof _protectedBase>>;

// Capability: a derived factory produces handlers whose `auth` is the parent's
// AuthContext (authenticate transitively locked → TAuth is inherited, not lost).
_derivedInheritAccess(
    UpdateBookContract,
    async ({ auth }) => {
        type _authIsInherited = Expect<Equal<typeof auth, AuthContext>>;
        return { data: { updated: true } };
    },
);

// Capability: child may move access between protected and optional.
const _derivedOptional = _protectedBase.extend({ access: 'optional' });
const _derivedProtected = _derivedOptional.extend({ access: 'protected' });
void _derivedOptional;
void _derivedProtected;

// Capability: authenticate is transitively locked — the extension type does
// not expose a `security.authenticate` key on a secured factory. The nested
// directive targets the actual error site (the `authenticate` property).
_protectedBase.extend({
    security: {
        // @ts-expect-error a secured factory's .extend may not (re)declare authenticate
        authenticate: async () => ({ userId: 'rogue', role: 'staff' as const }),
    },
});

// Capability: access may never widen to public (would erase the security pipeline).
// @ts-expect-error .extend on a secured factory rejects access: 'public'
_protectedBase.extend({ access: 'public' });

// Capability: public factory .extend is an upgrade — introduces TAuth as the
// first setter and yields a secured factory.
const _publicBase = createHandlerFactory<AuthContext>({ access: 'public' });
const _upgradedFromPublic = _publicBase.extend({
    access: 'protected',
    security: {
        authenticate: async (): Promise<AuthContext> => ({ userId: 'u-upgraded', role: 'staff' }),
    },
});
_upgradedFromPublic(
    UpdateBookContract,
    async ({ auth }) => {
        type _authIntroducedByUpgrade = Expect<Equal<typeof auth, AuthContext>>;
        return { data: { updated: true } };
    },
);

// Capability: public factory .extend requires the upgrade (authenticate + non-public access).
// @ts-expect-error public factory .extend rejects access: 'public' (no upgrade)
_publicBase.extend({ access: 'public' });

// =========================================================================
// Capability: authorizer shape propagation through factory + .extend()
//
// An authorizer typed against a partial request shape (e.g.
// `Authorizer<Auth, Request<{ isbn: string }, ...>>`) declares a requirement
// the contract passed to the factory must satisfy. This requirement is
// captured at factory-creation / .extend() time and enforced at the
// invocation call site, where the contract's AfterAuthorizationRequest is
// known. Single-axis here; accumulation across chains lives in the
// interaction lane.
// =========================================================================

// Shared reusable authorizer: requires params.isbn (and typed body, matching
// the AuthorizerBaseRequest defaults so the requirement is on params only).
const _needsParamsIsbn: Authorizer<
    AuthContext,
    Request<{ isbn: string }, any, unknown, any>
> = async ({ req }) => {
    if (req.params.isbn.length === 0) throw new createHttpError.Forbidden('denied');
    return true;
};

// Contracts that either satisfy or fail the isbn requirement.
const _hasParamsIsbn = createContract({
    request: { params: { isbn: z.string() } },
    response: z.object({ ok: z.boolean() }),
});
const _noParamsIsbn = createContract({
    request: { body: { title: z.string() } },
    response: z.object({ ok: z.boolean() }),
});

// Capability: .extend() with a shape-bound authorizer COMPILES (the bug fix).
// Before the fix, plain `Request`-typed extension buckets rejected this via
// contravariance. The requirement is now captured into TReq and enforced at
// invocation, not at .extend() time.
const _derivedWithReq = _protectedBase.extend({
    security: { authorize: { afterValidation: [_needsParamsIsbn] } },
});

// Capability: invoking the derived factory with a SATISFYING contract compiles.
_derivedWithReq(_hasParamsIsbn, async () => ({ data: { ok: true } }));

// Capability: invoking the derived factory with an UNSATISFYING contract fails
// (the contract's AfterAuthorizationRequest lacks params.isbn).
// @ts-expect-error contract missing params.isbn required by the derived authorizer
_derivedWithReq(_noParamsIsbn, async () => ({ data: { ok: true } }));

// Capability: a factory BASELINE authorizer (not via .extend) carrying a
// required shape is captured and enforced at every invocation. TAuth and the
// authorizer shape are both INFERRED (no explicit type argument) — when the
// authenticator is inline. When the caller passes an explicit type argument
// (e.g. createHandlerFactory<AuthContext>(...)), TS cannot also infer the
// authorizer shape and the requirement is not captured; the idiomatic path in
// that case is .extend() on a base factory (covered above).
const _baselineReqFactory = createHandlerFactory({
    access: 'protected',
    security: {
        authenticate: async (): Promise<AuthContext> => ({ userId: 'u-base', role: 'staff' }),
        authorize: { afterValidation: [_needsParamsIsbn] },
    },
});

_baselineReqFactory(_hasParamsIsbn, async () => ({ data: { ok: true } }));
// @ts-expect-error baseline authorizer requires params.isbn; contract lacks it
_baselineReqFactory(_noParamsIsbn, async () => ({ data: { ok: true } }));

// Capability: public factory .extend() (upgrade) carrying a shape-bound
// authorizer propagates the requirement onto the resulting secured factory.
const _publicBaseForReq = createHandlerFactory<AuthContext>({ access: 'public' });
const _upgradedWithReq = _publicBaseForReq.extend({
    access: 'protected',
    security: {
        authenticate: async (): Promise<AuthContext> => ({ userId: 'u-up', role: 'staff' }),
        authorize: { afterValidation: [_needsParamsIsbn] },
    },
});

_upgradedWithReq(_hasParamsIsbn, async () => ({ data: { ok: true } }));
// @ts-expect-error upgrade authorizer requires params.isbn; contract lacks it
_upgradedWithReq(_noParamsIsbn, async () => ({ data: { ok: true } }));

// Capability: beforeValidation-only authorizers do NOT add to TReq — they run
// against a plain Request before the contract is validated, so they cannot
// impose a contract-bound shape requirement. The derived factory therefore
// accepts a contract without params.isbn.
const _derivedBeforeOnly = _protectedBase.extend({
    security: {
        authorize: {
            beforeValidation: [
                async ({ auth }) => {
                    if (auth.role !== 'staff') throw new createHttpError.Forbidden('staff only');
                    return true;
                },
            ],
        },
    },
});
_derivedBeforeOnly(_noParamsIsbn, async () => ({ data: { ok: true } }));

// =========================================================================
// Capability: descriptive rejection message on factory authorizer mismatch.
//
// When a contract fails a factory's accumulated authorizer requirement, the
// rejection MUST surface a self-contained, human-readable explanation — not a
// cryptic branded name like `__unsatisfiedAuthorizerReq`. The message is the
// branded property's NAME (echoed verbatim by TS in the diagnostic), so it
// must not carry links (the consuming project never sees this repo's docs).
//
// Direct createHandler (Path A) produces a structural error naturally (the
// authorizer bucket is checked inline via contravariance); this guard targets
// the factory paths (B: factory invocation, C: extended factory invocation)
// where rejection goes through the Checked wrapper.
// =========================================================================

// Capture the first call signature's contract parameter — the Checked-wrapped
// form. Only the first overload is read; the public-override (last overload)
// bypasses Checked. For a contract type whose AfterAuthorizationRequest lacks
// the required isbn, Checked evaluates to its false branch carrying the message.
type _FirstSigContract<T> = T extends {
    (contract: infer C, ...rest: any[]): any;
    (...args: any[]): any;
}
    ? C
    : never;

// Path C: extended factory — TReq carries the isbn requirement.
type _DerivedContractParam = _FirstSigContract<typeof _derivedWithReq>;
type _derivedCarriesMessage = Expect<
    Extends<
        '[ERROR] Contract rejected: this factory has an afterValidation authorizer that requires a request field (e.g. a params/body/query field) the contract does not provide. Make the contract define the field(s) the authorizer reads.',
        keyof _DerivedContractParam
    >
>;

// Path B: factory baseline — same message via the same Checked wrapper.
type _BaselineContractParam = _FirstSigContract<typeof _baselineReqFactory>;
type _baselineCarriesMessage = Expect<
    Extends<
        '[ERROR] Contract rejected: this factory has an afterValidation authorizer that requires a request field (e.g. a params/body/query field) the contract does not provide. Make the contract define the field(s) the authorizer reads.',
        keyof _BaselineContractParam
    >
>;

// Guard: a cryptic name would NOT be present. If someone reverts the branded
// property to `__unsatisfiedAuthorizerReq`, this assertion fails (its key set
// would lack the descriptive sentence).
type _derivedRejectsCrypticName = ExpectFalse<
    Extends<'__unsatisfiedAuthorizerReq', keyof _DerivedContractParam>
>;
