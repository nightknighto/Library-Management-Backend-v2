# Authenticator Error-Model Redesign

- **Date:** 2026-07-01
- **Status:** Approved (awaiting implementation)
- **Scope:** `src/core` framework primitives — the `Authenticator` contract, the new `createAuthenticator` factory, `executeAuthenticationStage`, and removal of the shared `errors` surface (`HandlerErrorMappers` / `AuthErrorMapper` / the `errors` option).
- **Relationship:** Successor to `2026-07-01-authenticator-redesign-deferral.md` (which framed the problem) and companion to `2026-07-01-authorizer-error-model-redesign.md` (which already removed the authorization half of the `errors` map). This workstream completes the trajectory: both security primitives fully own their own errors.
- **Validation:** `pnpm check` (compile / inference), `pnpm test` (runtime).

---

## 1. Context & problem

The authenticator currently cannot express what real authentication needs, for three structural reasons (mirroring the authorizer's diagnosis):

1. **The authenticator cannot carry a specific failure reason.**
   `Authenticator<TAuth, TReq> = (req) => MaybePromise<TAuth | null | undefined>` (`src/core/types.core.ts:353`). The only non-success channel is `null`, which collapses every distinct client state — *no header*, *malformed header*, *valid token but user deleted* — into one indistinguishable "absence." The real `authenticateJwt` (`src/shared/auth-stuff.ts:16`) is already an incoherent hybrid: it *throws* `Unauthorized('Invalid or expired token')` for a bad token (specific!) but returns `null` for "no header", "malformed header", AND "user deleted" (three different states erased to one).

2. **The `errors` map is too coarse and overloaded.**
   `HandlerErrorMappers.unauthenticated` (`src/core/types.core.ts:565`) is consulted for *three* unrelated causes in `executeAuthenticationStage` (`src/core/security.core.ts:54`): no authenticator configured + protected, authenticator returned null + protected, and `authSchema` parse failure — the last of which has a *different* default message ("Invalid authentication data") but the same mapper key, so a developer overriding it unintentionally clobbers all three.

3. **Absence and failure are not distinguished at the contract level.**
   For `optional` access, "no credentials" is a legitimate state (`auth = undefined`); an authenticator *failure* (expired/revoked/malformed token) is an error. The current `null` return cannot tell them apart, so there is no principled answer to "should an expired token fail an optional request?"

### Root findings (from the analysis)

- **The throw channel already works.** `executeAuthenticationStage` has no try/catch around `await authenticate(req)` (`security.core.ts:76`), so a thrown `HttpError` already propagates to the runtime catch (`create-handler.core.ts:453`) and renders faithfully. This is proven in production by `authenticateJwt`'s bad-token throw.
- **`optional` already fails closed on throws.** Because there is no try/catch, an authenticator throw propagates *even in optional mode* today. This workstream codifies that as an explicit principle rather than an accident.
- **The no-credentials message is mechanism-specific.** "Missing Bearer token" / "Missing X-API-Key" / "No session cookie" are facts of the auth *mechanism*, known only to the authenticator author — not the handler that wires the authenticator.

---

## 2. Goals & non-goals

**Goals**
- Let authenticators distinguish *success* (resolve context), *absence* (resolve `null`), and *failure* (throw `HttpError` with a specific reason).
- Make the default "no credentials" error **authenticator-dictated** (single source of truth), so the reusable primitive carries its own correct default and consumers get right behavior with zero config.
- Codify the **fail-closed** principle: `optional` access swallows *absence* (`null`), never *failures* (throws always propagate).
- Introduce a `createAuthenticator` factory that fits the framework's `create*` convention **and** is an inference-stabilizing authoring API.
- Remove the now-redundant shared `errors` surface entirely.

**Non-goals**
- Backward compatibility (explicitly not a factor for this redesign).
- Blast-radius minimization (explicitly not a factor).
- `authSchema` redesign (its failure semantics stay a fixed default; deferred to a separate workstream).
- Authenticator combinators (composing multiple authenticators, e.g. try-JWT-then-API-key; deferred).

---

## 3. Design decisions

Five decisions were made during brainstorming; each is recorded with its rationale so it does not need to be re-derived.

### D1. Fail-closed on failures, even in `optional` mode

**Decision.** An authenticator *failure* (throw) propagates regardless of access mode. Only *absence* (`null`) is access-mode-dependent: swallowed for `optional`, escalated to a 401 for `protected`.

**Rationale.** Absence ≠ failure. A client that attached a credential is *asserting* an identity; silently degrading "expired token" to "anonymous guest" in optional mode produces the classic, near-impossible-to-debug "I'm logged in but treated as a guest" failure and is a security footgun. This is already today's runtime behavior (no try/catch around the authenticator); this decision codifies it. A developer who genuinely wants "optional = best-effort, downgrade broken tokens to anonymous" needs no framework flag — their authenticator simply `return null` for those cases instead of throwing. The `null`/throw choice is the authenticator's expressive tool.

### D2. Authenticator-dictated default no-credentials error (single source)

**Decision.** The default error for "absence on a protected route" is owned by the authenticator, not the handler. There is no handler-level override knob; if a consumer disagrees with a library authenticator's default, they wrap or replace it.

**Rationale (in order of weight for this framework-first repo):**
1. *Mechanism ownership.* "No credentials" is mechanism-specific. The authenticator author is the sole party who knows what absence means for their mechanism. A handler writing `security: { authenticator: jwtAuth }` should not separately need to know that JWT's absence message is "Missing Bearer token."
2. *Reuse (core AGENTS.md priority).* Authenticators are exported, shared, factory-bundled primitives. A reusable unit that carries its own correct default lets consumers wire it with zero config. Handler-dictated forces every consumer to re-declare a message about a mechanism they shouldn't have to understand.
3. *Symmetry with the authorizer.* Each security primitive owns its own denial semantics. The authorizer throws its denials; the authenticator declares its absence default.

### D3. `createAuthenticator` factory (callback-first)

**Decision.** Authenticators are authored via a new framework factory:
```ts
createAuthenticator(authenticate, options?)
```
- **Callback-first**, options-second (optional): `TAuth` is inferred from the callback's *return type*, which is argument 1.
- Returns a **callable** `Authenticator` (see D4).

**Rationale.** Fits the `createHandler` / `createContract` / `createHandlerFactory` naming convention, *and* is inference-stabilizing: the documented `TAuthContext`-degrades-to-`unknown` limitation (`docs/rules/create-handler-auth-inference-limitations.md`) arises from *backward* flow of `TAuthContext` from `security.authenticate` into the handler callback inside `createHandler`'s deep options. A dedicated factory has no backward flow — `TAuth` pins from the callback return directly. This directly addresses the repo's most painful known inference limitation.

### D4. Callable result shape (augmented function)

**Decision.** `Authenticator` is a callable function type with an attached optional property:
```ts
type Authenticator<TAuth, TRequest extends Request = Request> = ((
    req: TRequest,
) => MaybePromise<TAuth | null>) & {
    onMissingCredentials?: () => createHttpError.HttpError;
};
```

**Rationale.** A callable result keeps `security.authenticate` as a function-typed field (no field rename, minimal disruption to `SecurityOptions` and the runtime, which still calls `authenticate(req)`), while `.onMissingCredentials` carries the absence-default as auxiliary metadata. A plain function is still assignable to `Authenticator` (the object part is all-optional), so inline `security.authenticate = async (req) => ({...})` still type-checks with the existing param-annotation mitigation; `createAuthenticator` is the recommended inference-stable path and the only way to attach `onMissingCredentials`.

### D5. Remove the entire `errors` surface

**Decision.** With authenticator-dictated single-source defaults, `HandlerErrorMappers` loses its last key. Remove `HandlerErrorMappers`, `AuthErrorMapper`, and the `errors` field from `HandlerOptions`, `HandlerFactoryDefaults`, and `mergeHandlerSecurityDefaults`.

**Rationale.** Both security primitives now fully own their own errors (authorizer throws denials; authenticator declares `onMissingCredentials`). This is the logical endpoint of the trajectory that began with removing `unauthorized` in the authorizer redesign. Keeping an empty `errors` surface would be dead weight.

---

## 4. The new contract

### `Authenticator` type (`src/core/types.core.ts`)
```ts
export type Authenticator<TAuth, TRequest extends Request = Request> = ((
    req: TRequest,
) => MaybePromise<TAuth | null>) & {
    /**
     * The authenticator's own default error for "absent on a protected route".
     * Invoked by the runtime only when the authenticator resolves `null` and the
     * handler's access mode is `protected`. Optional; falls back to the framework
     * default `Unauthorized('Unauthenticated')`.
     */
    onMissingCredentials?: () => createHttpError.HttpError;
};
```
- Success → resolve `TAuth`.
- Absence → resolve `null` (`undefined` is dropped as a no-creds spelling: one canonical absence value).
- Failure → throw `HttpError` (status code and message become the response, mirroring the authorizer).

### `AuthenticatorOptions` and `createAuthenticator` (`src/core/security.core.ts`)
```ts
export type AuthenticatorOptions<TRequest extends Request = Request> = {
    onMissingCredentials?: () => createHttpError.HttpError;
};

export function createAuthenticator<TAuth, TRequest extends Request = Request>(
    authenticate: (req: TRequest) => MaybePromise<TAuth | null>,
    options?: AuthenticatorOptions<TRequest>,
): Authenticator<TAuth, TRequest> {
    return Object.assign(authenticate, options ?? {}) as Authenticator<TAuth, TRequest>;
}
```

---

## 5. Outcome model (fail-closed)

| Outcome | Signal | `optional` | `protected` |
|---|---|---|---|
| success | resolve `TAuth` | `auth = context` | `auth = context` |
| absence | resolve `null` | `auth = undefined` (anonymous) | `throw authenticator.onMissingCredentials?.() ?? Unauthorized('Unauthenticated')` |
| failure | **throw** `HttpError` | **propagates (fail-closed)** | propagates |
| no authenticator configured | — | anonymous | `throw Unauthorized('Unauthenticated')` (fixed; misconfiguration) |
| `authSchema` parse fails | — | `throw Unauthorized('Invalid authentication data')` (fixed; out of scope) | same |

---

## 6. Runtime behavior (`executeAuthenticationStage`)

`executeAuthenticationStage` drops its `errors` parameter and its `authSchema`-failure mapper usage. The control flow becomes:

```ts
const authenticate = security?.authenticate;

if (!authenticate) {
    if (access === 'protected') {
        throw new createHttpError.Unauthorized('Unauthenticated'); // fixed default
    }
    return {}; // optional: anonymous
}

const auth = (await authenticate(req)) ?? null;

if (auth === null) {
    if (access === 'protected') {
        throw authenticate.onMissingCredentials?.()
            ?? new createHttpError.Unauthorized('Unauthenticated'); // authenticator default, else framework
    }
    return {}; // optional: anonymous
}

let parsedAuth: TAuthContext;
try {
    parsedAuth = security?.authSchema ? await security.authSchema.parseAsync(auth) : auth;
} catch {
    throw new createHttpError.Unauthorized('Invalid authentication data'); // fixed (authSchema out of scope)
}

return { auth: parsedAuth };
```

Invariants preserved:
- No try/catch around `await authenticate(req)` — authenticator throws (failures) propagate verbatim, in both `optional` and `protected` mode.
- The runtime — not the authenticator — decides whether `null` is an error (`protected`) or a legitimate state (`optional`). The authenticator remains access-mode-agnostic.

---

## 7. Migration / files touched

- **`src/core/types.core.ts`**
  - `Authenticator` → callable + `{ onMissingCredentials? }` (drop `undefined` from the return union).
  - Add `AuthenticatorOptions`.
  - Remove `AuthErrorMapper` and `HandlerErrorMappers`.
  - `HandlerOptions`: remove the `errors` field.
- **`src/core/security.core.ts`**
  - Add `createAuthenticator`.
  - `executeAuthenticationStage`: drop `errors` param; rewire the three fallbacks per §6.
  - `AuthenticationExecutionParams`: drop `errors`.
  - `mergeHandlerSecurityDefaults`: drop the `errors` merge.
- **`src/core/create-handler.core.ts`**
  - Stop passing `errors` to `executeAuthenticationStage`; drop the local `errors` binding.
- **`src/core/create-handler.core.ts` (`HandlerFactoryDefaults`)**
  - Drop `errors` from the defaults shape and the factory merge.
- **`src/shared/auth-stuff.ts`**
  - `authenticateJwt` → `createAuthenticator(async (req) => {...}, { onMissingCredentials: ... })`.
  - `createJwtAuthHandler` / `createJwtAuthHandler2`: drop the `errors` field.
- **`src/features/books/books.controller.ts`** and **`src/features/borrows/borrows.controller.ts`**
  - Drop any `errors.unauthenticated` usages (minimal targeted fix per AGENTS.md; no unrelated modernization).

---

## 8. Inference considerations

- **`createAuthenticator` is inference-stable by construction**: `TAuth` is inferred from the callback return (argument 1), with no backward flow into a handler signature. This should infer reliably where the inline-in-`createHandler` form degrades to `unknown`.
- **Inline plain functions still type-check** as `Authenticator` (the `onMissingCredentials?` object part is all-optional, so any function satisfies the intersection). They retain the existing param-annotation mitigation documented in `docs/rules/create-handler-auth-inference-limitations.md`.
- **MUST empirically verify** `createAuthenticator`'s inference during implementation (callback-first `TAuth` pinning, `MaybePromise<TAuth | null>` narrowing, plain-fn assignability to the callable+property intersection). Cannot be tested at spec time.

---

## 9. Testing requirements

Per AGENTS.md, every typing/runtime change to core must be covered.

### Runtime (`tests/core/`)
- **`security.runtime.test.ts`** — authenticator scenarios across the access-mode × outcome matrix:
  - success → context flows to handler (optional and protected).
  - absence (`null`) → optional: anonymous; protected: `onMissingCredentials` invoked when present, framework default otherwise.
  - failure (throw) → propagates in **both** optional and protected (fail-closed verification — the central behavioral test).
  - no authenticator + protected → fixed default.
  - authSchema parse failure → fixed default.
  - `createAuthenticator` attaches `onMissingCredentials` and it is invoked by the runtime.
- **`create-handler.runtime.test.ts`** — end-to-end auth flow; `auth` typing/shape for protected/optional/public.
- **`create-handler-factory.runtime.test.ts`** — factory no longer accepts `errors`; authenticator default inherited via the factory.

### Type tests (`src/core/__type-tests__/`)
Update `capabilities`, `interactions`, `invariants`, `regressions` lanes per `docs/rules/create-handler-inference-policy.md`:
- `HandlerErrorMappers` and the `errors` option are gone (no longer assignable — `@ts-expect-error`).
- `Authenticator` is callable and has an optional `onMissingCredentials`.
- `createAuthenticator` infers `TAuth` from the callback return (no explicit generic needed).
- `createAuthenticator(...).onMissingCredentials` is typed when provided, `undefined` when omitted.
- A plain function is still assignable to `Authenticator`.
- `HandlerOptions` / factory options no longer accept `errors`.

---

## 10. Out of scope (deferred)

- **`authSchema` redesign** — its parse-failure path keeps a fixed framework default. The deeper question of whether schema failure should be a thrown specific error, a dedicated mapper, or reframed as response-context validation is left to a separate workstream.
- **Authenticator combinators** — composing multiple authenticators (e.g. try-JWT-then-API-key) is not introduced here. The factory's `options` object is extensible so future fields can be added without signature changes.
- **`optional`-mode swallow-on-failure opt-in** — not added. The fail-closed default (D1) is correct for the overwhelming majority of cases; the authenticator's own `return null` is the escape hatch for the rare best-effort case.

---

## 11. Validation checklist (definition of done)

- `pnpm check` passes with 0 errors.
- `pnpm test` passes (runtime + existing suites).
- `createAuthenticator` inference verified empirically (TAuth from callback return).
- Books proving-ground behavior validated.
- `errors` surface fully removed (no dangling references).
- Security guide and inference-policy docs updated for the new model.
- Single commit at the end of the workstream.
