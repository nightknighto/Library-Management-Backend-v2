# Query Accessor & `query:` Widening — Decision Deferral

- **Date:** 2026-07-16
- **Status:** Deferred (no implementation; blocked on a type-level obstacle documented here)
- **Relationship:** Companion to `2026-07-16-contract-fragment-reuse.md`. That spec
  ships `.bodySchema`, `.paramsSchema`, and `.responseDataSchema` — the three
  accessors that fully round-trip. This doc records the **unresolved** question of
  whether a fourth accessor (the query one) can be supported, and what it would take.
- **Related invariant (decided):** the three accessors in
  `2026-07-16-contract-fragment-reuse.md` are final and shipping; query is the only
  deferred accessor.

---

## 1. Why this exists

The contract-fragment-reuse feature exposes authored fragments of a contract as
accessors so they can be reused in other contracts. Body, params, and response-data
accessors all fully round-trip back into `createContract`. The natural fourth — a
query accessor (`.querySchema`) — does **not** round-trip today, because
`createContract`'s `query:` field is the one request field that rejects Zod objects.

This document captures the genuine technical blocker so a future session can start
from the known obstacle instead of re-deriving it.

---

## 2. The current restriction (and where it is documented)

`RequestSchemaInput` (`src/core/create-request-schema.core.ts:48-111`) accepts:

- `body:` — `Record<string, z.ZodType> | z.ZodType<Record<string, any>>` (line 81).
- `params:` — `Record<string, z.ZodType> | z.ZodType<Record<string, any>>` (line 110).
- `query:` — **`Record<string, z.ZodType>` only** (line 93).

Body and params were widened to accept Zod objects in commit `7e4a1f4`
(*"feat(core): accept z.ZodType schemas for body and params in createContract"*).
Query was **deliberately excluded**, with the rationale recorded only inline and in
the commit message — there is **no spec or decision record** for it:

- Commit `7e4a1f4` body: *"query remains `Record<string, z.ZodType>` only (pagination
  merging requires the raw shape)."*
- `src/core/create-request-schema.core.ts:23-24`: *"`query` only accepts a plain
  object of Zod schemas because pagination merging operates on the plain shape at the
  type level."*
- `src/core/create-request-schema.core.ts:202-203` and
  `src/core/create-contract.core.ts:355-357`: the same one-line rationale.

No `@ts-expect-error` locks the restriction in any type-test. It is enforced purely
by the `query?: Record<string, z.ZodType>` type.

---

## 3. The blocker — type-level, not runtime

The blocker is `MergePaginationQuery` and how it is consumed downstream.

**`MergePaginationQuery`** (`src/core/create-contract.core.ts:205-212`):

```ts
type MergePaginationQuery<TQuery extends Record<string, z.ZodType> | undefined> =
    TQuery extends Record<string, z.ZodType>
    ? TQuery &
    ('page' extends keyof TQuery ? {} : { page: PaginationRequestQueryInput['page'] }) &
    ('limit' extends keyof TQuery
        ? {}
        : { limit: PaginationRequestQueryInput['limit'] })
    : PaginationRequestQueryInput;
```

The merge is implemented as a **plain-object intersection**: `TQuery & { page; limit }`,
gated on `'page' extends keyof TQuery`. Both operations only work when `TQuery` is a
plain object type whose keys are the query field names (a "raw shape"). If `TQuery`
were `z.ZodObject<T>`, two concrete failures occur:

1. **`'page' extends keyof TQuery` checks the wrong keys.** `keyof z.ZodObject` is the
   set of the schema's own members (`shape`, `parse`, `safeParse`, `optional`, …),
   **not** the user's query fields. The inject-or-skip check would never find `page`
   or `limit` and would always inject — even when the user already defined `page`
   inside their `z.object(...)`.
2. **The intersection does not produce a valid merged schema type.**
   `z.ZodObject<T> & { page; limit }` is not a `z.ZodObject` of the merged shape; it
   is a nonsensical intersection of a class/schema type with a plain object.
   Downstream `BuiltRequestSchema` / `createRequestSchema` expect a shape they can
   wrap, which this cannot satisfy.

**`ApplyPaginationRequest`** (`src/core/create-contract.core.ts:214-216`) is a pure
passthrough into `MergePaginationQuery`:

```ts
type ApplyPaginationRequest<TRequest extends RequestSchemaInput> = Omit<TRequest, 'query'> & {
    query: MergePaginationQuery<TRequest['query']>;
};
```

It inherits the plain-map constraint exactly. Widening `query` would require it to
branch on "is query a ZodObject? if so extract its shape, merge, re-wrap" — which
TypeScript cannot do generically against the `z.ZodType<Record<string, any>>`
supertype that body/params use: that supertype deliberately throws away the shape
generic, so `.shape` is not extractable from it.

**`PaginationRequestEnabled` / `WithPaginationRequest`** (lines 218-224) are
conditional dispatchers with no query-specific logic; they route into
`ApplyPaginationRequest` and are not themselves obstacles.

---

## 4. The runtime side is trivial (and decoupled)

The runtime merge would be straightforward — Zod exposes `.shape` and `.extend()` at
runtime:

- **`buildPaginationRequestShape`** (`src/core/create-contract.core.ts:626-665`).
  Today it spreads `request.query` as a plain field map and assigns `page` / `limit`
  keys (lines 650-663). For a ZodObject query it would read `.shape`, spread that,
  and re-wrap as `z.object(mergedShape)` (or use `.extend({ page, limit })`, guarding
  for already-present keys).
