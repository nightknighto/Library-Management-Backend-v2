# Authenticator Contract — Redesign Deferral

- **Date:** 2026-07-01
- **Status:** Deferred (this document seeds the future redesign; no implementation yet)
- **Relationship:** Companion to `2026-07-01-authorizer-error-model-redesign.md`. The authorizer workstream is approved and proceeding; the authenticator is intentionally **not** part of it.

---

## 1. Why this exists

The authorizer error-model redesign adopts a throw-based model: an authorizer returns `true` to allow and throws an `HttpError` to deny, so every denial carries an explicit reason. The same philosophical pressure applies to the **authenticator** — the original motivation for revisiting errors was that *"authenticators have many failure paths that would need the authenticator to respond with what the failure reason is."* Real authenticators distinguish "no token", "expired token", "revoked token", "malformed token", "wrong tenant" — none of which the current model can express individually.

This document records **why the authenticator was deferred**, **how it relates to the authorizer changes**, and **the open questions its future redesign must answer**, so the work picks up from a known starting point rather than being re-derived.

---

## 2. Why it is deferred (not skipped)

The authenticator has one structurally distinct case that the authorizer does not, and resolving it is its own design decision:

> **For `optional` access, "no credentials present" is *not* an error — it is a legitimate state (auth is simply `undefined`).**

An authorizer never has this shape: it runs only when auth exists, and denial is always meaningful. An authenticator, by contrast, must distinguish three things:

1. Valid credentials → produce auth context.
2. No credentials at all → for `protected`, this *is* an error (401); for `optional`, this is *fine* (`auth = undefined`).
3. Invalid/expired/revoked credentials → always an error, with a **specific** reason.

Folding the authenticator into the authorizer workstream would have forced a rushed answer to (2). It is deferred so the authorizer redesign can land cleanly, and the authenticator can be designed with the optional-access edge case given proper attention.

---

## 3. Current authenticator contract (the baseline to revise)

```ts
// src/core/types.core.ts:353
export type Authenticator<TAuthContext, TRequest extends Request = Request> = (
    req: TRequest,
) => MaybePromise<TAuthContext | null | undefined>;
```

Execution in `executeAuthenticationStage` (`src/core/security.core.ts:60`):

| Outcome | Current behavior |
|---|---|
| No authenticator configured + `protected` | throw `errors.unauthenticated ?? 401 Unauthorized('Unauthenticated')` |
| Authenticator returns `null`/`undefined` + `protected` | throw `errors.unauthenticated ?? 401 Unauthorized('Unauthenticated')` |
| `authSchema` provided and `parseAsync` fails | throw `errors.unauthenticated ?? 401 Unauthorized('Invalid authentication data')` |
| Authenticator returns `null` + `optional` | succeed with `auth = undefined` |

Three different failure causes collapse to **one** mapper (`unauthenticated`) with **one** generic message. This is the same coarseness problem the authorizer redesign solves for authorization.

---

## 4. How the authenticator relates to the authorizer changes

Two concrete touchpoints already shift as part of the authorizer workstream:

1. **The `errors` map loses its authorization half.** After the authorizer redesign, `HandlerErrorMappers` keeps only `unauthenticated` (authn) — `unauthorized` (authz) is removed. So when the authenticator redesign begins, the `errors` map is already a single-key, authn-only surface. Whatever the authenticator redesign decides, it does **not** have to coordinate with an authz mapper that no longer exists.

2. **The throw-channel is already proven and primary.** The authorizer redesign establishes that thrown `HttpError`s propagate from security callbacks to `handleError` and render faithfully. The authenticator can adopt the exact same channel for specific failure reasons (e.g. `throw new Unauthorized('Token expired')`) without any new runtime machinery — `executeAuthenticationStage` already has no try/catch around `await authenticate(req)` (`security.core.ts:82`), so an authenticator throw already propagates today.

In short: the authorizer redesign leaves the authenticator with a clean, single-mapper `errors` surface and a working throw-channel — exactly the runway its redesign needs.

---

## 5. Open questions for the future redesign

These are the decisions the authenticator workstream will need to make. They are recorded here, not answered.

1. **Failure-reason channel.** Should an authenticator throw `HttpError` for specific failure reasons (mirroring the authorizer model), and what then becomes the return type on success? Candidates: keep `=> MaybePromise<TAuth | null>` (null = no-credentials, throw = specific failure), or move to a richer result type.
2. **The optional-access "no credentials" case.** How must `null`/`undefined` be distinguished from a *failure*? Likely: `null`/`undefined` continues to mean "no credentials" (legitimate for `optional`, error for `protected`), and *failures* are always throws. Confirm.
3. **`protected` + no credentials.** Today this throws via the `unauthenticated` mapper. If throwing becomes the authenticator's job, does the authenticator throw for "no credentials on a protected route", or does the *runtime* still own the "protected but no auth" 401? (The authenticator does not know the access mode; the runtime does. This argues the runtime keeps the no-credentials 401.)
4. **`authSchema` parse failure.** Currently a `unauthenticated` 401. Should it become a specific thrown error, stay a generic 401, or move to a dedicated mapper?
5. **Does `errors.unauthenticated` survive?** If authenticators throw for specific failures, `unauthenticated` becomes a fallback-only mapper (parallel to how `unauthorized` became redundant and was removed). Decide whether to keep it as a fallback or remove it entirely — and whether the runtime's "protected but no credentials" 401 is its last remaining consumer.
6. **Consistency with the authorizer model.** If authorizers are throw-based and authenticators are throw-based, the two security callbacks share one idiom — desirable for framework coherence. The authenticator's `optional`-access asymmetry is the only blocker.

---

## 6. Non-goals of this document

- This is **not** a decision to remove the `unauthenticated` mapper. It survives the authorizer workstream unchanged and its fate is itself an open question (§5.5) for the authenticator workstream.
- This document does not prescribe an authenticator return type or combinator-equivalent. It only frames the problem.
