# Contract Fragment Reuse — Accessors + Passthrough

**Date:** 2026-07-16
**Status:** Designed — pending implementation
**Surfaces:** `src/core` (framework primitive), `tests/core` (runtime), `src/core/__type-tests__` (inference)

## Summary

Add three typed accessors to every `Contract` so the authored fragments of one
contract can be reused to build another — directly fixing the
`otherContract.response` / `otherContract.body` reuse attempts that fail today.

The three accessors:

- `.bodySchema` — the request **body** as a Zod schema (what is actually validated).
- `.paramsSchema` — the request **params** as a Zod schema (what is actually validated).
- `.responseDataSchema` — the response **data** schema you authored (not the built envelope).

All three fully round-trip back into `createContract`: each accessor's return type
is already an accepted shape for the field it came from, so
`createContract({ body: X.bodySchema, params: Y.paramsSchema, response: Z.responseDataSchema })`
compiles with **no change to `createContract`'s input types**.

## Motivation

### The one-way transform

`createContract` (`src/core/create-contract.core.ts:594-620`) is currently a one-way
transform. It accepts `{ request, response, pagination? }`, builds a composite
`request` Zod object (`z.ZodObject<{ body, query, params }>` via
`createRequestSchema`, `src/core/create-request-schema.core.ts:256-274`) and a
response-envelope union (`createContractResponseSchema`,
`src/core/create-contract.core.ts:92-102`), then **discards the original inputs**.
The produced `Contract` is a plain object holding only the built schemas.

This is exactly why two natural reuse attempts fail in real apps:

- `otherContract.body` — there is no such property. The body lives **inside** the
  built `request` Zod object, not on the `Contract`.
- `otherContract.response` — exists, but it is the **envelope** union
  (`{ success, data, meta } | { success: false, error }`). `createContract`'s
  `response:` field expects the raw **data** schema, so feeding the envelope back in
  double-wraps and type-errors.

The contract is write-only: you can put Zod in, but you cannot get the pieces back
out to compose another contract.

### What reuse looks like once the accessors exist

Authoring-style reuse, built entirely on Zod's existing methods on the accessors —
no new operators or fragment factories are needed:

```ts
const CreateBookContract = createContract({
    request: { body: { isbn, title, shelf, total_quantity } },
    response: bookOutputSchema,
});

// SUBSET — Create → Update (same fields, optional):
const UpdateBookContract = createContract({
    request: {
        body: CreateBookContract.bodySchema.partial(),
        params: { isbn: isbnSchema },
    },
    response: CreateBookContract.responseDataSchema,
});

// SUPERSET — add a field:
const CreateBookV2Contract = createContract({
    request: { body: CreateBookContract.bodySchema.extend({ author: authorSchema }) },
    response: CreateBookContract.responseDataSchema,
});

// SAME response, totally different request:
const ImportBookContract = createContract({
    request: { body: { source: z.string() } },
    response: CreateBookContract.responseDataSchema,
});

// Reuse a params fragment across endpoints:
const GetBookContract = createContract({
    request: { params: { isbn: isbnSchema } },
    response: bookOutputSchema.partial(),
});
const DeleteBookContract = createContract({
    request: { params: GetBookContract.paramsSchema },
    response: z.void(),
});
```

### Why no operators or fragment factory

Two adjacent reuse models were considered and rejected for this spec:

- **Operators** (`pickContract` / `extendContract` / `omitContract` / `mergeContracts`)
  are strongest for whole-contract superset/subset transforms, but Zod's native
  methods on accessors (`.partial()`, `.extend()`, `.pick()`, `.omit()`) already cover
  that, and operators add a heavy Contract→Contract machinery layer plus generics
  that must recover inputs and carry pagination. They also have no clean fit for
  "keep response, swap request" — exactly the case accessors solve trivially.
- **Fragment factory** (`defineBody` / `defineParams` / `defineResponse`) is largely
  unnecessary: once accessors land, reusable fragments are just plain `z.object(...)`
  Zod consts passed into `createContract`. The one place that pattern is blocked today
  is `query:` (it rejects Zod objects) — see the query deferral doc.

## Why these three accessors round-trip without input-type changes

The round-trip works because `createContract`'s input types already accept Zod
schemas for these three fields:

