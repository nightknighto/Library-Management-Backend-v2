import type { Request } from 'express';
import createHttpError from 'http-errors';
import { z } from 'zod';
import { allOf, anyOf, createContract, createHandler, createHandlerFactory, not } from '../index.ts';
import type { Equal, Expect, ExpectFalse, Extends, IsAny } from './type-test.utils.ts';

/**
 * Historical regression lane
 *
 * Put tests here when:
 * - A real bug, fragile edge case, or prior inference failure was fixed and must never return.
 * - The case should be traceable and ideally numbered or named.
 *
 * Do not put tests here when:
 * - The test is for a brand-new feature with no bug history (use capability or interaction lanes).
 * - The test defines broad baseline contracts (use the invariant lane file).
 *
 * Fast decision rule:
 * - If you can describe it as "this broke before", it belongs here.
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
        },
        params: {
            isbn: z.string(),
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
    response: z.array(
        z.object({
            isbn: z.string(),
        }),
    ),
    pagination: { response: true },
});

/**
 * Regression-001: authorization after validation must keep typed req payload.
 */
createHandler(
    UpdateBookContract,
    {
        access: 'protected',
        security: {
            authenticate: async () => ({ userId: 'r-1', role: 'staff' as const }),
            authorize: {
                afterValidation: [
                    async ({ req, auth }) => {
                        type _body = Expect<Equal<typeof req.body, { title: string }>>;
                        type _auth = Expect<Extends<typeof auth, AuthContext>>;
                        if (!(auth.role === 'staff' && req.body.title.length > 0)) throw new createHttpError.Forbidden('denied'); return true;
                    },
                ],
            },
        },
    },
    async ({ req, auth: _auth }) => ({ data: { updated: true } }),
);

/**
 * Regression-009: mixed-phase authorization must type both buckets correctly
 * in a single handler (before = raw Request, after = typed request).
 */
