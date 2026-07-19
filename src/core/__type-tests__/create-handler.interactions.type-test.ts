/**
 * HUMAN GUIDE - Interaction lane
 *
 * Put tests here when:
 * - A scenario combines two or more feature axes and you need to prove they work together.
 * - Examples: protected + authenticate + authorize-after-validation + pagination.
 *
 * Do not put tests here when:
 * - The test checks only one isolated behavior (use the capability lane file).
 * - The test is a permanent baseline contract with no intended variation (use the invariant lane file).
 *
 * Fast decision rule:
 * - If removing one feature from the scenario changes the value of the test, it belongs here.
 *
 * This file is compile-only and validated by `pnpm check`.
 */

import type { Request } from 'express';
import createHttpError from 'http-errors';
import { z } from 'zod';
import {
    type AfterAuthorizationRequest,
    allOf,
    anyOf,
    type Authorizer,
    createAuthenticator,
    createContract,
    createHandler,
    createHandlerFactory,
    not,
} from '../index.ts';
import type { Equal, Expect, Extends } from './type-test.utils.ts';

type ScopedAuthContext = {
    userId: string;
    role: 'staff' | 'member';
    scopes: string[];
};

const SearchBooksContract = createContract({
    request: {
        query: {
            q: z.string(),
            page: z.coerce.number().default(1),
            limit: z.coerce.number().default(10),
        },
    },
    response: z.array(z.string()),
    pagination: { response: true },
});

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

type _afterAuthorizationRequestBody = Expect<
    Equal<AfterAuthorizationRequest<typeof UpdateBookContract>['body'], { title: string }>
>;

createHandler(
    SearchBooksContract,
    {
        access: 'protected',
        security: {
            authenticate: async () => ({
                userId: 'u-10',
                role: 'staff' as const,
                scopes: ['books:read'],
            }),
            authorize: {
                afterValidation: [
                    async ({ req, auth }) => {
                        type _query = Expect<
                            Extends<typeof req.query, { q: string; page: number; limit: number }>
                        >;
                        type _auth = Expect<Extends<typeof auth, ScopedAuthContext>>;
                        if (!(auth.scopes.includes('books:read') && req.query.limit <= 50)) throw new createHttpError.Forbidden('denied'); return true;
                    },
                    async ({ auth }) => { if (auth.role !== 'staff') throw new createHttpError.Forbidden('denied'); return true; },
                ],
            },
        },
    },
    async ({ req, auth }) => {
        type _auth = Expect<Extends<typeof auth, ScopedAuthContext>>;
        return {
            data: ['book-1'],
            pagination: {
                totalCount: 1,
                page: 1,
                limit: 10,
            },
        };
    },
);

createHandler(SearchBooksContract, async ({ req }) => ({
    statusCode: 206,
    data: ['book-1'],
    pagination: {
        totalCount: 1,
        page: 1,
        limit: 10,
    },
    cookies: [
        {
            action: 'set',
            name: 'result-token',
            value: 'partial',
            options: { httpOnly: true },
        },
    ],
}));

createHandler(
    UpdateBookContract,
    {
        access: 'optional',
        security: {
            authenticate: async () => ({
                userId: 'u-11',
                role: 'member' as const,
                scopes: ['books:write'],
            }),
            authorize: {
                beforeValidation: [
                    async ({ auth }) => { if (!auth.scopes.includes('books:write')) throw new createHttpError.Forbidden('denied'); return true; },
                ],
            },
        },
    },
    async ({ req, auth }) => {
        type _authHasUndefined = Expect<Extends<undefined, typeof auth>>;
        type _authShape = Expect<Extends<Exclude<typeof auth, undefined>, ScopedAuthContext>>;
        return { data: { updated: true } };
    },
);

// @ts-expect-error interaction: protected handlers reject unknown top-level result keys (metax)
createHandler(UpdateBookContract, { access: 'protected', security: { authenticate: async () => ({ userId: 'u-11b', role: 'staff' as ScopedAuthContext['role'], scopes: ['books:write'] }) } }, async ({ req, auth: _auth }) => ({ data: { updated: true }, metax: { traceId: 'trace-1' } }));

const protectedFactory = createHandlerFactory<ScopedAuthContext>({
    access: 'protected',
    security: {
        authenticate: async () => ({
            userId: 'u-12',
            role: 'staff' as const,
            scopes: ['books:write'],
        }),
    },
});