- `body:` accepts `z.ZodType<Record<string, any>>` — `create-request-schema.core.ts:81`.
- `params:` accepts `z.ZodType<Record<string, any>>` — `create-request-schema.core.ts:110`.
- `response:` accepts any `z.ZodTypeAny` — `create-contract.core.ts:471`.

So once `.bodySchema` / `.paramsSchema` / `.responseDataSchema` are typed Zod
schemas, passing them straight back compiles. **`RequestSchemaInput`, the contract
param types, and the overloads are untouched.** This is what keeps the change low-risk.

The fourth natural accessor, a query one, does **not** round-trip today and is
deferred — see `2026-07-16-query-accessor-deferral.md`.

## Scope of Edits

### Framework level (`src/core`)

1. **`src/core/create-contract.core.ts` — `createContract` runtime** (lines 594-620).
   In addition to building and returning `request` / `response` / `pagination`, the
   function **retains the authored fragments** and returns them on the contract:

   - `responseDataSchema` ← the `response` arg, as-is (the raw data schema, before
     envelope wrapping).
   - `bodySchema` ← the built request's body shape, i.e. `builtRequest.shape.body`
     (what `createRequestSchema` actually validates — a `z.strictObject(...)` for a
     plain field map, or the passed-through Zod schema). For the omitted-body case
     this resolves to an empty `z.ZodObject`, matching the `emptySchema` transform
     behavior at `create-request-schema.core.ts:190-192,264`.
   - `paramsSchema` ← `builtRequest.shape.params` (a strip-mode `z.object(...)` for a
     plain field map, or the passed-through Zod schema). Empty-params resolves to an
     empty `z.ZodObject` likewise.

   Query is intentionally **not** retained.

2. **`src/core/create-contract.core.ts` — `Contract` type** (lines 271-335). Extend
   the type with the three accessor properties:

   ```ts
   export type Contract<
       TRequest extends z.ZodTypeAny = z.ZodTypeAny,
       TResponseData extends z.ZodTypeAny = z.ZodTypeAny,
       TPaginated extends boolean = boolean,
   > = {
       request: TRequest;
       response: ContractResponseSchema<TResponseData, TPaginated>;
       pagination?: PaginationContractConfig<TPaginated>;
       /* NEW */ bodySchema: /* derived from TRequest's body shape */;
       /* NEW */ paramsSchema: /* derived from TRequest's params shape */;
       /* NEW */ responseDataSchema: TResponseData;
   } & (TPaginated extends true ? { pagination: PaginationContractConfig<true> } : {});
   ```

   `responseDataSchema: TResponseData` is direct. `bodySchema` / `paramsSchema`
   derive via conditional inference: `TRequest extends z.ZodObject<infer Shape> ?
   Shape['body'] / Shape['params'] : z.ZodTypeAny` (since `TRequest` is the
   `z.ZodObject` produced by `BuiltRequestSchema`,
   `src/core/create-contract.core.ts:123-125`). Two cases:
   (a) **real contracts** — `TRequest` is a concrete `z.ZodObject`, so `Shape['body']`
   / `Shape['params']` is extracted exactly (an omitted body/params already collapses
   to `z.ZodObject<Record<string, never>>` via `RequestSchemaOutput`,
   `create-request-schema.core.ts:143-147`); and
   (b) the **opaque-`TRequest` case** — when `TRequest` is the loose
   `ZodType<ContractRequestEnvelope>` of `AnyContract`
   (`create-handler.core.ts:57`), the `extends z.ZodObject<infer Shape>` test is
   `false`, so the accessor falls back to **`z.ZodTypeAny`** — the widest Zod schema
   type, which keeps every concrete body/params schema assignable into `AnyContract`
   (a narrower fallback like `z.ZodObject<Record<string, never>>` would break
   assignability, since `Record<string, never>` forbids real fields). **No new
   generic parameters are added** — the accessors are pure derivations from the
   existing `TRequest` / `TResponseData`.

3. **`src/core/create-contract.core.ts` — `AnyContract` compatibility.** `AnyContract`
   (`src/core/create-handler.core.ts:57`) is
   `Contract<ZodType<ContractRequestEnvelope>, ZodTypeAny, boolean>`. Because the new
   properties are additions to an object type (and contracts are only ever built by
   `createContract` — there are no hand-built `Contract` literals in the codebase),
   every existing contract still satisfies `AnyContract` and every `createHandler`
   constraint continues to hold. No change to `createHandler` is required.

