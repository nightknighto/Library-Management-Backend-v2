# Authorizer Error-Model Redesign

- **Date:** 2026-07-01
- **Status:** Approved (awaiting implementation)
- **Scope:** `src/core` framework primitives — `Authorizer` contract, policy combinators (`allOf` / `anyOf` / `not`), the `errors` map, and the authorization runtime.
- **Out of scope:** Authenticator contract (see `2026-07-01-authenticator-redesign-deferral.md`).
- **Validation:** `pnpm check` (compile / inference), `pnpm test` (runtime).

---

## 1. Context & problem

The current authorization error model has three structural problems, independent of any particular app's usage:

1. **The `Authorizer` return contract cannot carry a failure reason.**
   `Authorizer<TAuth, TReq> = (p) => MaybePromise<boolean>` (`src/core/types.core.ts:369`). A policy can only say *allowed* or *denied* — never *why*. A "not the owner" denial and a "not staff" denial produce the identical outcome.

2. **The `errors` map is too coarse to recover that reason.**
   `HandlerErrorMappers.unauthorized` (`src/core/types.core.ts:500`) is `AuthErrorMapper = (req) => HttpError` — it receives only the request, not *which* authorizer failed, not the auth context, not a reason. It maps *every* policy denial in a handler to one generic error. In practice it is bypassed: the runtime already lets a thrown `HttpError` propagate from inside an authorizer straight to `handleError` (`src/core/error-handler.core.ts:178` → `:133`), so throwing is the de-facto way to attach a reason, and the map is left unused.

3. **The `errors` map is also mislabeled and overloaded.**
   `errors.unauthorized` is consulted for **both** a 401 (missing auth reaching the authz stage, `security.core.ts:135`) **and** a 403 (policy denial, `:144`), with different defaults. The name contradicts RFC 7235 (401 = unauthenticated, 403 = forbidden) and its own default behavior.

### Root finding (from the investigation)

The framework **already** fully supports throwing `HttpError` from authorizers: there is no try/catch around the user callback in `executeAuthorizationStage` (`security.core.ts:142`), so a thrown `HttpError` propagates to the runtime catch (`create-handler.core.ts:457`) and is faithfully rendered. The `errors` map is therefore only ever a fallback for the `return false` / `return null` style. This makes the boolean-return + errors-map layer redundant for anyone who throws — which is the observed real-world usage.

---

## 2. Goals & non-goals

**Goals**
- Make every authorization denial carry an explicit, specific `HttpError` reason — by construction.
- Make policy combinators (`allOf` / `anyOf` / `not`) correct under throwing authorizers (a pre-existing latent bug: `anyOf` currently lets a thrown error kill the OR instead of trying the next branch).
- Remove the authorization half of the `errors` map.
- Preserve strong type inference and IntelliSense across the contract → combinator → handler path.

**Non-goals**
- Backward compatibility (explicitly not a factor for this redesign).
- Blast-radius minimization (explicitly not a factor).
- Redesigning the **authenticator** contract — deferred (see companion spec).

---

## 3. Decision

Adopt the **exception-strict authorizer model ("Approach 2")**: an authorizer returns `true` to allow and **throws an `HttpError` to deny**. There is no boolean denial path; every denial is explicit.

`anyOf` and `not` additionally take an optional `denialError` parameter that specifies the error the *combinator itself* throws when it denies; omitted, it defaults to a hard-coded `403 Forbidden`.

---

## 4. Detailed design

### 4.1 Authorizer contract

```ts
// src/core/types.core.ts
export type Authorizer<
    TAuthContext,
    TRequest extends Request<any, any, any, any> = Request,
> = (params: { req: TRequest; auth: TAuthContext }) => MaybePromise<true>;
```

- **Allow:** `return true`.
- **Deny:** `throw new createHttpError.X(...)`.
- The return type `MaybePromise<true>` is strict: an authorizer that denies without an explicit `return true` on its allow path is a **compile error**. This forces intent and makes "forgot to deny" impossible to express in the type (the only literal return is `true`; denial must be a throw).

```ts
// simple
const isStaff: Authorizer<Auth> = ({ auth }) => {
    if (auth.role !== 'staff') throw new createHttpError.Forbidden('Staff only');
    return true;
};
// multi-reason
const isOwner: Authorizer<Auth, Req> = async ({ req, auth }) => {
    const book = await bookRepo.get(req.params.id);
    if (!book) throw new createHttpError.NotFound('Book not found');
    if (book.ownerId !== auth.userId) throw new createHttpError.Forbidden('Not the owner');
    return true;
};
```

