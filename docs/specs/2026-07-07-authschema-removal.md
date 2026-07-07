# authSchema Removal — The Authenticator Owns Its Output

- **Date:** 2026-07-07
- **Status:** Approved (implemented).
- **Scope:** `src/core` framework primitives — remove `authSchema` from `SecurityOptions`, `SecuredSecurity`, `InheritedSecurity`, and `executeAuthenticationStage`. Remove the `JwtAuthSchema` fixtures and every `authSchema:` usage in features, type tests, runtime tests, and docs.
- **Relationship:** Successor to `2026-07-01-authenticator-redesign.md`, which deferred `authSchema` redesign to a separate workstream (§10 there). This workstream closes that deferral and completes the principle driving both prior error-model redesigns: each security primitive fully owns its own errors, and no auth error is owned by the framework.
- **Validation:** `pnpm check` (compile / inference, including a new `authSchema`-removed invariant), targeted core runtime tests.

---

## 1. Context & problem

The authenticator redesign (`2026-07-01-authenticator-redesign.md`) made the authenticator fully own its absence (`onMissingCredentials`) and failure (throw) outcomes, and removed the shared `errors` surface (`HandlerErrorMappers`). One framework-owned auth error survived: the **`authSchema` parse failure**, which threw a *fixed* framework default — `401 Unauthorized('Invalid authentication data')` (`security.core.ts`, pre-removal). That deferral is resolved here.

Three structural problems with `authSchema` as a framework field:

1. **It breaks the principle the redesign established.** The authenticator owns absence and failure, but not the validity of its own output. `authSchema` was the last framework-owned auth error — the exact category removed everywhere else.

2. **The framework cannot own this validation honestly.** The Contract validates body/query/params because those come from the client and the framework owns that boundary. Auth context is produced by the authenticator — a first-party function the framework already trusts to throw or resolve. Re-validating a schema-checkable subset of its output is security theatre: a buggy authenticator can return semantically-wrong data that still *passes* the schema. The framework can validate shape; it cannot validate trust.

3. **The canonical authenticator proves it fails wrong.** In `authenticateJwt`, `payload.email` (from a verified token) is used to look up the user, then `JwtAuthSchema` re-validates `{ email: string }`. The email is valid by construction. So `authSchema` can only ever fail if `UserRepository.getUser` returns a malformed object — a server-side bug — and the client receives `401 Invalid authentication data`. **The schema converts a 500 server bug into a 401 client auth error.** It hides bugs behind auth responses.

### Why not move it into `createAuthenticator` instead

Considered in depth (see brainstorming log). The alternative — `createAuthenticator(cb, { schema, onInvalidAuthData })` — was rejected:

- **Redundant in the dominant case** (authenticator fully controls its output): the callback's declared return type already asserts what the schema re-checks. Runtime-redundant with the static type by construction.
- **Composes worse in the only case where schemas matter** (external claims: OAuth/OIDC, federated JWT). Baking the schema into one authenticator couples it to one consumer; a shared "verify org token" authenticator cannot exist as a reusable `Authenticator` because each service needs its own claims subset. Removing `authSchema` lets consumers compose via authenticator chaining (`authenticateForBooks` calls a shared `verifyOrgToken` and narrows internally) — composition that the schema-baked variant actively fights.
- **Strictly more API surface** (a second error hook `onInvalidAuthData`) for ~3 lines of boilerplate savings in the rare case.

---

## 2. Goals & non-goals

**Goals**
- Remove `authSchema` from the framework security surface entirely.
- Make the authenticator the single source of its output's validity: if it needs schema validation, it performs it internally and throws the appropriate error.
- Lock the removal as a framework contract via a compile-time invariant (`SecurityOptions` no longer accepts `authSchema`).

**Non-goals**
- Backward compatibility (consistent with the prior auth redesigns — explicitly not a factor).
- A built-in `narrowAuthContext`/authenticator-combinator primitive (parked as a documented follow-up; see §4).
- `createAuthorizer` factory (separate workstream).

---

## 3. Design decision

**Remove `authSchema` entirely.** The framework has zero knowledge of auth schemas. If an authenticator wants schema validation, it lives inside the callback:

