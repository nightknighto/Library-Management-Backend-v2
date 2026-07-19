# Changelog

Evolution of the framework surface (`src/core`). One entry per commit that
touches `src/core`; consumer-side updates (`src/shared`, `src/lib`, `src/utils`,
`src/features`) never appear in the changelog, not even as bullets, and never
generate their own entry. New dates and entries are added at the top.

**Entries are written for framework users, not the author.** The headline and the
first sentence of the blockquote state what users can now do (or what no longer
breaks) in plain terms. Internal type names, helper utilities, and inference
mechanics do NOT appear in entries — they live in the linked spec. See
`docs/specs/2026-07-17-changelog.md` (especially the BAD-vs-GOOD contrast
example) for the full format and the audience/language rule.

Read the **Baseline** section at the bottom first for the pre-changelog starting
point, then read upward to trace each evolution.

---

## 2026-07-19

### Factory authorizers can now require a request shape

> A reusable authorizer often needs a specific request field — e.g. an
> ownership check that reads `req.params.isbn`. You could install such an
> authorizer on a single handler, and TypeScript would check the contract had
> the field. But the moment you tried to install it as a **factory baseline** —
> via `createHandlerFactory` defaults or `.extend()` — TypeScript rejected the
> authorizer at the factory definition itself, even though it was perfectly
> valid. You had to either widen the authorizer to a plain `Request` (losing the
> typing) or repeat it on every handler.
>
> Factories now remember the request shape their `afterValidation` authorizers
> need, and enforce it on every contract you pass to the factory. So a factory
> that requires `params.isbn` will refuse a contract without it — and a contract
> that has it compiles cleanly. Requirements accumulate across `.extend()`
> chains, so a derived factory enforces its own authorizers plus every
> ancestor's.

- `createHandlerFactory` defaults and `.extend()` accept authorizers typed
  against a specific request shape (e.g.
  `Authorizer<Auth, Request<{ isbn: string }, ...>>`). Previously these were
  rejected at the factory definition; they now compile.
- A factory that has such an authorizer rejects contracts missing the required
  field, at the call site where the contract is known.
- `.extend()` chains accumulate requirements: each layer's `afterValidation`
  authorizers add to the parent's. A contract must satisfy every layer's
  requirement.
- `beforeValidation` authorizers impose no requirement (they run before the
  request is validated, on a plain `Request`).
- No runtime change. Existing factories and handlers are unaffected — the new
  behavior only activates when you install a shape-bound authorizer.
- **Limitation:** when you pass an explicit type argument
  (`createHandlerFactory<AuthContext>(...)`), TypeScript can't also infer the
  authorizer shape, so baseline enforcement via `createHandlerFactory` is lost
  in that form. Install shape-bound authorizers via `.extend()` instead, which
  needs no type argument. Baseline enforcement via `createHandlerFactory` works
  when `TAuth` is inferred from an inline authenticator.
- **Deferred:** query-field requirements (e.g. `req.query.dryRun`) are still
  not enforced — a pre-existing gap separate from this change. Params and body
  requirements are enforced. See
  `docs/specs/2026-07-19-query-channel-authorizer-leak.md`.
- Spec: `docs/specs/2026-07-19-factory-authorizer-shape-propagation.md`.

## 2026-07-17

### Query widening + `.querySchema` accessor

> `request.query` was the only request field that rejected a `z.ZodObject` —
> `body` and `params` had been widened in `7e4a1f4`, but query was left as a plain
> field map, and the matching `.querySchema` accessor (the fourth symmetric
> accessor) was deferred. The blocker was `MergePaginationQuery`: it merged via a
> keyof-gated plain-object intersection, which both checked the wrong keys
> (`keyof z.ZodObject` is schema members, not user fields) and produced a
> nonsensical `z.ZodObject & {page;limit}` intersection.
>
> Query's Zod-schema form is constrained to `z.ZodObject<z.ZodRawShape>` —
> tighter than body/params' loose `z.ZodType<Record<string, any>>` supertype —
> because the pagination merge needs an extractable shape. The merge was rewritten
> to operate at the shape level: extract the raw shape, inject `page`/`limit`
> only when absent (user precedence), and re-wrap as
> `z.ZodObject<MergedShape, C>` so the schema's Config (`$strict`/`$loose`/
> `$catchall`) is preserved. At runtime the same merge is done via `.extend()`
> with only the missing keys, which preserves both Config and refinements. The
> `.querySchema` accessor threads a non-breaking 4th generic (`TQueryAuthored`,
> defaulting to `z.ZodTypeAny`) rather than stripping page/limit off the built
> shape — the authored query is unrecoverable from the post-merge shape when the
> user defined their own page/limit.