### 4.2 Policy combinators

All three combinators are made **throw-aware**. The separation between *expected denial* (a thrown `HttpError`) and *unexpected error* (any other throw) is enforced everywhere by an `instanceof HttpError` check: denials are caught and drive combinator semantics; unexpected errors propagate so bugs are never swallowed (in particular, `not()` can never silently allow on an unexpected error).

```ts
// allOf: AND. No denialError param — a denial is always a branch's own
// thrown error, and that branch's reason is the meaningful one.
function allOf(ps) {
    return async (ctx) => {
        for (const p of ps) await p(ctx);   // first thrown HttpError propagates
        return true;
    };
}

// anyOf: OR. denialError = what anyOf throws when every branch denies.
function anyOf(ps, denialError) {
    return async (ctx) => {
        for (const p of ps) {
            try { await p(ctx); return true; }                       // branch allowed → OR passes
            catch (e) {
                if (!(e instanceof createHttpError.HttpError)) throw e; // unexpected → propagate
                // else: branch denied → try next
            }
        }
        throw denialError ?? new createHttpError.Forbidden('Forbidden'); // all denied
    };
}

// not: negation. denialError = what not throws when the wrapped policy allows.
function not(p, denialError) {
    return async (ctx) => {
        try { await p(ctx); }                                         // p allowed
        catch (e) {
            if (e instanceof createHttpError.HttpError) return true;  // p denied → allow
            throw e;                                                  // unexpected → propagate
        }
        throw denialError ?? new createHttpError.Forbidden('Forbidden'); // p allowed → deny
    };
}
```

**Signatures** (preserving the existing `NoInfer` overloads so an explicit request type can still be supplied):

```ts
function allOf<TContext, TRequest extends Request>(
    policies: Array<Authorizer<TContext, NoInfer<TRequest>>>,
): Authorizer<TContext, TRequest>;

function anyOf<TContext, TRequest extends Request>(
    policies: Array<Authorizer<TContext, NoInfer<TRequest>>>,
    denialError?: HttpError,
): Authorizer<TContext, TRequest>;

function not<TContext, TRequest extends Request>(
    policy: Authorizer<TContext, NoInfer<TRequest>>,
    denialError?: HttpError,
): Authorizer<TContext, TRequest>;
```

### 4.3 The `denialError` parameter

- **Type:** `HttpError` instance (an object constructed via the `http-errors` API the framework already uses everywhere).
- **Semantics:**
  - For `anyOf`: thrown when **all** branches deny. Branch denial errors are *deliberately swallowed* within the OR — individual branch failures are not the client's concern; the overall denial is.
  - For `not`: thrown when the wrapped policy **allows** (so `not` denies).
- **Default (omitted):** `new createHttpError.Forbidden('Forbidden')` (403) — hard-coded, not mapped.
- **Instance reuse is safe:** `handleHttpError` (`error-handler.core.ts:133`) only reads `statusCode` and `message`; it never mutates the error. A single instance shared across requests is therefore safe to throw repeatedly. (A factory `() => HttpError` was considered for fresh per-denial stacks; the benefit is marginal and it is **not** part of this design. Revisit if request-scoped error mutation is ever introduced.)

### 4.4 Resolved: `anyOf` all-fail error

Previously an open question ("first / last / most-severe branch error?"). Resolved by `denialError`: when every branch denies, `anyOf` throws **its own** `denialError` (or the hard-coded 403), never a branch's. This removes the ambiguity entirely.

### 4.5 `errors` map

Remove the authorization mapper. Only the authentication mapper remains (the authenticator contract is unchanged in this workstream):

```ts
// src/core/types.core.ts
export type HandlerErrorMappers<TRequest extends Request<any, any, any, any> = Request> = {
    /** Override for authentication failures (missing/invalid auth context). */
    unauthenticated?: AuthErrorMapper<TRequest>;
};
```

`unauthorized` is removed. `AuthErrorMapper` itself is unchanged.

### 4.6 Authorization runtime

`executeAuthorizationStage` (`src/core/security.core.ts:126`) no longer takes or uses an `errors` param. It collapses to running each authorizer and letting thrown denials propagate:

