# Query Widening + `.querySchema` Accessor

**Date:** 2026-07-17
**Status:** Designed — every type-level and runtime primitive verified against the installed Zod v4.3.5 source; pending implementation
**Surfaces:** `src/core` (framework primitive), `tests/core` (runtime), `src/core/__type-tests__` (inference), `src/features/books` (proving ground)
**Relationship:** Resolves `2026-07-16-query-accessor-deferral.md` (that doc's blocker is solved here) and completes the symmetric accessor set opened by `2026-07-16-contract-fragment-reuse.md`.

## Summary

Two coupled changes, shipped together:

1. **Widen `request.query`** to accept a `z.ZodObject<z.ZodRawShape>` directly — the same kind of widening body/params already have, but with the tighter `ZodObject` constraint the pagination merge requires.
2. **Add `.querySchema`** — the fourth and final accessor, returning the **authored** query (page/limit excluded), fully round-tripping back into another contract's `query:`.

Both are proven feasible. The deferral doc's "real type-engineering, not one line" concern no longer holds: the new merge is *simpler* than the current intersection-based one because it operates on the raw shape uniformly.

---

## 1. Why query was the holdout (and why it no longer has to be)

`createContract`'s `request.body` and `request.params` accept either a plain field map (`Record<string, z.ZodType>`) or a full `z.ZodType<Record<string, any>>`. `request.query` accepts **only the plain map**. The inline rationale (correct at the time) was that pagination merging needs the raw shape, and the loose `z.ZodType<Record<string, any>>` supertype throws the shape away.

The fix is to give query its **own** accepted-Zod-schema form — `z.ZodObject<z.ZodRawShape>` — instead of reusing body/params' loose supertype. `ZodObject` keeps the shape generic (`<Shape, Config>`), so it is extractable via `T extends z.ZodObject<infer S>` and the merge can re-wrap with `z.ZodObject<MergedShape>`. Query does not need discriminated-unions or arbitrary object schemas (the looser forms body/params accept), so the tighter constraint is acceptable.

### Verified Zod v4 facts (4.3.5, from `node_modules/zod/src/v4/`)

| Fact | Source | Why it matters |
|---|---|---|
| `z.ZodRawShape = core.$ZodShape = Readonly<{ [k:string]: $ZodType }>` | `classic/compat.ts:67` | The shape type the input constraint uses |
| Public `ZodObject<Shape, Config>` exposes `.shape: Shape` | `classic/schemas.ts:1177-1184` | Runtime `.shape` gives the raw shape |
| `.extend<U>(): ZodObject<util.Extend<Shape, U>, Config>` | `classic/schemas.ts:1201` | Runtime + type merge that **preserves Config** |
| `util.Extend<A,B>` merges, B wins on overlap | `core/util.ts:140` | The merge primitive (we mirror it manually for inject-or-skip) |
| `T extends z.ZodObject<infer S, infer C>` extracts both | — | Lets us re-wrap preserving `$strict`/`$strip`/`$loose` |
| **v4:** `.refine()` on an object **stays** a `ZodObject` | runtime-probed | Refined query objects are legitimately accepted |
| `.transform()` becomes `ZodPipe`, not `ZodObject` | runtime-probed | Correctly rejected as a top-level query schema |

---

## 2. The new type pipeline

### 2.1 Input widening (`RequestSchemaInput.query`)

```ts
// create-request-schema.core.ts
query?: Record<string, z.ZodType> | z.ZodObject<z.ZodRawShape>;
```

(Plain-map form unchanged; ZodObject form added. `z.ZodRawShape` is a public Zod v4 export.)

### 2.2 Output widening (`RequestSchemaOutput.query`)

```ts
query: T['query'] extends z.ZodObject<infer S>
    ? z.ZodObject<S>                                   // pass the shape through
    : T['query'] extends Record<string, z.ZodType>
      ? z.ZodObject<T['query']>                        // wrap plain map (unchanged)
      : z.ZodObject<Record<string, never>>;            // omitted (unchanged)
```

### 2.3 The merge rewrite (`MergePaginationQuery`)

Replace the current plain-object intersection with a **shape-level** merge. One helper does inject-or-skip (user precedence), then three branches re-wrap by query form:

```ts
// create-contract.core.ts

/** Inject page/limit into a shape only when absent; user-defined keys win. */
type MergeShapeWithPagination<S extends z.ZodRawShape> = {
    [K in keyof S | 'page' | 'limit']: K extends keyof S
        ? S[K]
        : K extends 'page'
          ? PaginationRequestQueryInput['page']
          : K extends 'limit'
            ? PaginationRequestQueryInput['limit']
            : never;
};

/** Merge pagination into a query input of any accepted form. */
type MergePaginationQuery<TQuery> =
    TQuery extends z.ZodObject<infer S, infer C>
        ? z.ZodObject<MergeShapeWithPagination<S>, C>          // ZodObject: preserve Config
        : TQuery extends infer S extends z.ZodRawShape          // plain map
          ? z.ZodObject<MergeShapeWithPagination<S>>
          : z.ZodObject<MergeShapeWithPagination<{}>>;          // undefined/omitted
```

`ApplyPaginationRequest` / `WithPaginationRequest` are unchanged structurally — they still route into `MergePaginationQuery`, which now handles all three forms.

### 2.4 Why `infer C` matters

A user's `z.strictObject({...})` query has `$strict` Config; `z.object({...})` has `$strip`; `.loose()` has `$loose`. Capturing `infer C` and re-wrapping as `z.ZodObject<MergedShape, C>` means the merged query **keeps the user's mode** — a strict query stays strict after page/limit injection. The runtime side preserves the same property via `.extend()` (verified).

---

## 3. The `.querySchema` accessor

### 3.1 The authored-vs-built problem

`Contract`'s `TRequest` is the **post-merge** built schema (page/limit already injected when pagination is on). An accessor derived purely from `TRequest` cannot recover the authored query: when the user authored their own `page`/`limit`, those are indistinguishable from the framework's injected ones inside the built shape. "Strip page/limit" would silently drop the user's fields — wrong.

(The existing `bodySchema`/`paramsSchema` accessors don't hit this because body/params have no injection step.)

### 3.2 Solution: thread the authored query as a 4th generic on `Contract`

```ts
export type Contract<
    TRequest extends z.ZodTypeAny = z.ZodTypeAny,
    TResponseData extends z.ZodTypeAny = z.ZodTypeAny,
    TPaginated extends boolean = boolean,
    TQueryAuthored extends z.ZodTypeAny = z.ZodTypeAny,   // NEW (defaults to ZodTypeAny)
> = {
    request: TRequest;
    response: ContractResponseSchema<TResponseData, TPaginated>;
    bodySchema: RequestShapeBody<TRequest>;
    paramsSchema: RequestShapeParams<TRequest>;
    responseDataSchema: TResponseData;
    /** The authored query (page/limit excluded), round-trips into query:. */
    querySchema: TQueryAuthored;
    pagination?: PaginationContractConfig<TPaginated>;
} & (TPaginated extends true ? { pagination: PaginationContractConfig<true> } : {});
```

### 3.3 Why this is non-breaking (verified)

- The 4th generic **defaults to `z.ZodTypeAny`**, so the existing 3-arg references compile unchanged.
- `AnyContract` (`create-handler.core.ts:57`) passes 3 args → 4th defaults → opaque, same as how `bodySchema`/`paramsSchema` already fall back to `z.ZodTypeAny` in the opaque case.
- `ContractHandlerSuccessResult` (`create-handler.core.ts:62`) uses positional inference over the first three params; the extra param is ignored. Verified with a mirror test.
- `createContract`'s two overloads pass `TQueryAuthored` positionally (4th arg).

### 3.4 What `.querySchema` returns (all cases verified)

| Authored query | Pagination | `.querySchema` returns |
|---|---|---|
| `{search, sort}` | ON | `{search, sort}` — page/limit excluded |
| `{search, sort}` | OFF | `{search, sort}` |
| `{search, page, limit}` (user's) | ON | `{search, page, limit}` — **user's kept** |
| none | ON | empty object schema |
| `z.object({search})` | ON | the ZodObject as-authored |

### 3.5 Round-trip (the core reuse capability)

```ts
const SearchBooks = createContract({
    request: { query: z.object({ title: z.string().optional(), author: z.string().optional() }) },
    response: z.array(bookOutputSchema),
    pagination: { request: true, response: true },
});

// Reuse the authored filter shape; this contract applies its own pagination.
const SearchAuthors = createContract({
    request: { query: SearchBooks.querySchema },   // { title?, author? } — clean, no page/limit
    response: z.array(authorOutputSchema),
    pagination: { request: true, response: true },
});
```

Verified: `SearchAuthors.request.query` infers `{title?, author?, page, limit}` — identical to had it been authored by hand.

---

## 4. Runtime changes

### 4.1 `buildPaginationRequestShape` — ZodObject branch

Today it spreads `request.query` as a plain map. Add a ZodObject branch that uses `.extend()` (which preserves Config AND lets us pass only the missing keys, so user precedence is free):

```ts
function buildPaginationRequestShape(request, paginationRequest) {
    if (!paginationRequest) return request;
    // ... build pageSchema / limitSchema as today ...

    const existingQuery = request.query;

    // ZodObject query: extend with only the missing keys (.extend preserves Config)
    if (existingQuery instanceof z.ZodObject) {
        const missing: Record<string, z.ZodType> = {};
        if (!('page' in existingQuery.shape)) missing.page = pageSchema;
        if (!('limit' in existingQuery.shape)) missing.limit = limitSchema;
        return { ...request, query: existingQuery.extend(missing) };
    }

    // Plain map (unchanged): spread + assign missing keys
    const mergedQuery = { ...(existingQuery ?? {}) };
    if (!Object.prototype.hasOwnProperty.call(existingQuery, 'page')) mergedQuery.page = pageSchema;
    if (!Object.prototype.hasOwnProperty.call(existingQuery, 'limit')) mergedQuery.limit = limitSchema;
    return { ...request, query: mergedQuery };
}
```

`.extend({})` when nothing is missing is a Zod no-op (verified). `z.ZodObject` is the runtime constructor exported by Zod v4 (verified via probe).

### 4.2 `createRequestSchema` — query passthrough branch

Today the query branch is `isPlainRecord(shape.query) ? z.object(shape.query) : emptySchema`. Add a `isZodSchema(shape.query)` pass-through (mirrors body/params):

```ts
query: isZodSchema(shape.query)
    ? shape.query
    : isPlainRecord(shape.query)
      ? z.object(shape.query)
      : emptySchema,
```

Note: by the time `createRequestSchema` runs, `buildPaginationRequestShape` has already merged page/limit for the ZodObject path (so `shape.query` is already the extended ZodObject — passthrough is correct).

### 4.3 `createContract` — retain the authored query for `.querySchema`

Capture the **authored** query (pre-merge) before `buildPaginationRequestShape` runs, normalize it to a Zod schema (plain maps → `z.object`; omitted → empty `z.object`), and return it as `querySchema`. This mirrors how `responseDataSchema` retains the authored response data.

---

## 5. Operator survival (verified) — special Zod operators on query objects

Because the pagination merge uses Zod's `.extend()` at runtime, the critical question is: **do refinements, config, and other operators on the user's query object survive the merge?** All of the following were verified at both runtime (parse behavior) and type level (exact inferred types, `IsAny` guards) against Zod 4.3.5:

| Operator on the query object | Survives `.extend()` (pagination merge)? | Runtime verified | Type exact & not-`any` |
|---|---|---|---|
| `.refine()` (single) | ✅ yes — refinement still rejects invalid input | ✅ | ✅ |
| `.refine()` (multiple, chained) | ✅ yes — all refinements run | ✅ | ✅ |
| `.superRefine()` | ✅ yes | ✅ | ✅ |
| `.check()` (v4 low-level) | ✅ yes | ✅ | ✅ |
| Cross-field invariant refine (`min < max`) | ✅ yes | ✅ | ✅ |
| `.strict()` / `z.strictObject()` (Config `$strict`) | ✅ yes — **Config preserved** | ✅ | ✅ |
| `.loose()` (Config `$loose`) | ✅ yes — **Config preserved** | ✅ | ✅ |
| `.catchall()` (Config `$catchall`) | ✅ yes — **Config preserved** | ✅ | ✅ |
| Nested object field (`{filter: z.object({...})}`) | ✅ yes — nested shape exact | ✅ | ✅ |
| Optional / nullable fields | ✅ yes | ✅ | ✅ |
| `.brand<...>()` | ✅ yes (brand is type-level marker; parses fine) | ✅ | ✅ |
| `.describe()` | ✅ yes (metadata only) | ✅ | ✅ |
| `.transform()` on the object | ❌ **rejected** — becomes `ZodPipe`, not `ZodObject` | n/a | rejected at input |
| `z.discriminatedUnion(...)` | ❌ **rejected** — not a `ZodObject` | n/a | rejected at input |
| `z.union([z.object(...), ...])` | ❌ **rejected** — not a `ZodObject` | n/a | rejected at input |

**Key Zod v4 fact (verified by runtime probe):** `.refine()` on an object **stays a `ZodObject`** in v4 (refinements are "checks" attached to the schema, not `ZodEffects` wrappers as in v3). So refined query objects are legitimately accepted, and the refinement behavior is preserved through the `.extend()` merge. `.transform()` does NOT stay a `ZodObject` (becomes `ZodPipe`) and is correctly rejected.

### 5.1 Config preservation mechanism

`MergePaginationQuery` extracts both generics via `T extends z.ZodObject<infer S, infer C>` and re-wraps as `z.ZodObject<MergedShape, C>`. At runtime, `.extend()` carries the source schema's Config onto the result. So a `z.strictObject({...})` query stays strict (rejects unknown keys) even after page/limit injection. Verified the three distinct Config types (`$strict`, `$loose`, `$catchall`) are all preserved through the merge, and that `$strict ≠ $loose` (so the preservation is non-trivial).

---

## 6. Test-writing rules (discovered during investigation)

Two test-harness pitfalls were surfaced while building the operator-coverage probe. These must be followed in the real test suite or they produce **false failures** that look like real type bugs:

1. **Never wrap `IsAny` in a generic helper.** Writing `type NotAny<T> = ExpectFalse<IsAny<T>>` and then `NotAny<X>` can mis-evaluate to a false-positive `any` failure, even when `X` is provably concrete. TypeScript does not fully resolve `T` through the conditional-type chain (`0 extends 1 & T`) when `T` is reached via another generic parameter. **Always write `ExpectFalse<IsAny<X>>` inline** at each assertion site. (Sanity-confirmed: the same `X` passes `ExpectFalse<IsAny<X>>` inline, passes via `type Resolved = X extends infer R ? R : never`, and fails only when wrapped — proving the wrapper is the culprit, not the type.)

2. **To assert Config preservation, compare Configs via `Equal`, never via `extends Record<string, unknown>`.** Zod's `$strict = { out: {}; in: {} }`, and `{}` *does* extend `Record<string, unknown>` in TypeScript, so a predicate like `Config extends { out: Record<string, unknown> } ? 'loose' : 'strict'` reports BOTH strict and loose as `'loose'`. Use `Equal<ConfigOf<MergedQuery>, ConfigOf<SourceQuery>>` against the source schema's Config directly.

---

## 7. What the deferral doc got right vs. wrong

| Claim | Verdict |
|---|---|
| `keyof z.ZodObject` returns schema members, not user fields | ✅ True — but irrelevant once we extract the shape first |
| `z.ZodObject<T> & {page;limit}` is nonsensical | ✅ True — we never do this; merge at shape level |
| Body/params' loose supertype throws away the shape | ✅ True — that's why query uses the tighter `ZodObject<ZodRawShape>` |
| Zod v4 doesn't expose `_shape` | ✅ True — but `z.ZodObject<infer S>` extracts it |
| "Real type-engineering, not one line" | ❌ Wrong — ~25 lines total, and the new merge is simpler than the old intersection one |

---

## 8. Scope of edits

### Framework (`src/core`)

1. **`create-request-schema.core.ts`** — widen `RequestSchemaInput.query`; widen `RequestSchemaOutput.query`; add the `isZodSchema` branch to the `createRequestSchema` query line. Update the docblocks (file-level, `RequestSchemaInput`, `createRequestSchema`) to drop the "raw shape only" rationale.
2. **`create-contract.core.ts`** — add `MergeShapeWithPagination`; rewrite `MergePaginationQuery` to the shape-level form; add the `querySchema` property + 4th generic to `Contract`; thread `TQueryAuthored` through both `createContract` overloads; add the ZodObject branch to `buildPaginationRequestShape`; capture the authored query in the `createContract` runtime. Update all JSDoc per `docs/rules/jsdoc-coverage.md`.
3. **`create-handler.core.ts`** — none required (`AnyContract` keeps compiling via the default). Confirm via `pnpm check`.

### Tests

4. **`src/core/__type-tests__/create-contract.inference.type-test.ts`** — keep all existing assertions green. Add:
   - **ZodObject-query scenarios** (§2's S1–S9): plain/ZodObject × pagination on/off × user-page-precedence × `.extend()`-composed × strictObject.
   - **`.querySchema` accessor assertions**: authored-only (excludes injected page/limit); user's page/limit kept; round-trip into a second contract reproduces the authored shape.
   - **Operator-coverage (§5)**: refined, multi-refine, superRefine, cross-field-invariant, nested-object, optional/nullable, branded queries — each asserting **exact** inferred type AND **inline `ExpectFalse<IsAny<...>>`** on the query and every field.
   - **Config-preservation (§5.1, §6.2)**: `Equal<ConfigOf<mergedQuery>, ConfigOf<sourceQuery>>` for strict/loose/catchall; plus `ExpectFalse<Equal<ConfigOf<strict>, ConfigOf<loose>>>` to prove the assertion is non-trivial.
   - **Rejected forms**: `@ts-expect-error` that `.transform()`, `z.discriminatedUnion`, and `z.union`-of-objects queries are rejected at the input type.
   - **Opaque fallback**: `MergePaginationQuery<z.ZodTypeAny>` is not `any` (inline `ExpectFalse<IsAny<...>>`).
5. **`src/core/__type-tests__/create-handler.capabilities.type-test.ts`** — keep the existing plain-query test green; add a ZodObject-query handler capability test (`req.query` infers the merged shape, not `any`).
6. **`tests/core/create-contract.runtime.test.ts`** — add: ZodObject query parses; ZodObject + pagination injects page/limit; user page/limit in ZodObject wins; strictObject stays strict after pagination; refined query + pagination **still rejects invalid input** (refinement survival); `.querySchema` returns authored query (excludes injected); round-trip parses identically.

### Proving ground

7. **`src/features/books/books.schemas.ts`** — convert `ListBooksContract.query` to the ZodObject form as the one proving-ground example. Optional: add a sibling contract sourcing its `query:` from `ListBooksContract.querySchema` to demonstrate reuse.

### Docs

8. Update `docs/specs/2026-07-16-query-accessor-deferral.md` — mark resolved, link to this spec.

---

## 9. Explicitly out of scope

- Widening body/params further (they already accept the loose supertype; no change).
- Supporting `.transform()`/`ZodPipe`/discriminated-union as a top-level query schema (correctly rejected; query is shape-mergeable only).
- Other feature modules (only books compile-checked, per guardrails).
- Changing `ValidatedRequest` / handler types (the merge flows through `z.infer` automatically — no handler-side change).

## 10. Validation plan

- `pnpm check` — core + all `__type-tests__` (new assertions compile).
- `pnpm test tests/core/create-contract.runtime.test.ts` — new + existing runtime cases.
- Full `pnpm test` to confirm no regression in handler/feature suites.
- Spot-compile `src/features/books/books.schemas.ts` after the `ListBooksContract` change.
