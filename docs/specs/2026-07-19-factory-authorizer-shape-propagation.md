# Factory Authorizer Shape Propagation

**Date:** 2026-07-19
**Status:** Implemented — type-level fix verified via `pnpm check` (inference tests) and runtime tests; consumers (`src/features/books`, `src/shared`, `src/features/borrows`) compile unchanged. Rejection-message DX iteration: the `Checked` branded property carries a self-contained, human-readable explanation (see [Descriptive rejection message](#descriptive-rejection-message)).
**Surfaces:** `src/core/create-handler.core.ts` (types only — no runtime change), `src/core/__type-tests__` (inference), `tests/core` (runtime).
**Relationship:** Extends the factory-extends-factory capability shipped on 2026-07-17 (`docs/specs/2026-07-17-changelog.md`). The query-channel authorizer leak it does **not** close is tracked in `docs/specs/2026-07-19-query-channel-authorizer-leak.md`.

## Summary

An authorizer typed against a partial request shape — e.g.
`Authorizer<Auth, Request<{ isbn: string }, any, unknown, any>>` — declares a
requirement that the contract passed to a factory must satisfy. Before this
change, installing such an authorizer via `.extend()` or `createHandlerFactory`
defaults produced a TypeScript error **at extension/creation time**, because the
authorizer-bucket types were constrained to plain `Request`.

The deeper issue: a factory does not have *a* contract — it produces handlers for
many. So the requirement cannot be checked against a single contract at
factory-creation time. It must instead be **captured** into a `TReq` type
parameter and **enforced at each invocation**, where the contract's
`AfterAuthorizationRequest` is known.

## The fix

A new `TReq extends Request = Request` type parameter threads through
`SecuredFactory`. It defaults to plain `Request` (no requirement), so factories
without shape-bound authorizers are completely unaffected. When a shape-bound
authorizer is installed, `TReq` captures its required shape and the factory's
call signatures enforce that the contract's `AfterAuthorizationRequest` is
assignable to `TReq`.

### Mechanism

Four cooperating internal helpers (top of SECTION 5 in `create-handler.core.ts`):

1. **`ExtractAfterReq<T>`** — extracts the required `Request` shape from an
   `afterValidation` authorizer array via `infer R` on each `Authorizer`.
2. **`ExtractAuthorizeReq<TAuthorize>`** — lifts that to a full `authorize`
   config (`{ afterValidation?: ... }`).
3. **`AnyReqAuthorizeConfig<TAuth>`** — the widened constraint. Authorizers are
   contravariant in their `TRequest`: `Authorizer<Auth, Request<{isbn:string},...>>`
   is **not** assignable to `Authorizer<Auth, Request>` (plain Request.params is
   `ParamsDictionary`, an index signature with no named `isbn`). Using plain
   `Request` would reject the very authorizers this feature supports. Widening
   to `Request<any, any, any, any>` satisfies contravariance for any Request
   specialization (because `any` is assignable to everything) while inference
   still captures the concrete shape.
4. **`Checked<TContract, TReq>`** — the call-site enforcement. A conditional
   that returns `TContract` unchanged when its `AfterAuthorizationRequest` is
   assignable to `TReq`, otherwise adds a required branded property so the
   contract is rejected. Wrapping the contract parameter in this conditional
   preserves `TContract` inference (call-site generics still infer the original
   contract type). The branded property's **name** is a self-contained,
   human-readable explanation (see [Descriptive rejection message](#descriptive-rejection-message)).

### Descriptive rejection message

The branded property's name is the rejection message itself:

```
[ERROR] Contract rejected: this factory has an afterValidation authorizer that
requires a request field (e.g. a params/body/query field) the contract does not
provide. Make the contract define the field(s) the authorizer reads.
```

TypeScript echoes the property name verbatim in the diagnostic, so the developer
reads the explanation directly in the error. This is the only mechanism
available for factory-path enforcement: the conditional evaluates against a
contract parameter, and TypeScript cannot trace a failed `extends` inside a
conditional back to *which* field was missing. Direct `createHandler` (Path A)
does not go through `Checked` — its authorizer bucket is checked inline via
contravariance, producing the natural structural error (`Authorizer<Auth,
Request<{isbn: string}>>` not assignable) with no branded property.

Constraints on the message text:

- **Self-contained**: no links. The consuming project's tooling surfaces only
  the literal text; this repo's `docs/specs/...` paths are not present in a
  consumer's checkout.
- **ASCII marker**: `[ERROR]` prefixes the message for visual salience. No
  unicode glyphs (some terminals/editors render them inconsistently).
- **Required property**: the property must be `unique symbol`-typed and
  required. An optional marker (`prop?: true`) satisfies every object and
  silently passes the check.

Guarded by inference tests in `create-handler.capabilities.type-test.ts`
("descriptive rejection message" section): the message text must be a key of
the `Checked`-wrapped contract parameter on both the factory and extended-
factory paths, and a cryptic name (`__unsatisfiedAuthorizerReq`) must NOT be
present.

### Surface changes

- `SecuredFactory<TAuth, TDefaultAccess, TReq extends Request = Request>` — the
  contract parameter of the no-options / protected / optional overloads is now
  `Checked<TContract, TReq>`. The public-override overload is unchanged
  (public handlers run no security pipeline).
- `SecuredFactory.extend<TAuthorize>(...)` — generic in the passed authorize
  config; returns `SecuredFactory<TAuth, TNewAccess, TReq & ExtractAuthorizeReq<TAuthorize>>`.
  Chains accumulate requirements via intersection.
- `PublicFactory.extend<TAuth, TAuthorize>(...)` — the upgrade path; the
  resulting secured factory's `TReq` is `ExtractAuthorizeReq<TAuthorize>`.
- `createHandlerFactory<TAuth, TAuthorize>(...)` — overloads capture `TAuthorize`
  from `defaults.security.authorize` and seed the factory's `TReq`.
- `HandlerFactoryDefaults`, `SecuredFactoryExtension`, `PublicFactoryUpgrade` —
  `authorize` is generic in `TAuthorize` (constraint `AnyReqAuthorizeConfig<TAuth>`).

### What contributes to `TReq`

Only `afterValidation` authorizers. `beforeValidation` policies run against a
plain `Request` before validation, so they cannot impose a contract-bound
requirement and do not contribute to `TReq` (verified by capability test).

## Known limitation: explicit type arguments block `TAuthorize` inference

`createHandlerFactory<AuthContext>({ ... security: { authorize: {...} } })` —
when the caller supplies an explicit type argument for `TAuth`, TypeScript
cannot also infer `TAuthorize` (type arguments are all-or-nothing per call).
`TAuthorize` then falls back to its default and `TReq` stays plain `Request`,
so baseline shape enforcement is lost.

This is a fundamental TypeScript inference limitation, not a bug in the fix. The
idiomatic workaround is the `.extend()` path, which needs no explicit type
argument and infers `TAuthorize` correctly:

```ts
// TAuth specified once on the base (authenticate is reusable).
const jwtFactory = createHandlerFactory<AuthContext>({
  access: 'protected',
  security: { authenticate: authenticateJwt },
});

// .extend() infers TAuthorize from the passed authorizers — no type arg needed.
const ownerFactory = jwtFactory.extend({
  security: { authorize: { afterValidation: [requireIsbn] } },
});
```

Baseline enforcement via `createHandlerFactory` **does** work when `TAuth` is
inferred inline (no explicit type arg) — see the capability test
`_baselineReqFactory`.

## Validation

- `pnpm check` — clean (all compile-only inference tests pass).
- `tests/core/create-handler-factory.runtime.test.ts` — 17/17 pass, including a
  new runtime guard proving shape-bound child authorizers run against the
  validated request at runtime (the type-level change is accompanied by correct
  runtime behavior — unchanged, but guarded).
- Consumers (`src/features/books/books.controller.ts`, `src/shared/auth-stuff.ts`,
  `src/features/borrows/borrows.controller.ts`) compile unchanged — the change
  is additive (new generic with a default) and required zero consumer edits.

### Inference test coverage

- **Capability lane** (`create-handler.capabilities.type-test.ts`): `.extend()`
  with a shape-bound authorizer compiles; satisfying contract accepted;
  unsatisfying contract rejected; factory baseline (inferred `TAuth`) enforced;
  public-factory upgrade with shape-bound authorizer enforced; `beforeValidation`-
  only authorizers impose no requirement.
- **Interaction lane** (`create-handler.interactions.type-test.ts`): a two-layer
  `.extend()` chain accumulates `isbn` then `slug`; a contract missing either is
  rejected (intersection accumulation).
- **Regression lane** (`create-handler.regressions.type-test.ts`): a plain
  factory (no shape-bound authorizer) accepts arbitrary contracts as before;
  `TReq` defaults to plain `Request`; a no-op `.extend()` keeps the derived
  factory assignable to its parent.