protectedFactory(
    UpdateBookContract,
    {
        access: 'protected',
        security: {
            authorize: {
                afterValidation: [
                    async ({ req, auth }) => {
                        type _body = Expect<Equal<typeof req.body, { title: string }>>;
                        type _auth = Expect<Extends<typeof auth, ScopedAuthContext>>;
                        if (!(auth.role === 'staff' && req.body.title.length > 0)) throw new createHttpError.Forbidden('denied'); return true;
                    },
                ],
            },
        },
    },
    async ({ req, auth }) => {
        type _auth = Expect<Extends<typeof auth, ScopedAuthContext>>;
        return { data: { updated: true } };
    },
);

/**
 * Interaction: mixed-phase authorization combines scopes (before) with a typed
 * request (after) and pagination in a single protected handler.
 */
createHandler(
    SearchBooksContract,
    {
        access: 'protected',
        security: {
            authenticate: async () => ({
                userId: 'u-mix-i',
                role: 'staff' as const,
                scopes: ['books:read', 'books:write'],
            }),
            authorize: {
                beforeValidation: [async ({ auth }) => { if (!auth.scopes.includes('books:read')) throw new createHttpError.Forbidden('denied'); return true; }],
                afterValidation: [
                    async ({ req, auth }) => {
                        type _query = Expect<
                            Extends<typeof req.query, { q: string; page: number; limit: number }>
                        >;
                        type _auth = Expect<Extends<typeof auth, ScopedAuthContext>>;
                        if (!(auth.scopes.includes('books:write') && req.query.limit <= 50)) throw new createHttpError.Forbidden('denied'); return true;
                    },
                ],
            },
        },
    },
    async ({ req, auth }) => {
        type _auth = Expect<Extends<typeof auth, ScopedAuthContext>>;
        return {
            data: ['book-1'],
            pagination: { totalCount: 1, page: 1, limit: 10 },
        };
    },
);

// @ts-expect-error interaction: overriding protected factory call to public must reject security options
protectedFactory(
    UpdateBookContract,
    {
        access: 'public',
        security: {
            authorize: {
                beforeValidation: [async ({ auth }) => { if (auth.role !== 'staff') throw new createHttpError.Forbidden('denied'); return true; }],
            },
        },
    },
    async ({ req }) => ({ data: { updated: true } }),
);

/**
 * Interaction: combinator denialError parameter.
 *
 * `anyOf` and `not` accept an optional `denialError: HttpError` thrown when the
 * combinator itself denies. `allOf` takes no such parameter (a branch's own
 * thrown error is the meaningful denial). The denialError must be an HttpError.
 */
const _anyOfCustomDenial = anyOf<ScopedAuthContext>(
    [async () => true],
    new createHttpError.PaymentRequired('pay up'),
);
const _notCustomDenial = not<ScopedAuthContext>(
    async () => true,
    new createHttpError.PaymentRequired('pay up'),
);

// @ts-expect-error allOf does not accept a denialError parameter
const _allOfNoDenial = allOf<ScopedAuthContext>([async () => true], new createHttpError.Forbidden('x'));

// @ts-expect-error denialError must be an HttpError instance, not a generic Error
const _anyOfBadDenialType = anyOf<ScopedAuthContext>([async () => true], new Error('not http'));

/**
 * Interaction: a createAuthenticator-built authenticator wires into createHandler
 * and its TAuth flows to both the authorizer and the handler callback, while the
 * authenticator's onMissingCredentials default travels with it (authenticator-
 * dictated, with no handler-level errors config).
 */
const _InteractionContract = createContract({
    request: { query: { q: z.string() } },
    response: z.object({ ok: z.boolean() }),
});

const _interactionAuthenticator = createAuthenticator(
    async () => ({ userId: 'u-int', role: 'staff' as const, scopes: ['books:write'] }),
    { onMissingCredentials: () => new createHttpError.Unauthorized('Missing Bearer token') },
);

createHandler(
    _InteractionContract,
    {
        access: 'protected',
        security: {
            authenticate: _interactionAuthenticator,
            authorize: {
                beforeValidation: [
                    async ({ auth }) => {
                        type _authReachesAuthorizer = Expect<Extends<typeof auth, ScopedAuthContext>>;
                        if (!auth.scopes.includes('books:write')) throw new createHttpError.Forbidden('denied');
                        return true;
                    },
                ],
            },
        },
    },
    async ({ auth }) => {
        type _authReachesHandler = Expect<Extends<typeof auth, ScopedAuthContext>>;
        return { data: { ok: true } };
    },
);

