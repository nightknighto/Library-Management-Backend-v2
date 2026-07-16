# Factory Authorizer Additive Merge

**Date:** 2026-07-16
**Status:** Design — deferred (a related change will be planned first; both will be implemented together)
**Surfaces:** `src/core` (framework primitive), `tests/core` (runtime)

## Summary

Change `createHandlerFactory` authorizer merging from **per-bucket replace** to
**pure additive concatenation with no dedup** for the `beforeValidation` and
`afterValidation` buckets. Scalar fields (`access`, `authenticate`) keep override
semantics.

## Motivation

Authorizers are AND-composed monotonic policies, not scalar settings. The natural
operation on a baseline policy stack is *"also require this,"* the same way Express
middleware or a policy engine accumulates rules.

Today's per-bucket **replace** semantics are a security footgun: a developer writing

```ts
factory(contract, fn, {
    security: { authorize: { afterValidation: [myCheck] } },
});
```

**silently erases** every baseline check the factory placed in `afterValidation`.
The failure mode points the wrong way — it weakens security, invisibly, at the call
site furthest from where the baseline was defined. The runtime test at
`tests/core/create-handler-factory.runtime.test.ts:173` currently locks this
behavior in as a feature.

If an endpoint needs a genuinely different security profile (e.g. it must drop a
baseline check), that is a different security posture and should be declared
explicitly by using a different factory or raw `createHandler` — not achieved by
accidental omission at the call site.

## Final Merge Contract

For each bucket independently:

```
final.beforeValidation = [...factory.beforeValidation, ...instance.beforeValidation]
final.afterValidation  = [...factory.afterValidation,  ...instance.afterValidation]
```

- **No dedup.** If the same authorizer reference appears in both layers, it runs
  twice. The author owns that responsibility. (Side-effectful authorizers — audit,
  metrics, rate-limit counters — are valid under the `authorize` contract; dedup
  would hide intentional repetition, and the framework deliberately does not
  second-guess the author's declaration.)
- **Order:** factory baseline first, instance layered on after — mirrors the mental
  model *"baseline applies to everyone, and this endpoint additionally requires…"*
- **Scalars override (unchanged):** `access = instance ?? factory`;
  `authenticate = instance ?? factory`.

## Scope of Edits

### Framework level (`src/core`)

1. **`src/core/security.core.ts` — `mergeHandlerSecurityDefaults` (lines 366-394).**
   Rewrite the `authorize` merge so buckets concatenate instead of spread-replace.
   When neither side defines a bucket, it stays `undefined`. When only one side
   defines a bucket, that side wins as-is (concat with an empty array is a no-op).

2. **`src/core/security.core.ts` JSDoc (lines 353-365).** Replace the
   *"per bucket replaces / never concatenated"* wording with the additive
   contract: buckets concatenate factory-first; no dedup; scalars override.
   State explicitly that re-declaring a baseline authorizer at the call site runs
   it twice.

3. **`src/core/create-handler.core.ts` JSDoc — `createHandlerFactory` "Merge rules"
   block (lines 701-704).** Update to match: `access` overrides; `authenticate`
   overrides; `authorize` buckets concatenate (additive). Add a JSDoc `@example`
   showing a factory-baseline authorizer and an instance authorizer both running.

### Tests (`tests/core`)

4. **`tests/core/create-handler-factory.runtime.test.ts:173`** — currently named
   *"handler authorize bucket replaces the factory default bucket (replace
   semantics)"*. This asserts the **opposite** of the new behavior. Rewrite it as
   *"handler authorize bucket concatenates with the factory default bucket
   (additive semantics)"* and assert that **both** the factory's `denyPolicy` AND
   the instance's `allowPolicy` are reached — so the factory's deny now correctly
   short-circuits to 403, demonstrating that baselines can no longer be silently
   erased. The companion tests at `:141` (inherit) and `:215` (cross-bucket
   coexistence) stay green unchanged.

5. **Add one new runtime test:** factory defines a baseline authorizer in
   `beforeValidation`, instance adds one in `afterValidation` — assert both run;
   and assert that the *same* authorizer reference re-declared at both layers runs
   twice (locks in no-dedup).

## Inference / Type-Test Policy

Per `docs/rules/create-handler-inference-policy.md`: this change is **runtime merge
behavior only** — no handler / contract / security *typing* surface changes. The
`AuthorizationConfig` and `SecurityOptions` types are untouched. Therefore **no new
type-test is required**, and existing type-tests stay green.

## Validation Plan

- `pnpm check` — type safety across core + touched inference tests.
- `pnpm test tests/core/create-handler-factory.runtime.test.ts` — the flipped + new tests.
- **Books proving ground:** `src/features/books/books.controller.ts` uses
  `createJwtAuthHandler` (factory sets only `authenticate`; instance sets `authorize`).
  Since the factory defines no baseline authorizer, concat is a no-op there — books
  behavior is unchanged. Confirm via the books test suite.

## Out of Scope (Intentionally Not Touched)

- `borrows` and other secondary features — unchanged; no factory there defines
  baseline authorizers either.
- `createHandler` (non-factory) — has no defaults concept, no merge path, untouched.
- No dedup logic; no escape-hatch replace flag (pure additive + no dedup was chosen).

## Breaking-Change Note

This is a behavior change to a security primitive. Factories that define baseline
`authorize` buckets will now see those baselines **kept and run** when an instance
also supplies the same bucket, instead of being replaced.

**Blast-radius check performed:** no existing call site in this codebase is
affected. Both real factories (`createJwtAuthHandler` in `src/shared/auth-stuff.ts`,
`createProtectedHandler` in `src/features/borrows/borrows.controller.ts`) set only
`authenticate`, never `authorize`. All authorizers in the codebase live at the
instance call site, so there is nothing to replace today.

The change must still be called out explicitly in the implementing commit / report
because it alters a documented security contract (the JSDoc on
`mergeHandlerSecurityDefaults` and the runtime test at `:173`).

## Implementation Sequencing

This spec is intentionally **deferred**. A related change will be planned first,
and the two will be implemented together (their edits to
`mergeHandlerSecurityDefaults`, its JSDoc, and the factory runtime tests may
overlap and should be coordinated in a single implementation pass).