4. **JSDoc** — per `docs/rules/jsdoc-coverage.md`, the three new exported accessors
   on `Contract` get consumer-facing JSDoc: one sentence stating what each returns
   (the body / params / response-data Zod schema), that it is the schema fragment you
   can reuse, and an `@example` showing it passed back into `createContract`. The
   existing `.request` / `.response` doc blocks are not weakened. No internal
   rationale goes in JSDoc (that lives in `//` comments or this spec).

### Tests (`tests/core`)

5. **`tests/core/create-contract.runtime.test.ts`** — add runtime coverage:
   - `.bodySchema` / `.paramsSchema` / `.responseDataSchema` are present and `.parse()`
     sample data correctly for both a paginated and a non-paginated contract.
   - `.responseDataSchema` is the data schema, not the envelope (parsing a data value
     succeeds; parsing a full envelope against it fails).
   - The accessor round-trip: a contract built from another contract's accessors
     produces a response envelope identical to the original's (same parse behavior).

### Inference (`src/core/__type-tests__`)

6. **`src/core/__type-tests__/create-contract.inference.type-test.ts`** — add:
   - Exact accessor return types: e.g.
     `Equal<BookContract['bodySchema'], z.ZodObject<{ title: z.ZodString; ... }>>`.
   - **Full round-trip inference**: a contract built from another contract's accessors
     infers request body / params / response data types identically to the original
     (capability test — this is the core feature assertion).
   - `@ts-expect-error` that `.responseDataSchema` is **not** assignable where the
     envelope (`.response`) is expected — locks the data-vs-envelope distinction.
   - Empty-body / empty-params case resolves to an empty `z.ZodObject`, **not `any`**
     (`ExpectFalse<IsAny<ContractWithNoBody['bodySchema']>>`).
   - Backward-compat: all existing assertions in the file stay green unchanged.

## Inference / Type-Test Policy

Per `docs/rules/create-handler-inference-policy.md`: this change **extends
`Contract`'s type surface**, so it is in scope for inference tests. The additions in
item 6 above satisfy the minimum bar — at least one capability test (the round-trip
inference), plus an invariant assertion (the data-vs-envelope negative) and a
no-`any` invariant. The query surface is **not** touched (deferred), so no
pagination-inference changes are made and the existing query/pagination assertions
remain green.

## Validation

- `pnpm check` — type safety across core + the inference tests in
  `src/core/__type-tests__/`.
- `pnpm test tests/core/create-contract.runtime.test.ts` — the new accessor runtime
  coverage.
- **Books proving ground:** `src/features/books/books.schemas.ts` — verify the
  feature compiles (it defines contracts but does not yet use accessors; no behavior
  change expected since accessors are additive).

## Out of Scope (Intentionally Not Touched)

- **Query accessor / `query:` widening** — deferred to
  `2026-07-16-query-accessor-deferral.md`. `RequestSchemaInput.query` stays
  `Record<string, z.ZodType>`-only; `MergePaginationQuery` /
  `ApplyPaginationRequest` / `buildPaginationRequestShape` / `createRequestSchema`
  are untouched.
- **Operators** (`pickContract` / `extendContract` / `omitContract` /
  `mergeContracts`) — Zod methods on accessors cover the same ground.
- **Fragment factory** (`defineBody` / `defineParams` / `defineResponse`) — plain
  Zod consts are sufficient once accessors land.
- **`paginationQuery()` standalone helper** and any borrows/users dedup — out of
  scope; the page/limit duplication observed in secondary features is stale and not a
  basis for framework changes here.
- **Other feature modules** — books is the only proving ground touched; borrows /
  users / stats are left as-is.

## Breaking-Change Note

This change is **purely additive** at the type level: three new properties on
`Contract`, three new returned fields at runtime. No existing property is renamed,
removed, retyped, or re-typed.

**Blast-radius check:** every existing consumer reads `contract.request`,
`contract.response`, and `contract.pagination` — none of which change. `createHandler`
and its runtime (`createHandlerRuntime`, `src/core/create-handler.core.ts:362-443`)
read only those three; they never enumerate contract keys, so the extra properties
are invisible to them. No feature module or test constructs a `Contract` by hand
(all go through `createContract`), so no literal needs updating. `AnyContract`
continues to be satisfied by every contract because the new properties are
narrowing additions to a wider object type.

The behavioral surface is unchanged; the new properties are strictly opt-in.