// =========================================================================
// Interaction: .extend() chains compose — TAuth threads across layers, access
// transitions propagate, and authorizers accumulate. Combines the extension
// surface with the access/auth axes in a single end-to-end chain.
// =========================================================================

const _scopedFactory = createHandlerFactory<ScopedAuthContext>({
    access: 'protected',
    security: {
        authenticate: async () => ({ userId: 'u-1', role: 'staff', scopes: ['books:write'] }),
    },
});

// Three-layer chain: base → derived (adds authorize) → re-derived (adds more).
const _derived = _scopedFactory.extend({
    security: {
        authorize: {
            afterValidation: [
                async ({ auth }): Promise<true> => {
                    if (!auth.scopes.includes('books:write')) throw new createHttpError.Forbidden('denied');
                    return true;
                },
            ],
        },
    },
});
const _rederived = _derived.extend({
    access: 'optional',
    security: {
        authorize: {
            beforeValidation: [
                async ({ auth }): Promise<true> => {
                    if (!auth?.userId) throw new createHttpError.Unauthorized('denied');
                    return true;
                },
            ],
        },
    },
});

// Interaction: the terminal factory still produces handlers, with TAuth
// threaded intact across both extension hops (authenticate transitive lock
// preserved the ScopedAuthContext identity). The terminal factory is `optional`,
// so `auth` is `ScopedAuthContext | undefined` — we assert the threaded context
// is present (ScopedAuthContext extends the auth type), proving TAuth survived.
_rederived(
    UpdateBookContract,
    async ({ auth }) => {
        type _authThreadedThroughTwoExtends = Expect<Extends<ScopedAuthContext, typeof auth>>;
        return { data: { updated: true } };
    },
);

// =========================================================================
// Interaction: authorizer shape requirement ACCUMULATES across .extend() chains
//
// Each .extend() layer that adds an afterValidation authorizer with a required
// request shape intersects its requirement onto the parent's accumulated TReq.
// A contract passed to any derived factory must therefore satisfy EVERY
// accumulated requirement, not just the most recent one.
// =========================================================================

const _needsParamsIsbn: Authorizer<ScopedAuthContext, Request<{ isbn: string }, any, unknown, any>> = async ({
    req,
}) => {
    if (req.params.isbn.length === 0) throw new createHttpError.Forbidden('denied');
    return true;
};
const _needsParamsSlug: Authorizer<ScopedAuthContext, Request<{ slug: string }, any, unknown, any>> = async ({
    req,
}) => {
    if (req.params.slug.length === 0) throw new createHttpError.Forbidden('denied');
    return true;
};

const _hasBothParams = createContract({
    request: { params: { isbn: z.string(), slug: z.string() } },
    response: z.object({ ok: z.boolean() }),
});
const _hasIsbnOnly = createContract({
    request: { params: { isbn: z.string() } },
    response: z.object({ ok: z.boolean() }),
});
const _hasSlugOnly = createContract({
    request: { params: { slug: z.string() } },
    response: z.object({ ok: z.boolean() }),
});

const _chainBase = createHandlerFactory<ScopedAuthContext>({
    access: 'protected',
    security: { authenticate: async () => ({ userId: 'c-1', role: 'staff', scopes: [] }) },
});

// Layer 1: requires params.isbn.
const _chainIsbn = _chainBase.extend({
    security: { authorize: { afterValidation: [_needsParamsIsbn] } },
});
// Layer 2: requires params.slug (parent's isbn requirement is preserved).
const _chainIsbnAndSlug = _chainIsbn.extend({
    security: { authorize: { afterValidation: [_needsParamsSlug] } },
});

// Contract satisfying BOTH accumulated requirements compiles.
_chainIsbnAndSlug(_hasBothParams, async () => ({ data: { ok: true } }));

// Contract satisfying only the parent's requirement (isbn) but missing the
// child's (slug) is rejected — proves intersection accumulation.
// @ts-expect-error accumulated TReq requires params.slug; contract has only isbn
_chainIsbnAndSlug(_hasIsbnOnly, async () => ({ data: { ok: true } }));

// Symmetric: contract satisfying only the child's requirement is also rejected.
// @ts-expect-error accumulated TReq requires params.isbn; contract has only slug
_chainIsbnAndSlug(_hasSlugOnly, async () => ({ data: { ok: true } }));