```ts
const authenticateJwt = createAuthenticator<JwtAuthContext>(
  async (req) => {
    const token = extractBearer(req);
    if (!token) return null;                                   // absence
    try {
      const payload = JwtUtils.verifyToken(token);             // failure
      return await UserRepository.getUser(payload.email);       // success
    } catch {
      throw createHttpError.Unauthorized("Invalid or expired token");
    }
  },
  { onMissingCredentials: () => new createHttpError.Unauthorized("Authentication required") },
);
```

For the external-claims case where schema validation is genuinely meaningful (verifying a token you did not issue), the consumer narrows inside the callback:

```ts
const authenticateForBooks = createAuthenticator<BooksAuthContext>(
  async (req) => {
    const claims = await verifyOrgToken(req);     // shared verifier
    if (!claims) return null;
    return BooksClaimsSchema.parse(claims);        // narrow + own the error
  },
);
```

This composes — `verifyOrgToken` remains a reusable authenticator, and each service narrows its own way without the schema being coupled to a single authenticator's options.

---

## 4. Explicit follow-up (deferred)

If the external-claims boilerplate (verify → narrow → throw on parse failure) materializes as a real repeated pattern in production use, build a **purpose-built combinator** rather than re-generalizing `createAuthenticator`:

```ts
// Hypothetical future primitive — NOT in this workstream.
const authenticateForBooks = narrowAuthContext(
  verifyOrgToken,                                   // Authenticator<RawClaims>
  BooksClaimsSchema,                                // ZodType<BooksAuthContext>
  () => new createHttpError.Unauthorized("malformed books claims"),
);
```

This would model the raw → trusted transform explicitly, which is the one place schema validation is genuinely meaningful. Do not build it preemptively — wait until the pattern is observed, then design the primitive against real usage. Re-adding a framework-level `authSchema` field is explicitly not the answer; the combinator keeps the authenticator as the error owner.

---

## 5. Changes made

- `src/core/types.core.ts`: removed `authSchema?: ZodType<TAuthContext>` from `SecurityOptions` (and its JSDoc); dropped the now-unused `ZodType` import.
- `src/core/security.core.ts`: removed the `authSchema` parse block from `executeAuthenticationStage` (it now returns `{ auth }` directly after the authenticator resolves a non-null context); updated the outcome-model JSDoc to state the authenticator is the single source of its output's validity.
- `src/core/create-handler.core.ts`: removed `authSchema` from `SecuredSecurity` and `InheritedSecurity` (and their JSDoc); stopped forwarding `authSchema` into `executeAuthenticationStage`.
- `src/shared/auth-stuff.ts`: removed `JwtAuthSchema` (no longer consumed anywhere), the `authSchema:` lines from both factories, and the now-unused `zod` import.
- `src/features/books/books.controller.ts`, `src/features/borrows/borrows.controller.ts`: minimal targeted removal of `authSchema:` usages (and now-unused imports). No other modernization.
- Tests: removed the `authSchema`-specific runtime tests; repurposed one into a test asserting the authenticator-owned output-validation error renders as the response; removed `authSchema` from all type-test fixtures; added a compile-time invariant that `SecurityOptions` no longer accepts `authSchema`.
- Docs: updated `docs/create-handler-security-guide.md` (removed all `authSchema`/`JwtAuthSchema` references; added "the authenticator owns its output validity" guidance) and `docs/rules/create-handler-inference-policy.md` (dropped "Auth schema usage" from the Interaction Lane dimensions).
- Historical specs (`2026-07-01-authenticator-redesign.md`, `-deferral.md`) left untouched as historical records; this spec supersedes their `authSchema`-deferral sections.

---

## 6. Validation

- `pnpm check` — type safety + all inference type-tests, including the new `authSchema`-removed `@ts-expect-error` invariant.
- Targeted runtime tests: `tests/core/security.runtime.test.ts`, `tests/core/create-handler.runtime.test.ts`, `tests/core/create-handler-factory.runtime.test.ts`.
- Books proving ground compiles and its auth-only flow is unchanged (the `authenticateJwt` authenticator never relied on the schema).
