# Query-Channel Authorizer Requirement Leak — Deferred

- **Date:** 2026-07-19
- **Status:** ⏳ **Deferred** — known limitation, not yet fixed. Documented here
  so a future session can start from the known root cause instead of
  re-deriving it.
- **Relationship:** Discovered while implementing
  [`2026-07-19-factory-authorizer-shape-propagation.md`](./2026-07-19-factory-authorizer-shape-propagation.md).
  That fix closes the `.extend()` / factory-baseline authorizer-shape gap for
  the `params` and `body` channels. The `query` channel is a separate,
  pre-existing leak that this doc tracks.
- **Canonical reference:** `src/core/__type-tests__/authorizer-reuse-limitations.type-test.ts`
  §3c (the `_g_queryLeak` assertion documents this as a known leak).

## The leak

An authorizer typed against a partial request shape declares a requirement the
contract must satisfy. This is enforced by TypeScript's function-parameter
contravariance. Enforcement is **per-channel**, and depends on what
`AuthorizerBaseRequest` (the base that `AfterAuthorizationRequest` intersects
with) puts in each slot:

| Channel | `AuthorizerBaseRequest` slot | Requirement enforced? |
|---|---|---|
| `params` | `Record<string, string>` (index signature) | ✅ Yes |
| `body` | `unknown` | ✅ Yes |
| `query` | `any` | ❌ **No** |

Because `AuthorizerBaseRequest.query` is `any`, and `any` is assignable to
everything, **every** contract's `AfterAuthorizationRequest['query']` satisfies
**any** query-channel requirement. A query-bound authorizer like
`Authorizer<Auth, Request<any, any, any, { dryRun: boolean }>>` installs into a
contract that has no `dryRun` query field without error — the requirement leaks.

This is true for **all** authorizer installation paths (direct `createHandler`,
factory baseline, and `.extend()`), not just the new shape-propagation feature.

## Root cause

`src/core/create-handler.core.ts`:

```ts
type AuthorizerBaseRequest = Request<Record<string, string>, any, unknown, any>;
```

The fourth type argument (`query`) is `any`. Changing it to `unknown` (mirroring
`body`) or to `Record<string, unknown>` would close the leak — `unknown` is not
assignable to a specific shape like `{ dryRun: boolean }`, so the contravariance
check would fire.

## Why it is deferred (not fixed alongside the `.extend()` work)

Closing the leak is a broader change than the `.extend()` / factory-baseline fix:

1. **Blast radius.** Every authorizer installation path is affected, not just
   factories. Any existing authorizer that happens to read `req.query` without
   declaring a requirement (relying on the implicit `any`) could surface new
   type errors across `src/features/**` and consumer code.
2. **Interaction with query widening.** The 2026-07-17 query-widening work
   (`docs/specs/2026-07-17-query-widening-and-accessor.md`) made `request.query`
   accept `z.ZodObject`. The interaction between a tightened `AuthorizerBaseRequest.query`
   and the pagination-injected `page`/`limit` fields needs separate analysis.
3. **Scope discipline.** The reported issue was the `.extend()` error; the
   query leak is a pre-existing, separately-documented limitation. Mixing them
   would expand scope and risk.

## What a fix would involve

1. Change `AuthorizerBaseRequest.query` from `any` to `unknown` (or
   `Record<string, unknown>`).
2. Update the enforcement matrix in
   `src/core/__type-tests__/authorizer-reuse-limitations.type-test.ts` §3c —
   the `_g_queryLeak` assertion would flip from "LEAK" to "ENFORCED", and new
   positive/negative query assertions added.
3. Audit `src/features/**` for authorizers that read `req.query` without a
   declared requirement and add the requirement (or accept the new error as
   correct).
4. Verify the pagination query fields (`page`/`limit`) still flow correctly
   when the base is tightened.
5. Add a CHANGELOG entry and update this doc's status to **Resolved**.

## Suggested priority

Low-to-medium. The leak only bites callers who install a query-bound reusable
authorizer and expect enforcement — a relatively advanced pattern. The
`.extend()` fix (which covers the more common `params`/`body` cases) is the
higher-value change and is now shipped.