- `RequestSchemaInput.query` widened to accept `z.ZodObject<z.ZodRawShape>`
  alongside the plain `Record<string, z.ZodType>` map. Plain-map behavior is
  unchanged (strip mode, `page`/`limit` injection identical to before).
- `MergePaginationQuery` rewritten shape-level; Zod Config (strict/loose/catchall)
  and refinements survive the pagination merge — a `z.strictObject(...)` query
  stays strict, a `.refine()` on the query still rejects, after `page`/`limit`
  are injected.
- `.querySchema` accessor added — the fourth symmetric accessor. Returns the
  **authored** query (page/limit excluded unless the caller defined their own),
  and round-trips directly back into another contract's `request.query`.
- `Contract` gains a 4th generic `TQueryAuthored` (defaults to `z.ZodTypeAny`,
  non-breaking) to capture the authored query pre-merge. `AnyContract` and
  `ContractHandlerSuccessResult` compile unchanged via the default.
- `.transform()` (→ `ZodPipe`), `z.discriminatedUnion`, and `z.union`-of-objects
  remain rejected as a top-level query schema (not `z.ZodObject`). Note: in Zod
  v4 `.refine()` on an object *stays* a `ZodObject` (refinements are checks, not
  `ZodEffects`), so refined query objects are legitimately accepted.
- **Resolves** the deferral recorded under "Contract fragment accessors"
  (2026-07-16). Spec:
  `docs/specs/2026-07-17-query-widening-and-accessor.md`;
  deferral record: `docs/specs/2026-07-16-query-accessor-deferral.md`.

## 2026-07-16

### Factory `.extend()` — factory-extends-factory

