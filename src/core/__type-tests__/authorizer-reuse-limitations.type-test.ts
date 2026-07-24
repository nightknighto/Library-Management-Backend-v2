/**
 * DIAGNOSTIC FILE — Authorizer reuse limitations across contracts.
 *
 * Question: for a REUSABLE authorizer installed into an `afterValidation` bucket,
 * does the "contract must satisfy the authorizer's required request shape" rule
 * actually hold for each channel (params / query / body) and combinations?
 *
 * Method: every line is a prediction asserted via the compiler.
 *   - `Expect<Extends<S, R>>`      => prediction: ACCEPT (S assignable to R)
 *   - `ExpectFalse<Extends<S, R>>` => prediction: REJECT (not assignable)
 * The compiler is the source of truth. Validated by `pnpm check` (compile-only).
 *
 * Bucket check is contravariant: `Authorizer<Auth, R>` fits a bucket expecting
 * `Authorizer<Auth, S>`  <=>  `S` is assignable to `R`. So `Extends<S, R>` is the
 * exact condition the real bucket uses.
 */

import type { Request } from 'express';
import { z } from 'zod';
import {
    type AfterAuthorizationRequest,
    type Authorizer,
    createContract,
    HttpError,
} from '../index.ts';
import type { Expect, ExpectFalse, Extends, IsAny } from './type-test.utils.ts';

type AuthContext = { userId: string; role: 'staff' | 'member' };

// =========================================================================
// SECTION 0: CONTRACTS with distinct, non-overlapping field names so a
// missing-field result can be attributed to a single channel.
// =========================================================================

const BodyTitleContract = createContract({
    request: { body: { title: z.string() } },
    response: z.object({ ok: z.boolean() }),
});
const BodyPagesContract = createContract({
    request: { body: { pages: z.number() } },
    response: z.object({ ok: z.boolean() }),
});
const ParamsIsbnContract = createContract({
    request: { params: { isbn: z.string() } },
    response: z.object({ ok: z.boolean() }),
});
const ParamsSlugContract = createContract({
    request: { params: { slug: z.string() } },
    response: z.object({ ok: z.boolean() }),
});
const QueryDryRunContract = createContract({
    request: { query: { dryRun: z.coerce.boolean().default(false) } },
    response: z.object({ ok: z.boolean() }),
});
const EmptyContract = createContract({
    request: {},
    response: z.object({ ok: z.boolean() }),
});
const ComboContract = createContract({
    request: {
        body: { title: z.string() },
        params: { isbn: z.string() },
        query: { dryRun: z.coerce.boolean().default(false) },
    },
    response: z.object({ ok: z.boolean() }),
});

// Per-contract source request types + the contravariance condition.
type SBodyTitle = AfterAuthorizationRequest<typeof BodyTitleContract>;
type SBodyPages = AfterAuthorizationRequest<typeof BodyPagesContract>;
type SParamsIsbn = AfterAuthorizationRequest<typeof ParamsIsbnContract>;
type SParamsSlug = AfterAuthorizationRequest<typeof ParamsSlugContract>;
type SEmpty = AfterAuthorizationRequest<typeof EmptyContract>;
type SCombo = AfterAuthorizationRequest<typeof ComboContract>;
type Fits<S extends Request, Req extends Request> = Extends<S, Req>;

// Requirement slices expressed via explicit Request generics (params/body only;
// query cannot be pinned this way — see SECTION 4).
type ReqParamsIsbn = Request<{ isbn: string }, any, unknown, any>;
type ReqBodyTitle = Request<Record<string, string>, any, { title: string }, any>;
type ReqBodyTitleAndParamsIsbn = Request<{ isbn: string }, any, { title: string }, any>;

// =========================================================================
// SECTION 1: FOUNDATIONAL TypeScript semantics (the engine of every result).
// =========================================================================

// An index-signature type does NOT satisfy a named property. This is why params
// requirements ARE enforced despite the source carrying Record<string,string>.
type _f_indexNoNamed = ExpectFalse<Extends<Record<string, string>, { isbn: string }>>;
type _f_intersectNoNamed = ExpectFalse<Extends<Record<string, string> & { slug: string }, { isbn: string }>>;
type _f_hasNamedOk = Expect<Extends<Record<string, string> & { isbn: string }, { isbn: string }>>;
// `any` is assignable to anything. This is why query requirements are NOT enforced.
type _f_anySatisfies = Expect<Extends<any, { dryRun: boolean }>>;
type _f_anyAndTIsAny = Expect<IsAny<any & { dryRun: boolean }>>;
// `unknown` is not assignable to a specific shape. This is why body requirements ARE enforced.
type _f_unknownNotAssignable = ExpectFalse<Extends<unknown, { title: string }>>;
type _f_concreteMismatch = ExpectFalse<Extends<{ pages: number }, { title: string }>>;
type _f_concreteExtends = Expect<Extends<{ title: string; author: string }, { title: string }>>;

// =========================================================================
// SECTION 2: SOURCE-CHANNEL CHARACTERIZATION.
// =========================================================================

// query channel is `any` for EVERY contract (AuthorizerBaseRequest.query = any).
type _sq_combo = Expect<IsAny<SCombo['query']>>;
type _sq_empty = Expect<IsAny<SEmpty['query']>>;
type _sq_bodyOnly = Expect<IsAny<SBodyTitle['query']>>;
// params channel carries the Record<string,string> base (index signature) always.
type _sp_emptyExtendsRecord = Expect<Extends<SEmpty['params'], Record<string, string>>>;
// body channel is never `any` (keeps enforcement), even for a contract with no body.
type _sb_emptyNotAny = ExpectFalse<IsAny<SEmpty['body']>>;
type _sb_pagesNotAny = ExpectFalse<IsAny<SBodyPages['body']>>;