```ts
export async function executeAuthorizationStage<...>(params): Promise<void> {
    const { req, auth, authorizers } = params;   // `errors` removed
    if (auth == null) {
        // optional access + no auth → skip authorization. (protected + null is
        // unreachable: executeAuthenticationStage already threw 401 first.)
        return;
    }
    for (const authorize of authorizers) {
        await authorize({ req, auth });   // denial throws HttpError → propagates to runtime catch
    }
}
```

Consequences:
- `AuthorizationExecutionParams` loses its `errors` field. It also likely loses its `TAccess`/`access` field — the only consumer was the removed protected-null throw; `if (auth == null) return;` no longer branches on access. (Confirm and drop during implementation.)
- The two `executeAuthorizationStage(...)` call sites in `createHandlerRuntime` (`create-handler.core.ts:402, 417`) stop passing `errors`.
- The previously defensive `auth == null && protected` 401 throw is removed (dead code — authentication handles it first).
- `executeAuthenticationStage` and its `errors.unauthenticated` usage are **unchanged**.
- `mergeHandlerSecurityDefaults` (`security.core.ts:273`) still shallow-merges `errors`; its logic is unchanged, only the `HandlerErrorMappers` type lost a key.

---

## 5. Test & governance plan

Per `docs/rules/create-handler-inference-policy.md` and `docs/rules/runtime-test-requirements.md`.

**Inference (compile-only, `src/core/__type-tests__`, enforced by `pnpm check`):**
- *Capability lane:* `Authorizer` is `=> MaybePromise<true>`; an authorizer returning `boolean`/`false` is a compile error (`@ts-expect-error`); `anyOf`/`not` accept an optional `HttpError` 2nd arg.
- *Interaction lane:* a throwing authorizer inside `anyOf` still lets the OR succeed via another branch (type-level shape of the composition).
- *Invariants/Regressions:* `HandlerErrorMappers` has exactly one key (`unauthenticated`); `unauthorized` is no longer assignable (`@ts-expect-error`).
- *Existing reuse-limitations file* (`authorizer-reuse-limitations.type-test.ts`): its request-typing assertions (`AfterAuthorizationRequest` enforcement) still hold; only its authorizer *definitions* change from boolean-returning to throw/`return true`. Update definitions, keep the `Extends`/`Fits` matrix.

**Runtime (`tests/core`, enforced by `pnpm test`):**
- `allOf`: first thrown denial propagates; all-allow returns.
- `anyOf`: continues past a thrown-`HttpError` branch; succeeds via a later branch; throws `denialError` (or 403) when all deny; propagates a non-`HttpError` throw unchanged.
- `not`: denies (throws) when wrapped policy allows; allows when wrapped policy denies; propagates unexpected throws.
- Combinator results integrate with the bucket runtime — a combinator used directly in `afterValidation`/`beforeValidation` throws its denial to the response.
- `executeAuthorizationStage`: a thrown `HttpError` from an authorizer reaches `handleError` and renders with the thrown status + message.
- Factory default-merge: `errors` still merges with only `unauthenticated`.

**Docs:** rewrite the authorizer / combinator / `errors` sections of `docs/create-handler-security-guide.md` for the throw model.

---

## 6. Files affected

**Core types** — `src/core/types.core.ts`: `Authorizer` return type; `HandlerErrorMappers` (drop `unauthorized`).
**Security core** — `src/core/security.core.ts`: `allOf` / `anyOf` / `not` (throw-aware + `denialError`); `AuthorizationExecutionParams` (drop `errors`); `executeAuthorizationStage` (simplify).
**Handler runtime** — `src/core/create-handler.core.ts`: drop `errors` from the two authz call sites; any options-interface types that reference `HandlerErrorMappers`.
**Type tests** — `src/core/__type-tests__/*` (capabilities, interactions, invariants, regressions; update `authorizer-reuse-limitations.type-test.ts` definitions).
**Runtime tests** — `tests/core/security.runtime.test.ts`, `tests/core/create-handler.runtime.test.ts`, `tests/core/create-handler-factory.runtime.test.ts`.
**Docs** — `docs/create-handler-security-guide.md`.
**Proving ground** — `src/features/books` and `src/shared/auth-stuff.ts` authorizers migrate to the throw model.