- **`createRequestSchema`** (`src/core/create-request-schema.core.ts:256-274`).
  Today the query branch is `isPlainRecord(shape.query) ? z.object(shape.query) :
  emptySchema` (line 265) — note `isZodSchema` is **not** checked for query, unlike
  body/params. Adding an `isZodSchema(shape.query)` pass-through branch is one line.

The runtime can support a ZodObject query today; the type system as written cannot.
That is exactly what the inline rationale means by *"at the type level."*

---

## 5. The candidate solution (and its cost)

The feasible fix is to constrain query's Zod-object form **more tightly** than
body/params did:

- Accept `z.ZodObject<z.ZodRawShape>` for query specifically (not the loose
  `z.ZodType<Record<string, any>>` supertype — query does not need
  discriminated-unions or arbitrary object schemas, so the tighter constraint is
  acceptable).
- That makes the shape generic extractable (`TQuery['_shape']`), which lets
  `MergePaginationQuery` be rewritten to: extract the raw shape → conditionally inject
  `page` / `limit` → re-wrap as `z.ZodObject<mergedShape>`.

**Cost / risk:**

- Real type-engineering on `MergePaginationQuery` + `ApplyPaginationRequest`, not a
  one-line change. The current intersection-merge idiom is replaced by an
  extract/inject/re-wrap pipeline.
- New inference tests required to pin the merged-query types (today,
  `create-contract.inference.type-test.ts:69-91` pins
  `Equal<…Query, { q?: string; page: number; limit: number }>`). Any rework must keep
  that exact inference intact — and prove it for the new ZodObject-query path.
- The tighter `z.ZodObject<z.ZodRawShape>` constraint is a smaller input space than
  body/params allow; the inference tests at
  `src/core/__type-tests__/create-contract.inference.type-test.ts:93-104,118-126,211-225`
  and `src/core/__type-tests__/create-handler.capabilities.type-test.ts:591-634`
  (which deliberately use ZodObject body/params + plain-map query) would gain new
  variants.

---

## 6. An interim option (not recommended, recorded for completeness)

If a query accessor is wanted **before** the type blocker is solved, an interim
`.querySchema` could return the authored query as a `z.ZodObject` (rebuilt from the
field map, excluding injected `page` / `limit`). It would be composable via Zod
methods (`.partial()`, `.extend()`) but would **not** round-trip directly into
`query:` — feeding it back would require the `.shape` hop:

```ts
// would NOT compile (query: rejects ZodObject):
createContract({ request: { query: ListBooksContract.querySchema }, ... });

// the .shape hop (works today):
createContract({ request: { query: ListBooksContract.querySchema.shape }, ... });
```

This ships a half-round-tripping accessor — the inconsistency the reuse spec
deliberately avoids by shipping only the three fully-round-tripping accessors. It is
recorded here so the tradeoff is explicit; the recommendation is to solve the type
blocker (§5) rather than ship the interim form.

---

## 7. What to gather before revisiting

Concrete observations to collect during usage:

1. **How often query reuse is actually wanted.** If list-style endpoints rarely share
   filter shapes, the accessor may be low-value and the type-engineering cost
   unjustified. If filter shapes are routinely repeated (e.g. the same
   `{ search, sort, order }` block across many resources), the case strengthens.
2. **Whether the `z.ZodObject<z.ZodRawShape>` constraint is acceptable for query.**
   Confirm no real query schema needs discriminated-unions or arbitrary object
   schemas (the looser form body/params accept).
3. **Whether the `.shape` hop (§6) is tolerable** as a permanent state if the type
   fix proves too costly — i.e. is a half-round-tripping accessor better than none?

---

## 8. Implementation notes for whoever revisits

When the decision is made, the change is concentrated in:

- **`src/core/create-request-schema.core.ts`** — `RequestSchemaInput.query` (line 93):
  widen to `Record<string, z.ZodType> | z.ZodObject<z.ZodRawShape>`. Update the
  `query` branch of `createRequestSchema` (line 265) to pass a ZodObject through.
- **`src/core/create-contract.core.ts`** — `MergePaginationQuery` (lines 205-212) and
  `ApplyPaginationRequest` (lines 214-216): rewrite to extract the raw shape, inject
  `page` / `limit`, re-wrap as `z.ZodObject`. `buildPaginationRequestShape` (lines
  626-665) gets the runtime ZodObject branch.
- **`src/core/create-contract.core.ts`** — `createContract` runtime (lines 594-620)
  and the `Contract` type (lines 271-335): add the `.querySchema` accessor returning
  the authored query as `z.ZodObject` (page/limit excluded).
- **Type-tests** — `src/core/__type-tests__/create-contract.inference.type-test.ts`
  and `src/core/__type-tests__/create-handler.capabilities.type-test.ts`: add
  ZodObject-query variants; keep the existing merged-query exact-inference
  assertions green.
- **JSDoc** — the `query` field docs in
  `src/core/create-request-schema.core.ts:82-93` and
  `src/core/create-contract.core.ts:355-357` (and the `createRequestSchema`
  docblock at `:202-203`) must drop the "raw shape" rationale and state the new
  accepted forms.

Coordinate with `2026-07-16-contract-fragment-reuse.md`: this is the fourth accessor
that spec explicitly left out; implementing it completes the symmetric accessor set.