// =========================================================================
// SECTION 3: ENFORCEMENT MATRIX per channel.
// =========================================================================

// --- 3a. PARAMS requirement: ENFORCED (match accepts; missing/mismatched rejects).
type _p_match = Expect<Fits<SParamsIsbn, ReqParamsIsbn>>;
type _p_combo = Expect<Fits<SCombo, ReqParamsIsbn>>;
type _p_slugMissing = ExpectFalse<Fits<SParamsSlug, ReqParamsIsbn>>;
type _p_emptyMissing = ExpectFalse<Fits<SEmpty, ReqParamsIsbn>>;
type _p_noParamsContract = ExpectFalse<Fits<SBodyTitle, ReqParamsIsbn>>;

// --- 3b. BODY requirement: ENFORCED (match accepts; missing/mismatched rejects).
type _b_match = Expect<Fits<SBodyTitle, ReqBodyTitle>>;
type _b_combo = Expect<Fits<SCombo, ReqBodyTitle>>;
type _b_mismatch = ExpectFalse<Fits<SBodyPages, ReqBodyTitle>>;
type _b_missing = ExpectFalse<Fits<SEmpty, ReqBodyTitle>>;
type _b_noBodyContract = ExpectFalse<Fits<SParamsIsbn, ReqBodyTitle>>;

// --- 3c. QUERY requirement: NOT ENFORCED (source query is `any` -> everything satisfies).
type _q_satisfiesDryRun_match = Expect<Extends<SCombo['query'], { dryRun: boolean }>>;
type _q_satisfiesDryRun_unrelated = Expect<Extends<SBodyTitle['query'], { dryRun: boolean }>>;
type _q_satisfiesDryRun_empty = Expect<Extends<SEmpty['query'], { dryRun: boolean }>>;

// --- 3d. COMBINATION body+params: BOTH channels enforced simultaneously.
type _bp_combo = Expect<Fits<SCombo, ReqBodyTitleAndParamsIsbn>>;
type _bp_paramsMissing = ExpectFalse<Fits<SBodyTitle, ReqBodyTitleAndParamsIsbn>>;
type _bp_bodyMissing = ExpectFalse<Fits<SParamsIsbn, ReqBodyTitleAndParamsIsbn>>;
type _bp_bodyWrong = ExpectFalse<Fits<SBodyPages, ReqBodyTitleAndParamsIsbn>>;

// =========================================================================
// SECTION 4: EXPRESSION GOTCHAS (how a user must declare a reusable authorizer).
// =========================================================================

// Gotcha: the intersection form `Request & { body: {...} }` STILL enforces
// installation (assignability checks each constituent literally), BUT it collapses
// `req.body` to `any` INSIDE the authorizer (plain Request.body defaults to `any`;
// any & T = any), so internal access loses type safety. Use explicit generics for
// body to keep BOTH enforcement AND internal typing.
type _gotcha_intersectionStillEnforces_body = ExpectFalse<Fits<SBodyPages, Request & { body: { title: string } }>>;
type _gotcha_intersectionLosesInternalTyping = Expect<IsAny<(Request & { body: { title: string } })['body']>>;
type _gotcha_explicitKeepsInternalTyping = ExpectFalse<IsAny<ReqBodyTitle['body']>>;
// Params via the intersection form also enforces, and does not collapse internally
// (plain Request.params = Record<string,string>, not any).
type _gotcha_paramsEnforcesViaIntersection = ExpectFalse<Fits<SBodyPages, Request & { params: { isbn: string } }>>;

// =========================================================================
// SECTION 5: GROUND TRUTH via real bucket assignment.
// `Bucket<S>` mirrors the internal `afterValidation` bucket type verbatim:
//   Array<Authorizer<TAuth, AfterAuthorizationRequest<Contract>>>
// =========================================================================

type Bucket<S extends Request> = Array<Authorizer<AuthContext, S>>;

const needsBodyTitle: Authorizer<AuthContext, ReqBodyTitle> = async ({ req }) => {
    if (req.body.title.length === 0) throw new HttpError.Forbidden('denied'); return true;
};
const needsParamsIsbn: Authorizer<AuthContext, ReqParamsIsbn> = async ({ req }) => {
    if (req.params.isbn.length === 0) throw new HttpError.Forbidden('denied'); return true;
};
const needsQueryDryRun: Authorizer<AuthContext, Request & { query: { dryRun: boolean } }> = async ({
    req,
}) => { if (req.query.dryRun !== true) throw new HttpError.Forbidden('denied'); return true; };

// PARAMS enforced: match installs; missing param rejected.
const _g_paramsMatch: Bucket<SParamsIsbn> = [needsParamsIsbn];
// @ts-expect-error ReqParamsIsbn requires params.isbn; BodyPagesContract has no params
const _g_paramsReject: Bucket<SBodyPages> = [needsParamsIsbn];

// BODY enforced: match installs; mismatch rejected.
const _g_bodyMatch: Bucket<SCombo> = [needsBodyTitle];
// @ts-expect-error ReqBodyTitle requires body.title; BodyPagesContract has body.pages
const _g_bodyReject: Bucket<SBodyPages> = [needsBodyTitle];

// QUERY NOT enforced: installs into a contract with no dryRun query (LEAK).
const _g_queryLeak: Bucket<SBodyPages> = [needsQueryDryRun];