createHandler(
    UpdateBookContract,
    {
        access: 'protected',
        security: {
            authenticate: async () => ({ userId: 'r-9', role: 'staff' as const }),
            authorize: {
                beforeValidation: [
                    async ({ req, auth }) => {
                        type _reqBefore = Expect<Equal<typeof req, Request>>;
                        type _authBefore = Expect<Extends<typeof auth, AuthContext>>;
                        if (auth.role !== 'staff') throw new createHttpError.Forbidden('denied'); return true;
                    },
                ],
                afterValidation: [
                    async ({ req, auth }) => {
                        type _bodyAfter = Expect<Equal<typeof req.body, { title: string }>>;
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
 * Regression-002: response-paginated contracts must always return pagination metadata.
 */
// @ts-expect-error response-paginated contracts require pagination payload
createHandler(ListBooksContract, async ({ req }) => ({ data: [{ isbn: 'x' }] }));

/**
 * Regression-003: optional auth remains optional inside handlers.
 */
createHandler(
    UpdateBookContract,
    {
        access: 'optional',
        security: {
            authenticate: async () => ({ userId: 'r-2', role: 'member' as const }),
        },
    },
    async ({ req, auth }) => {
        type _optionalHasUndefined = Expect<Extends<undefined, typeof auth>>;
        type _optionalAuthShape = Expect<Extends<Exclude<typeof auth, undefined>, AuthContext>>;
        return { data: { updated: true } };
    },
);

/**
 * Regression-004: request payload inference must not degrade to any.
 */
createHandler(UpdateBookContract, async ({ req }) => {
    type _bodyNotAny = ExpectFalse<IsAny<typeof req.body>>;
    return { data: { updated: true } };
});

/**
 * Regression-005: contract response still includes the error envelope branch.
 */
type UpdateBookContractResponse = z.infer<typeof UpdateBookContract.response>;
type UpdateBookErrorResponse = Extract<UpdateBookContractResponse, { success: false }>;
type _hasErrorEnvelope = Expect<Equal<UpdateBookErrorResponse['success'], false>>;

/**
 * Regression-006: handlers must not allow unknown top-level success result keys.
 */
// @ts-expect-error unknown top-level keys must be rejected
createHandler(UpdateBookContract, async ({ req }) => ({
    data: { updated: true },
    metax: { timestamp: '2026-01-01T00:00:00.000Z' },
}));

/**
 * Regression-008: cookies must not weaken top-level key validation.
 */
// @ts-expect-error unknown top-level keys must still be rejected with cookies
createHandler(UpdateBookContract, async ({ req }) => ({
    data: { updated: true },
    cookies: [{ action: 'set', name: 'session', value: 'token' }],
    metax: { traceId: 'trace-8' },
}));

/**
 * Regression-007: public access must reject security options in handler calls.
 */
// @ts-expect-error public handlers must not accept security options
createHandler(
    UpdateBookContract,
    {
        security: {
            authenticate: async () => ({ userId: 'r-7', role: 'staff' as const }),
        },
    },
    async ({ req }) => ({ data: { updated: true } }),
);

const publicFactory = createHandlerFactory<AuthContext>({ access: 'public' });

// @ts-expect-error public factory handlers must not accept security options
publicFactory(
    UpdateBookContract,
    {
        security: {
            authorize: {
                // @ts-expect-error auth is unknown because security is rejected
                beforeValidation: [async ({ auth }) => { if (auth.role !== 'staff') throw new createHttpError.Forbidden('denied'); return true; }],
            },
        },
    },
    async ({ req }) => ({ data: { updated: true } }),
);

/**
 * Regression-010: throw-model combinator composites still compose and install.
 *
 * Backward-compat: the bucket install mechanism and combinator composition are
 * unchanged; only the authorizer return contract changed (allow = `return true`,
 * deny = throw HttpError). A composite built from allOf/anyOf/not — including
 * the new `denialError` parameter on anyOf/not — must still type-check and
 * install into a bucket.
 */
const _compositePolicy = anyOf<AuthContext>([
    allOf<AuthContext>([
        async () => true,
        async ({ auth }) => { if (auth.role !== 'staff') throw new createHttpError.Forbidden('denied'); return true; },
    ]),
    not<AuthContext>(async () => true, new createHttpError.Forbidden('not-allowed')),
]);

createHandler(
    UpdateBookContract,
    {
        access: 'protected',
        security: {
            authenticate: async () => ({ userId: 'r-10', role: 'staff' as const }),
            authorize: { beforeValidation: [_compositePolicy] },
        },
    },
    async ({ req, auth: _auth }) => ({ data: { updated: true } }),
);

// =========================================================================
// Regression: adding the .extend method to factory interfaces must not alter
// existing factory call-signature inference. Pre-existing factories built via
// createHandlerFactory continue to typecheck identically (their handlers infer
// auth/access exactly as before), and the new .extend member is additive only.
// =========================================================================

const _regressionFactory = createHandlerFactory<AuthContext>({
    access: 'protected',
    security: { authenticate: async () => ({ userId: 'r-11', role: 'staff' }) },
});

// Existing call shape — no options — still infers auth exactly as before.
_regressionFactory(
    UpdateBookContract,
    async ({ auth }) => {
        type _authStillExact = Expect<Equal<typeof auth, AuthContext>>;
        return { data: { updated: true } };
    },
);

// Existing call shape — options + handler — still infers auth exactly as before.
_regressionFactory(
    UpdateBookContract,
    {
        security: {
            authorize: {
                afterValidation: [
                    async ({ auth }): Promise<true> => {
                        if (auth.role !== 'staff') throw new createHttpError.Forbidden('denied');
                        return true;
                    },
                ],
            },
        },
    },
    async ({ auth }) => {
        type _authStillExactWithOpts = Expect<Equal<typeof auth, AuthContext>>;
        return { data: { updated: true } };
    },
);

// Existing call shape — access override to public — still typechecks.
_regressionFactory(
    UpdateBookContract,
    { access: 'public' },
    async ({ req: _req }) => ({ data: { updated: true } }),
);

// =========================================================================
// Regression: adding TReq (authorizer shape propagation) to factory types
// must not alter existing factory behavior. A factory built WITHOUT any
// shape-bound authorizer accepts every contract exactly as before — TReq
// defaults to plain Request and imposes no requirement. This guards against
// accidentally tightening factory contracts when authorizer shape inference
// was added.
// =========================================================================

const _plainFactory = createHandlerFactory<AuthContext>({
    access: 'protected',
    security: { authenticate: async () => ({ userId: 'r-12', role: 'staff' }) },
});

const _unrelatedContract = createContract({
    request: { body: { anything: z.string() } },
    response: z.object({ ok: z.boolean() }),
});

// A plain factory (no shape-bound authorizer) accepts an arbitrary contract
// — no requirement to satisfy, exactly as before TReq was introduced.
_plainFactory(_unrelatedContract, async () => ({ data: { ok: true } }));

// The same holds after a no-op .extend() that adds no shape-bound authorizer:
// the derived factory stays assignable to its parent (no tightened TReq).
const _plainDerived = _plainFactory.extend({
    security: {
        authorize: {
            beforeValidation: [
                async ({ auth }): Promise<true> => {
                    if (auth.role !== 'staff') throw new createHttpError.Forbidden('denied');
                    return true;
                },
            ],
        },
    },
});
type _plainDerivedAssignsToParent = Expect<Extends<typeof _plainDerived, typeof _plainFactory>>;
_plainDerived(_unrelatedContract, async () => ({ data: { ok: true } }));
