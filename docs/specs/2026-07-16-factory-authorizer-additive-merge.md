# Factory Authorizer Additive Merge

**Date:** 2026-07-16
**Status:** Implemented — validated via `tsc` + runtime suite (107/107 pass, lint clean)
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

The previous per-bucket **replace** semantics were a security footgun: a developer writing

```ts
factory(contract, fn, {
    security: { authorize: { afterValidation: [myCheck] } },
});
```

**silently erased** every baseline check the factory placed in `afterValidation`.
The failure mode pointed the wrong way — it weakened security, invisibly, at the call
site furthest from where the baseline was defined. The runtime test at
`tests/core/create-handler-factory.runtime.test.ts` (the `additive semantics` case)
previously locked this behavior in as a feature.

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

1. **`src/core/security.core.ts` — `mergeHandlerSecurityDefaults`** (function
   defined around line 369). The `authorize` merge now concatenates buckets instead
   of spread-replacing them. When neither side defines a bucket, it stays
   `undefined`. When only one side defines a bucket, that side wins as-is (concat
   with an empty array is a no-op).

2. **`src/core/security.core.ts` JSDoc** (the block preceding
   `mergeHandlerSecurityDefaults`, around lines 353-368). The previous
   *"per bucket replaces / never concatenated"* wording has been replaced with the
   additive contract: buckets concatenate factory-first; no dedup; scalars
   override. It states explicitly that re-declaring a baseline authorizer at the
   call site runs it twice.

3. **`src/core/create-handler.core.ts` JSDoc — `createHandlerFactory` "Merge rules"
   block** (around lines 695-709, preceding the `createHandlerFactory` overloads).
   Updated to match: `access` overrides; `authenticate` overrides; `authorize`
   buckets concatenate (additive). A JSDoc `@example` shows a factory-baseline
   authorizer and an instance authorizer both running.

### Tests (`tests/core`)

4. **`tests/core/create-handler-factory.runtime.test.ts` — the `additive semantics`
   case** (previously the `replace semantics` test). Formerly named *"handler
   authorize bucket replaces the factory default bucket (replace semantics)"*, which
   asserted the **opposite** of the new behavior. It is now named *"handler
   authorize bucket concatenates with the factory default bucket (additive
   semantics)"*. The factory defines a `denyPolicy` in `afterValidation` that always
   denies; the instance defines its own `allowPolicy` in `afterValidation`. Under
   additive concatenation the bucket runs factory-first, so:
    - `denyPolicy` runs first and short-circuits to HTTP 403 with body
      `{ success: false, error: 'factory-deny' }`.
    - The instance's `allowPolicy` is **never called** (the factory deny already
      short-circuited).

   The test asserts: status `403`, body `{ success: false, error: 'factory-deny' }`,
   `denyPolicy` called exactly once, and `allowPolicy` **not** called. This is the
   security improvement being demonstrated: under the **old** replace semantics the
   instance's `allowPolicy` bucket would have **erased** the factory's `denyPolicy`,
   so the request would have wrongly succeeded; under the **new** additive semantics
   the factory's `denyPolicy` still runs (factory-first) and short-circuits to 403 —
   so the baseline deny can no longer be silently erased by an instance that merely
   supplies its own `afterValidation` bucket. The companion `inherits` test and the
   cross-bucket coexistence test stay green unchanged.

5. **New runtime test** — *"concatenates factory and instance authorizers across
   buckets with no dedup"*. A `sharedPolicy` (the same authorizer reference) is
   declared in the factory's `beforeValidation` **and** in the instance's
   `afterValidation`. Because buckets concatenate and there is no dedup, the same
   reference runs once per bucket it appears in — the test asserts
   `sharedPolicy` is called **twice**, locking in no-dedup.

## Inference / Type-Test Policy

Per `docs/rules/create-handler-inference-policy.md`: this change is **runtime merge
behavior only** — no handler / contract / security *typing* surface changes. The
`AuthorizationConfig` and `SecurityOptions` types are untouched. Therefore **no new
type-test is required**, and existing type-tests stay green.

## Validation

- `tsc` / `pnpm check` — type safety across core + touched inference tests.
- `pnpm test tests/core/create-handler-factory.runtime.test.ts` — the flipped + new
  tests. Full suite passes 107/107; lint is clean for the changes.
- **Books proving ground:** `src/features/books/books.controller.ts` uses
  `createJwtAuthHandler` (factory sets only `authenticate`; instance sets `authorize`).
  Since the factory defines no baseline authorizer, concat is a no-op there — books
  behavior is unchanged, confirmed via the books test suite.

## Out of Scope (Intentionally Not Touched)

- `borrows` and other secondary features — unchanged; no factory there defines
  baseline authorizers either.
- `createHandler` (non-factory) — has no defaults concept, no merge path, untouched.
- No dedup logic; no escape-hatch replace flag (pure additive + no dedup was chosen).

## Breaking-Change Note

This is a behavior change to a security primitive. Factories that define baseline
`authorize` buckets now see those baselines **kept and run** when an instance also
supplies the same bucket, instead of being replaced.

**Blast-radius check performed:** no existing call site in this codebase is
affected. Both real factories (`createJwtAuthHandler` in `src/shared/auth-stuff.ts`,
`createProtectedHandler` in `src/features/borrows/borrows.controller.ts`) set only
`authenticate`, never `authorize`. All authorizers in the codebase live at the
instance call site, so there was nothing to replace.

The change is called out explicitly here and in the implementing commit because it
alters a documented security contract (the JSDoc on
`mergeHandlerSecurityDefaults` and the runtime `additive semantics` test).

## Implementation Status

This change has been implemented as specified above:
`mergeHandlerSecurityDefaults` was rewritten to additive concatenation, the JSDoc on
that function and on `createHandlerFactory` in `src/core/create-handler.core.ts` was
updated, and the runtime tests were rewritten/added accordingly. Validated via `tsc`
(green), the full runtime suite (107/107 pass), and clean lint for the changes.