> To layer an `authorize` policy onto a shared factory, you had to author a
> fresh plain factory and re-declare the parent's `authenticate` baseline — the
> parent's security contract was lost on every reuse. Extension lets a derived
> factory layer on top while preserving it.
>
> `authenticate` was made transitively locked (first setter wins) rather than
> overridable, so a child can't silently swap auth on a secured parent. A public
> factory can still be upgraded by supplying the first authenticator. `access`
> may move between protected/optional or upgrade from public, but never widen
> back to public (would erase the parent's entire baseline).

- `.extend()` method on both `SecuredFactory` and `PublicFactory`.
- `authorize` buckets concat additively (factory-first, no dedup).
- `authenticate` transitively locked — first-setter wins, enforced at type
  (extension types omit the key) and runtime (conditional strip).
- Child `access` moves protected↔optional or public→{protected,optional};
  never widens to `public`.
- Flatten-on-extend: merges via `mergeHandlerSecurityDefaults` and delegates to
  `createHandlerFactory`, so chains of any depth work and `.extend` re-attaches.
  Spec: `docs/specs/2026-07-16-factory-authorizer-additive-merge.md`.

### Contract fragment accessors

> Building one contract from another's fragments (e.g. an "update" contract built
> from a "create" contract's fields) required reaching into
> `otherContract.response` / `.body`, which failed because those weren't the
> authored fragments — they were the built envelopes. Exposing the authored
> schemas makes cross-contract reuse first-class.

- `.bodySchema`, `.paramsSchema`, `.responseDataSchema` accessors on every
  `Contract`.
- All three round-trip back into `createContract` with no input-type changes.
- `responseDataSchema` is the raw data schema, not the built envelope;
  `bodySchema`/`paramsSchema` are read from the built request's shape.
- **Deferred:** `.querySchema` — `MergePaginationQuery`'s keyof-gated
  intersection breaks for `z.ZodObject`. Candidate `z.ZodObject<z.ZodRawShape>`
  solution + inference risk documented in
  `docs/specs/2026-07-16-query-accessor-deferral.md`.

### Additive authorizer merge

> Factory merging overrode `authorize` by key, so a per-handler `authorize`
> replaced the factory's baseline policies instead of layering on top. This
> blocked composing authorization across factory boundaries — the prerequisite
> for the later `.extend()`.

- `mergeHandlerSecurityDefaults` now concats `authorize` buckets factory-first
  instead of overriding. Scalar-override still applies to `access`/`authenticate`.
- Spec: `docs/specs/2026-07-16-factory-authorizer-additive-merge.md`.

## 2026-07-07

### `authSchema` removed — authenticator owns its output validity · BREAKING

> `SecurityOptions.authSchema` re-validated the authenticator's already-verified
> output against a separate schema. It failed wrong: a verified token's
> `payload.email` was re-checked against `JwtAuthSchema`, so the schema could
> only fail if `UserRepository.getUser` returned a malformed object — a
> server-side 500 bug surfaced to the client as a 401 auth error. The
> authenticator should own its own output validity, and external claims
> (OAuth/federated) should compose via authenticator chaining, not fight a
> schema baked into one authenticator.

- `SecurityOptions.authSchema` removed entirely.
- **Migration:** drop `authSchema` from any `SecurityOptions`; validate inside
  the authenticator and throw the appropriate error on invalid output.
- Completes the principle behind the throw-based authorizer (`5f15cd8`) and
  authenticator error-model (`e0d8b26`) redesigns — no framework-owned auth
  errors remain.
- Spec: `docs/specs/2026-07-07-authschema-removal.md`.

### Authenticator error-model redesign · BREAKING

> The authenticator was a raw callable and the shared `errors` surface owned
> its no-credentials default, so "why auth failed" lived separately from the
> authenticator that knew the answer. Mirroring the throw-based authorizer
> model, the authenticator becomes the single source of its own errors — and
> the entire shared `errors` surface is retired.
>
> `null` (absence) vs throw (failure) is made a load-bearing distinction:
> `optional` access swallows absence but never failures (throws propagate in
> both access modes) — a fail-closed principle codifying the existing no-try/catch
> runtime. The new `createAuthenticator` factory is callback-first so `TAuthContext`
> infers from the callback return without backward flow into a handler signature.

- `Authenticator` is now a callable carrying an optional `onMissingCredentials`.
  Success = resolve context; absence = resolve `null`; failure = throw an
  `HttpError` (status/message become the response). `undefined` dropped from
  the return union — one canonical absence value.
- New `createAuthenticator(authenticate, options?)` factory — the only way to
  attach `onMissingCredentials`.
- `HandlerErrorMappers`, `AuthErrorMapper`, and the `errors` option removed from
  `HandlerOptions`, factory defaults, and `mergeHandlerSecurityDefaults`.
- **Migration:** author authenticators via `createAuthenticator`; carry your
  own `onMissingCredentials`; drop the `errors` field from handlers/factories.

## 2026-07-01

### Throw-based authorizer error model · BREAKING

> Authorizers returned a boolean, and denial (the `false` case) was mapped to a
> response via the shared `errors.unauthorized` mapper. That stripped a denial
> of its own semantics — a policy couldn't deny with 404, 402, or any status
> other than the one fixed 403. Letting the authorizer throw an `HttpError`
> makes the denial carry its own status and message directly.
>
> The return type is the strict literal `Promise<true>` (not `Promise<boolean>`)
> because TypeScript does not narrow async literal returns against a union
> contextual type — a non-union literal is what makes `return false` a type
> error rather than silently allowed.

- `Authorizer` now returns `Promise<true>` and must throw an `HttpError` to
  deny. `return false` is a compile error. The thrown error's status/message
  become the response.
- `allOf` / `anyOf` / `not` are throw-aware: `anyOf` and `not` gain an optional
  `denialError` (default `Forbidden('Forbidden')`); non-`HttpError` exceptions
  propagate unchanged through every combinator so a policy bug can never
  silently allow.
- `executeAuthorizationStage` simplified: drops `access`/`errors` params,
  bypasses when auth is null, propagates thrown `HttpError`s verbatim.
- `HandlerErrorMappers` loses `unauthorized` (denials come from authorizers);
  only `unauthenticated` remains (until `e0d8b26` removes it too).
- **Migration:** convert authorizers to the throw idiom; remove
  `errors.unauthorized` usages.

## 2026-06-30

### Before/after validation buckets · BREAKING

> `SecurityOptions.validateBeforeAuthorization` was a single boolean toggle:
> authorizers ran either entirely before or entirely after request validation.
> Real policies often need both — fail-fast checks on the raw request (cheap
> denials before parsing) alongside checks that need the typed, validated body.
> Two independent buckets replace the toggle.
>
> This also collapses the type system: `BeforeValidateFactory` and
> `AfterValidateFactory` overloads disappear, since a factory no longer commits
> to one timing.

- `validateBeforeAuthorization: boolean` replaced by `AuthorizationConfig` with
  explicit `beforeValidation` / `afterValidation` authorizer buckets on
  `SecurityOptions.authorize`.
- `beforeValidation` policies run on the raw request (fail-fast, pre-validation);
  `afterValidation` policies run on the validated request with typed
  body/query/params.
- `BeforeValidateFactory` / `AfterValidateFactory` overloads removed.
- **Migration:** move authorizers from the top-level `authorize` + boolean flag
  into `authorize.beforeValidation` or `authorize.afterValidation`.

## 2026-06-09

### z.ZodType accepted for body & params in createContract

> `createContract`'s request `body` and `params` accepted only a
> `Record<string, z.ZodType>` — a field map. That blocked passing a pre-built
> `z.object()`, a discriminated union, a `.refine()`/`.transform()` chain, or
> any other object-producing schema directly. Callers had to flatten their
> schema into a field map, losing the validation mode (strict, passthrough, …)
> they had chosen.

- `RequestSchemaInput.body` and `.params` widened to accept
  `z.ZodType<Record<string, any>>` alongside plain `Record<string, z.ZodType>`.
- When a `z.ZodType` is passed, it's used as-is at runtime — the caller's chosen
  validation mode is preserved.
- Plain objects still use `z.strictObject()` for body and `z.object()` for
  params (unchanged).
- Primitives like `z.string()` / `z.number()` rejected at compile time via the
  `z.ZodType<Record<string, any>>` constraint.
- `query` remains `Record<string, z.ZodType>` only (pagination merging requires
  the raw shape).

## 2026-05-21

### Handler context objects · BREAKING

> Handler executors took positional args — `(req)` for public, `(req, auth)` for
> protected. The arity varied by access mode, and the types were computed
> conditional types that IntelliSense struggled to render (handlers showed only
> `access: 'public'` suggestions). A single context object gives a consistent
> signature across modes and lets the types be flat, explicit interfaces with
> real JSDoc.

- Handler executors now receive a single context object: `({ req })` for public,
  `({ req, auth })` / `({ req, auth? })` for protected/optional.
- Security types flattened to explicit interfaces (`BeforeValidationSecurity`,
  `AfterValidationSecurity`).
- Factory types flattened to `AfterValidateFactory`, `BeforeValidateFactory`,
  `PublicFactory`.
- Runtime guards now throw at factory/handler creation when `authenticate` is
  missing for non-public access (previously compile-time "no authenticate" tests
  converted to runtime checks).
- **Migration:** rewrite handler executor parameter lists from positional
  `(req, auth)` to the destructured context object `({ req, auth })`.

## 2026-05-20

### Pagination support enhanced

> The first pagination commit (`fce63c3`) shipped response-meta pagination but
> left the request side, the runtime wiring, and the JSDoc incomplete. This
> rounds out pagination across the core components — request injection, response
> building, and the type surface — and adds the JSDoc-coverage rule that the
> prior commit's types now needed.

- Refined request/response pagination wiring across `create-contract`,
  `create-handler`, `create-request-schema`, `response-builder`,
  `sanitize-response`, `security`, and `types`.
- `types.core.ts` substantially expanded (pagination meta shapes).
- Added `docs/rules/jsdoc-coverage.md` (the JSDoc-coverage rule).

## 2026-05-14

### Request pagination in createContract

> Listing endpoints had no first-class way to express pagination. Contracts
> could only describe a flat response; handlers hand-rolled `page`/`limit`
> query parsing and `totalCount`/`hasNextPage` response shaping ad hoc, with no
> type-level guarantee that the query params and the response meta matched.
> Pagination needed to be a contract-level concept so the schema, the validated
> request, and the response envelope all agreed.

- `createContract` gains request-side pagination: when configured, `page`/`limit`
  are injected into the request `query` and validated.
- Response-side `paginated: true` adds a `meta.pagination` block
  (`{ totalCount, limit, offset, hasNextPage }`) to the success envelope schema.
- `types.core.ts` updated with pagination-related types; runtime tests added.

---

## Baseline — framework state as of `f28332e` (pre-changelog)

> This snapshot describes the framework API surface as it existed immediately
> before the first changelog entry. Every entry above is a delta against this
> baseline. Read this first to understand the starting point; read upward
> through the dated sections to trace each evolution. Facts verified against the
> code at `f28332e` (read via `git show f28332e:<path>`).

### `createContract` — request/response validation boundary

```ts
createContract(params: {
  request: {
    body?: Record<string, z.ZodType>;   // NOT z.ZodObject, NOT z.ZodType
    query?: Record<string, z.ZodType>;
    params?: Record<string, z.ZodType>;
  };
  response: z.ZodTypeAny;
  paginated?: boolean;                  // response-meta pagination only
}): Contract
```

- Request fields are **records of named Zod schemas per field**, not raw
  `z.ZodObject`/`z.ZodType` (that widening comes in `7e4a1f4`).
- `paginated: true` adds a `meta.pagination` block to the success envelope.
  No request-side pagination injection exists yet (added in `fce63c3`).
- No fragment accessors (`.bodySchema`, `.paramsSchema`, `.responseDataSchema`)
  — added in `1467c0e`.

### `createHandler` — request → response pipeline

```ts
createHandler(contract, options?, handler): express.RequestHandler
// handler signature (POSITIONAL args, not context object):
//   public:    (req) => Promise<HandlerSuccessResult>
//   optional:  (req, auth?) => ...
//   protected: (req, auth) => ...
```

- `options: { access?, security?, errors? }`.
- `errors: HandlerErrorMappers` — error-mapper functions. Removed entirely by
  `e0d8b26`.
- Handler args are positional; the context-object form arrives in `21c5b0f`.

### `createHandlerFactory` — shared default-handler factory

```ts
createHandlerFactory<TAuthContext>(defaults?: {
  access?: AccessMode;
  security?: SecurityOptions<TAuthContext>;
  errors?: HandlerErrorMappers;
}): ConfiguredHandlerFactory<TAuthContext, ...>
```

- Defaults shallow-merged with per-handler overrides; `security.authorize`
  merge is **by-key override** (per-handler `authorize` replaces the default —
  not additive). Additive merge arrives in `6ae0b15`.
- No `.extend()` method on the returned factory (added in `49b6021`).
- Guard: defining `security` with `access: 'public'` throws at construction.

### Authorizer model — return-boolean

```ts
type Authorizer<TAuthContext> =
  (params: { req: Request; auth: TAuthContext }) => MaybePromise<boolean>;
// true = allow, false = deny (→ errors?.unauthorized ?? Forbidden)
```

- Boolean return model; throw-based denial arrives in `5f15cd8`.
- Combinators exported: `allOf`, `anyOf`, `not` (all boolean-model at baseline).

### Authenticator model — raw callable, no factory

```ts
type Authenticator<TAuthContext> =
  (req: Request) => MaybePromise<TAuthContext | null | undefined>;
// null/undefined = credentials absent
```

- Raw callable, not `createAuthenticator(...)`. The factory arrives in `e0d8b26`.
- No `onMissingCredentials` option; the distinction between "absent" and
  "failed" is not load-bearing yet.
- `SecurityOptions.authSchema?: ZodType<TAuthContext>` — when present, the
  pipeline runs `authSchema.parseAsync(auth)` on the authenticator's output.
  Removed in `7e16dda`.

### Security pipeline — `security.core.ts`

- `SecurityOptions.authorize` is a single authorizer or `Authorizer[]`; no
  `beforeValidation`/`afterValidation` buckets (those arrive in `661b38a`).
- `SecurityOptions.validateBeforeAuthorization: boolean` — single global switch
  for authorizer timing relative to request validation.
- `mergeHandlerSecurityDefaults` merges by key (override, not additive).
- `executeAuthenticationStage` runs the authenticator, applies
  `authSchema.parseAsync`, returns `{ auth }` / `{ auth? }` / `{}` per mode.
- `executeAuthorizationStage` normalizes authorizers, requires all-true, throws
  mapped `Forbidden`/`Unauthorized` on denial or missing-protected-auth.

### Other baseline exports (stable or unchanged through later entries)

- `allOf`, `anyOf`, `not` — authorizer combinators (boolean model at baseline).
- `createRequestSchema`, `validateContractRequest`, `ValidatedRequest`.
- `buildPaginationMeta`, `buildSuccessResponsePayload`, `sanitizeResponse`.
- `CookieOperation` (set/clear) on handler results.
- Types: `AccessMode`, `Authenticator`, `Authorizer`, `Contract`,
  `PaginationMeta`, `SuccessResponse`, `ErrorResponse`, `HandlerRequest`,
  `AfterAuthorizationRequest`, and others.
