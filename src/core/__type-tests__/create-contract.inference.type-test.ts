import { z } from 'zod';
import { createContract } from '../index.ts';
import type { Equal, Expect, ExpectFalse, Extends, IsAny } from './type-test.utils.ts';

/**
 * Compile-only inference tests for createContract.
 * These tests run as part of `pnpm check` and never execute at runtime.
 */
const CreateBookContract = createContract({
    request: {
        body: {
            title: z.string(),
            copies: z.coerce.number().int().min(1),
        },
        params: {
            isbn: z.string(),
        },
        query: {
            preview: z.coerce.boolean().default(false),
        },
    },
    response: z.object({
        id: z.string(),
        title: z.string(),
    }),
});

type CreateBookRequest = z.infer<typeof CreateBookContract.request>;
type CreateBookResponse = z.infer<typeof CreateBookContract.response>;
type CreateBookSuccess = Extract<CreateBookResponse, { success: true }>;
type CreateBookError = Extract<CreateBookResponse, { success: false }>;

type _requestBodyNotAny = ExpectFalse<IsAny<CreateBookRequest['body']>>;
type _requestBodyExact = Expect<
    Equal<CreateBookRequest['body'], { title: string; copies: number }>
>;
type _requestParamsExact = Expect<Equal<CreateBookRequest['params'], { isbn: string }>>;
type _requestQueryExact = Expect<Equal<CreateBookRequest['query'], { preview: boolean }>>;

type _successDataExact = Expect<Equal<CreateBookSuccess['data'], { id: string; title: string }>>;
type _successMetaExact = Expect<Equal<CreateBookSuccess['meta'], { timestamp: string }>>;
type _errorShape = Expect<Extends<CreateBookError, { error?: unknown }>>;
type _nonPaginatedMetaHasNoPagination = ExpectFalse<
    'pagination' extends keyof CreateBookSuccess['meta'] ? true : false
>;

const ListBooksContract = createContract({
    request: {
        query: {
            page: z.coerce.number().default(1),
            limit: z.coerce.number().default(10),
        },
    },
    response: z.array(
        z.object({
            isbn: z.string(),
        }),
    ),
    pagination: { response: true },
});

type ListBooksResponse = z.infer<typeof ListBooksContract.response>;
type ListBooksSuccess = Extract<ListBooksResponse, { success: true }>;

const _paginationResponseFlag: true = ListBooksContract.pagination.response;
type _paginatedDataExact = Expect<Equal<ListBooksSuccess['data'], Array<{ isbn: string }>>>;
type _paginatedMetaPresent = Expect<Equal<ListBooksSuccess['meta']['pagination']['limit'], number>>;

const SearchBooksContract = createContract({
    request: {
        query: {
            q: z.string().optional(),
        },
    },
    response: z.array(z.string()),
    pagination: {
        request: true,
    },
});

type SearchBooksRequest = z.infer<typeof SearchBooksContract.request>;
type _searchQueryHasPage = Expect<
    Equal<
        SearchBooksRequest['query'],
        {
            q?: string | undefined;
            page: number;
            limit: number;
        }
    >
>;

const ZodObjectBodyContract = createContract({
    request: {
        body: z.object({
            title: z.string(),
            copies: z.coerce.number().int().min(1),
        }),
    },
    response: z.object({
        id: z.string(),
        title: z.string(),
    }),
});

type ZodObjectBodyRequest = z.infer<typeof ZodObjectBodyContract.request>;
type ZodObjectBodyResponse = z.infer<typeof ZodObjectBodyContract.response>;
type ZodObjectBodySuccess = Extract<ZodObjectBodyResponse, { success: true }>;

type _zodObjBodyNotAny = ExpectFalse<IsAny<ZodObjectBodyRequest['body']>>;
type _zodObjBodyExact = Expect<
    Equal<ZodObjectBodyRequest['body'], { title: string; copies: number }>
>;
type _zodObjBodySuccessData = Expect<
    Equal<ZodObjectBodySuccess['data'], { id: string; title: string }>
>;

const ZodObjectParamsContract = createContract({
    request: {
        params: z.object({
            id: z.string().uuid(),
            slug: z.string(),
        }),
    },
    response: z.string(),
});

type ZodObjParamsRequest = z.infer<typeof ZodObjectParamsContract.request>;
type _zodObjParamsNotAny = ExpectFalse<IsAny<ZodObjParamsRequest['params']>>;
type _zodObjParamsExact = Expect<
    Equal<ZodObjParamsRequest['params'], { id: string; slug: string }>
>;

const DiscriminatedUnionBodyContract = createContract({
    request: {
        body: z.discriminatedUnion('type', [
            z.object({
                type: z.literal('book'),
                title: z.string(),
                isbn: z.string(),
            }),
            z.object({
                type: z.literal('magazine'),
                title: z.string(),
                issue: z.number().int(),
            }),
        ]),
    },
    response: z.object({ id: z.string() }),
});

type DURequest = z.infer<typeof DiscriminatedUnionBodyContract.request>;
type _duBodyNotAny = ExpectFalse<IsAny<DURequest['body']>>;
type _duBodyExact = Expect<
    Equal<
        DURequest['body'],
        | { type: 'book'; title: string; isbn: string }
        | { type: 'magazine'; title: string; issue: number }
    >
>;

const UnionBodyContract = createContract({
    request: {
        body: z.union([
            z.object({ name: z.string() }),
            z.object({ id: z.number() }),
        ]),
    },
    response: z.string(),
});

type UnionBodyRequest = z.infer<typeof UnionBodyContract.request>;
type _unionBodyNotAny = ExpectFalse<IsAny<UnionBodyRequest['body']>>;
type _unionBodyExact = Expect<
    Equal<UnionBodyRequest['body'], { name: string } | { id: number }>
>;

const TransformBodyContract = createContract({
    request: {
        body: z
            .object({ ids: z.string() })
            .transform((data) => ({ ids: data.ids.split(',') })),
    },
    response: z.number(),
});

type TransformBodyRequest = z.infer<typeof TransformBodyContract.request>;
type _transformBodyNotAny = ExpectFalse<IsAny<TransformBodyRequest['body']>>;
type _transformBodyExact = Expect<
    Equal<TransformBodyRequest['body'], { ids: string[] }>
>;

const RefineBodyContract = createContract({
    request: {
        body: z
            .object({
                password: z.string(),
                confirm: z.string(),
            })
            .refine((data) => data.password === data.confirm),
    },
    response: z.string(),
});

type RefineBodyRequest = z.infer<typeof RefineBodyContract.request>;
type _refineBodyNotAny = ExpectFalse<IsAny<RefineBodyRequest['body']>>;
type _refineBodyExact = Expect<
    Equal<RefineBodyRequest['body'], { password: string; confirm: string }>
>;

const MixedFieldsContract = createContract({
    request: {
        body: z.object({
            name: z.string(),
            email: z.string().email(),
        }),
        params: z.object({
            userId: z.string().uuid(),
        }),
        query: {
            verbose: z.coerce.boolean().default(false),
        },
    },
    response: z.boolean(),
});

type MixedRequest = z.infer<typeof MixedFieldsContract.request>;
type _mixedBody = Expect<
    Equal<MixedRequest['body'], { name: string; email: string }>
>;
type _mixedParams = Expect<
    Equal<MixedRequest['params'], { userId: string }>
>;
type _mixedQuery = Expect<Equal<MixedRequest['query'], { verbose: boolean }>>;

createContract({
    request: {
        // @ts-expect-error request supports only body/query/params keys
        headers: {
            authorization: z.string(),
        },
    },
    response: z.string(),
});

createContract({
    request: {
        // @ts-expect-error z.string() is not a valid body schema (must produce object)
        body: z.string(),
    },
    response: z.string(),
});

createContract({
    request: {
        // @ts-expect-error z.number() is not a valid params schema (must produce object)
        params: z.number(),
    },
    response: z.string(),
});

// ============================================================================
// Fragment accessors: .bodySchema / .paramsSchema / .responseDataSchema
// ============================================================================
// These accessors expose the authored fragments of a contract so they can be
// reused when authoring another contract. They must:
//  - infer exact types for real contracts (below),
//  - stay non-`any` for omitted fields,
//  - round-trip back into createContract (the core reuse capability),
//  - keep responseDataSchema distinct from the full .response envelope.

// --- Exact accessor data types for a plain-object body/params contract.
//     Asserted via z.infer (config-agnostic) to match the file's existing style;
//     the schema-type identity is checked separately against request.shape.body. ---
type _accessorBodyDataExact = Expect<
    Equal<z.infer<typeof CreateBookContract.bodySchema>, { title: string; copies: number }>
>;
type _accessorParamsDataExact = Expect<
    Equal<z.infer<typeof CreateBookContract.paramsSchema>, { isbn: string }>
>;
type _accessorResponseDataDataExact = Expect<
    Equal<z.infer<typeof CreateBookContract.responseDataSchema>, { id: string; title: string }>
>;

// --- bodySchema / paramsSchema are the SAME schema type as the corresponding
//     field of the built request (the source of truth for "what is validated"). ---
type _accessorBodyIsRequestBody = Expect<
    Equal<typeof CreateBookContract.bodySchema, typeof CreateBookContract.request.shape.body>
>;
type _accessorParamsIsRequestParams = Expect<
    Equal<typeof CreateBookContract.paramsSchema, typeof CreateBookContract.request.shape.params>
>;

// --- ZodObject-body and discriminated-union-body: bodySchema passes the
//     authored schema through unchanged (the same type the request holds). ---
type _accessorZodObjBody = Expect<
    Equal<
        typeof ZodObjectBodyContract.bodySchema,
        typeof ZodObjectBodyContract.request.shape.body
    >
>;
type _accessorDuBodyPassthrough = Expect<
    Equal<
        typeof DiscriminatedUnionBodyContract.bodySchema,
        typeof DiscriminatedUnionBodyContract.request.shape.body
    >
>;

// --- Omitted fields stay non-`any` ---
// ListBooksContract defines only a query; body/params are omitted.
type _accessorOmittedBodyNotAny = ExpectFalse<IsAny<typeof ListBooksContract.bodySchema>>;
type _accessorOmittedParamsNotAny = ExpectFalse<IsAny<typeof ListBooksContract.paramsSchema>>;

// --- responseDataSchema is the DATA schema, not the full envelope ---
// Passing it where the envelope (.response) is expected must fail.
// @ts-expect-error responseDataSchema is data, not the success/error envelope union
const _envelopeIsNotData: typeof CreateBookContract.response = CreateBookContract.responseDataSchema;
void _envelopeIsNotData;

// --- Core reuse capability: round-trip ---
// A contract built from another contract's accessors (passed through
// untransformed) infers the same request body/params and response data shapes as
// the source contract. Comparing inferred output types isolates the accessor's
// contribution from Zod-internal schema-instance differences (strict/strip,
// coerce) that are irrelevant to reuse.
const ReusedFromAccessorsContract = createContract({
    request: {
        body: CreateBookContract.bodySchema,
        params: CreateBookContract.paramsSchema,
    },
    response: CreateBookContract.responseDataSchema,
});

type _roundTripBodyEqual = Expect<
    Equal<
        z.infer<typeof ReusedFromAccessorsContract.request>['body'],
        z.infer<typeof CreateBookContract.request>['body']
    >
>;
type _roundTripParamsEqual = Expect<
    Equal<
        z.infer<typeof ReusedFromAccessorsContract.request>['params'],
        z.infer<typeof CreateBookContract.request>['params']
    >
>;
type _roundTripResponseDataEqual = Expect<
    Equal<
        z.infer<typeof ReusedFromAccessorsContract.responseDataSchema>,
        z.infer<typeof CreateBookContract.responseDataSchema>
    >
>;

// Composition via Zod methods on the accessor compiles (subset/superset reuse):
createContract({
    request: { body: CreateBookContract.bodySchema.partial() },
    response: CreateBookContract.responseDataSchema,
});
createContract({
    request: { body: CreateBookContract.bodySchema.extend({ author: z.string() }) },
    response: CreateBookContract.responseDataSchema,
});

// ============================================================================
// Query widening: request.query now accepts z.ZodObject in addition to plain maps
// ============================================================================
// Covers: ZodObject/plain × pagination on/off × user page/limit precedence,
// special operators (refine/superRefine/strict/loose/nested/optional/brand),
// Config preservation, no-`any` guards (inline IsAny — never wrapped), the
// opaque fallback, rejected forms, and the .querySchema accessor round-trip.
//
// Test-writing rule (discovered during investigation): IsAny mis-evaluates when
// wrapped in a generic helper. Every not-`any` assert below uses ExpectFalse<
// IsAny<X>> inline. Config preservation is asserted via Equal against the source
// schema's Config (never via `extends Record<...>` — $strict's {} extends Record).

// --- Scenario 1: plain query + pagination ON ---
const PlainQueryPaginated = createContract({
    request: { query: { search: z.string() } },
    response: z.array(z.string()),
    pagination: { request: true },
});
type _s1NotAny = ExpectFalse<IsAny<z.infer<(typeof PlainQueryPaginated)['request']>['query']>>;
type _s1Exact = Expect<
    Equal<
        z.infer<(typeof PlainQueryPaginated)['request']>['query'],
        { search: string; page: number; limit: number }
    >
>;

// --- Scenario 2: ZodObject query + pagination ON ---
const ZodObjQueryPaginated = createContract({
    request: { query: z.object({ search: z.string().optional(), sort: z.string() }) },
    response: z.array(z.string()),
    pagination: { request: true },
});
type _s2NotAny = ExpectFalse<IsAny<z.infer<(typeof ZodObjQueryPaginated)['request']>['query']>>;
type _s2Exact = Expect<
    Equal<
        z.infer<(typeof ZodObjQueryPaginated)['request']>['query'],
        { search?: string | undefined; sort: string; page: number; limit: number }
    >
>;

// --- Scenario 3: ZodObject query + pagination OFF (no page/limit) ---
const ZodObjQueryNoPagi = createContract({
    request: { query: z.object({ search: z.string() }) },
    response: z.string(),
});
type _s3NotAny = ExpectFalse<IsAny<z.infer<(typeof ZodObjQueryNoPagi)['request']>['query']>>;
type _s3Exact = Expect<Equal<z.infer<(typeof ZodObjQueryNoPagi)['request']>['query'], { search: string }>>;

// --- Scenario 4: plain query + pagination OFF ---
const PlainQueryNoPagi = createContract({
    request: { query: { filter: z.string() } },
    response: z.string(),
});
type _s4NotAny = ExpectFalse<IsAny<z.infer<(typeof PlainQueryNoPagi)['request']>['query']>>;
type _s4Exact = Expect<Equal<z.infer<(typeof PlainQueryNoPagi)['request']>['query'], { filter: string }>>;

// --- Scenario 5: no query + pagination ON → only page/limit ---
const NoQueryPagi = createContract({
    request: {},
    response: z.array(z.string()),
    pagination: { request: true },
});
type _s5NotAny = ExpectFalse<IsAny<z.infer<(typeof NoQueryPagi)['request']>['query']>>;
type _s5Exact = Expect<
    Equal<z.infer<(typeof NoQueryPagi)['request']>['query'], { page: number; limit: number }>
>;

// --- Scenario 6: ZodObject query WITH user page/limit + pagination ON → user wins ---
const ZodObjUserPage = createContract({
    request: {
        query: z.object({ search: z.string(), page: z.string(), limit: z.string() }),
    },
    response: z.array(z.string()),
    pagination: { request: true },
});
type _s6NotAny = ExpectFalse<IsAny<z.infer<(typeof ZodObjUserPage)['request']>['query']>>;
type _s6Exact = Expect<
    Equal<
        z.infer<(typeof ZodObjUserPage)['request']>['query'],
        { search: string; page: string; limit: string }
    >
>;

// --- Scenario 7: plain query WITH user page + pagination ON → user page wins, limit injected ---
const PlainUserPage = createContract({
    request: { query: { search: z.string(), page: z.string() } },
    response: z.array(z.string()),
    pagination: { request: true },
});
type _s7NotAny = ExpectFalse<IsAny<z.infer<(typeof PlainUserPage)['request']>['query']>>;
type _s7Exact = Expect<
    Equal<
        z.infer<(typeof PlainUserPage)['request']>['query'],
        { search: string; page: string; limit: number }
    >
>;

// --- Scenario 8: .extend()-composed ZodObject query + pagination ---
const ComposedQueryBase = z.object({ search: z.string().optional() });
const ComposedQuery = ComposedQueryBase.extend({ status: z.string() });
const ComposedQueryContract = createContract({
    request: { query: ComposedQuery },
    response: z.array(z.string()),
    pagination: { request: true },
});
type _s8NotAny = ExpectFalse<IsAny<z.infer<(typeof ComposedQueryContract)['request']>['query']>>;
type _s8Exact = Expect<
    Equal<
        z.infer<(typeof ComposedQueryContract)['request']>['query'],
        { search?: string | undefined; status: string; page: number; limit: number }
    >
>;

// --- Scenario 9: strictObject query + pagination → merged, config preserved ---
const StrictQueryContract = createContract({
    request: { query: z.strictObject({ a: z.string() }) },
    response: z.string(),
    pagination: { request: true },
});
type _s9NotAny = ExpectFalse<IsAny<z.infer<(typeof StrictQueryContract)['request']>['query']>>;
type _s9Exact = Expect<
    Equal<z.infer<(typeof StrictQueryContract)['request']>['query'], { a: string; page: number; limit: number }>
>;

// --- Operator coverage: refined query + pagination — exact, not any ---
const RefinedQueryContract = createContract({
    request: {
        query: z.object({ search: z.string() }).refine((d) => d.search !== 'bad'),
    },
    response: z.string(),
    pagination: { request: true },
});
type _refNotAny = ExpectFalse<IsAny<z.infer<(typeof RefinedQueryContract)['request']>['query']>>;
type _refExact = Expect<
    Equal<
        z.infer<(typeof RefinedQueryContract)['request']>['query'],
        { search: string; page: number; limit: number }
    >
>;

// --- Operator coverage: multi-refine + superRefine ---
const MultiRefineQueryContract = createContract({
    request: {
        query: z
            .object({ search: z.string() })
            .refine((d) => d.search.length >= 2)
            .refine((d) => d.search.length <= 5),
    },
    response: z.string(),
    pagination: { request: true },
});
type _mrNotAny = ExpectFalse<IsAny<z.infer<(typeof MultiRefineQueryContract)['request']>['query']>>;
type _mrExact = Expect<
    Equal<
        z.infer<(typeof MultiRefineQueryContract)['request']>['query'],
        { search: string; page: number; limit: number }
    >
>;

// --- Operator coverage: nested object field — nested shape exact, not any ---
const NestedQueryContract = createContract({
    request: {
        query: z.object({ filter: z.object({ field: z.string(), op: z.string() }) }),
    },
    response: z.string(),
    pagination: { request: true },
});
type _nqNotAny = ExpectFalse<IsAny<z.infer<(typeof NestedQueryContract)['request']>['query']>>;
type _nqNestedNotAny = ExpectFalse<
    IsAny<z.infer<(typeof NestedQueryContract)['request']>['query']['filter']>
>;
type _nqExact = Expect<
    Equal<
        z.infer<(typeof NestedQueryContract)['request']>['query'],
        { filter: { field: string; op: string }; page: number; limit: number }
    >
>;

// --- Operator coverage: optional / nullable fields ---
const OptQueryContract = createContract({
    request: {
        query: z.object({ search: z.string().optional(), count: z.number().nullable() }),
    },
    response: z.string(),
    pagination: { request: true },
});
type _oqNotAny = ExpectFalse<IsAny<z.infer<(typeof OptQueryContract)['request']>['query']>>;
type _oqExact = Expect<
    Equal<
        z.infer<(typeof OptQueryContract)['request']>['query'],
        { search?: string | undefined; count: number | null; page: number; limit: number }
    >
>;

// --- Operator coverage: branded query — exact, not any ---
const BrandedQueryContract = createContract({
    request: { query: z.object({ search: z.string() }).brand<'MyQuery'>() },
    response: z.string(),
    pagination: { request: true },
});
type _bqNotAny = ExpectFalse<IsAny<z.infer<(typeof BrandedQueryContract)['request']>['query']>>;
type _bqExact = Expect<
    Equal<
        z.infer<(typeof BrandedQueryContract)['request']>['query'],
        { search: string; page: number; limit: number }
    >
>;

// --- Operator coverage: cross-field invariant refine ---
const RangeQueryContract = createContract({
    request: {
        query: z.object({ min: z.number(), max: z.number() }).refine((d) => d.min < d.max),
    },
    response: z.string(),
    pagination: { request: true },
});
type _rqNotAny = ExpectFalse<IsAny<z.infer<(typeof RangeQueryContract)['request']>['query']>>;
type _rqExact = Expect<
    Equal<
        z.infer<(typeof RangeQueryContract)['request']>['query'],
        { min: number; max: number; page: number; limit: number }
    >
>;

// --- Config preservation: merged query keeps the source schema's Config ---
// Helper to read a query field's Config out of a built request.
type QueryConfigOf<TRequest> = TRequest extends z.ZodObject<{ query: infer Q extends z.ZodObject<any, any> }>
    ? Q extends z.ZodObject<any, infer C>
        ? C
        : never
    : never;
type StrictConfig = QueryConfigOf<(typeof StrictQueryContract)['request']>;
type StrictSourceConfig = (typeof StrictQueryContract)['request'] extends z.ZodObject<{
    query: infer Q extends z.ZodObject<any, any>;
}>
    ? Q extends z.ZodObject<any, infer C>
        ? C
        : never
    : never;
// Merged strict query Config EQUALS a strictObject's Config (both $strict).
type _strictConfigPreserved = Expect<Equal<StrictConfig, StrictSourceConfig>>;

const LooseQueryContract = createContract({
    request: { query: z.object({ a: z.string() }).loose() },
    response: z.string(),
    pagination: { request: true },
});
type LooseConfig = QueryConfigOf<(typeof LooseQueryContract)['request']>;
type LooseSourceConfig = (typeof LooseQueryContract)['request'] extends z.ZodObject<{
    query: infer Q extends z.ZodObject<any, any>;
}>
    ? Q extends z.ZodObject<any, infer C>
        ? C
        : never
    : never;
type _looseConfigPreserved = Expect<Equal<LooseConfig, LooseSourceConfig>>;
// Sanity: strict ≠ loose (so the preservation assert is non-trivial).
type _strictNeqLoose = ExpectFalse<Equal<StrictConfig, LooseConfig>>;

// --- Rejected forms: .transform(), discriminatedUnion, union-of-objects ---
createContract({
    request: {
        // @ts-expect-error .transform() produces a ZodPipe, not a ZodObject — query rejects it
        query: z.object({ search: z.string() }).transform((d) => ({ ...d })),
    },
    response: z.string(),
});
createContract({
    request: {
        // @ts-expect-error discriminatedUnion is not a ZodObject — query rejects it
        query: z.discriminatedUnion('type', [
            z.object({ type: z.literal('a') }),
            z.object({ type: z.literal('b') }),
        ]),
    },
    response: z.string(),
});
createContract({
    request: {
        // @ts-expect-error union of objects is not a ZodObject — query rejects it
        query: z.union([z.object({ a: z.string() }), z.object({ b: z.number() })]),
    },
    response: z.string(),
});

// --- .querySchema accessor: returns the AUTHORED query (page/limit excluded) ---
type _qsAuthoredNotAny = ExpectFalse<IsAny<typeof ZodObjQueryPaginated.querySchema>>;
type _qsAuthoredExact = Expect<
    Equal<
        z.infer<typeof ZodObjQueryPaginated.querySchema>,
        { search?: string | undefined; sort: string }
    >
>;
// user-authored page/limit are KEPT in .querySchema
type _qsUserPageExact = Expect<
    Equal<z.infer<typeof ZodObjUserPage.querySchema>, { search: string; page: string; limit: string }>
>;
// plain-map query: .querySchema is the wrapped z.object
type _qsPlainExact = Expect<
    Equal<z.infer<typeof PlainQueryPaginated.querySchema>, { search: string }>
>;
// no-query contract: .querySchema is an empty object schema
type _qsEmptyExact = Expect<Equal<z.infer<typeof NoQueryPagi.querySchema>, Record<string, never>>>;

// --- .querySchema is itself not any for the opaque AnyContract base form ---
// (AnyContract widens TQueryAuthored to z.ZodTypeAny; confirm the accessor
//  field type stays non-any when read off a concrete contract.)
type _qsFieldNotAny = ExpectFalse<IsAny<typeof ZodObjQueryPaginated['querySchema']>>;

// --- Round-trip: .querySchema into a new contract reproduces the authored query ---
const ReusedQueryContract = createContract({
    request: { query: ZodObjQueryPaginated.querySchema },
    response: z.array(z.string()),
    pagination: { request: true },
});
type _rtNotAny = ExpectFalse<IsAny<z.infer<(typeof ReusedQueryContract)['request']>['query']>>;
type _rtExact = Expect<
    Equal<
        z.infer<(typeof ReusedQueryContract)['request']>['query'],
        { search?: string | undefined; sort: string; page: number; limit: number }
    >
>;
// And .querySchema of the reused contract equals the original's authored query
type _rtAccessorEqual = Expect<
    Equal<
        z.infer<typeof ReusedQueryContract.querySchema>,
        z.infer<typeof ZodObjQueryPaginated.querySchema>
    >
>;

// --- Edge: plain map with NO page/limit + pagination — every field not any ---
type _pmPageNotAny = ExpectFalse<IsAny<z.infer<(typeof PlainQueryPaginated)['request']>['query']['page']>>;
type _pmLimitNotAny = ExpectFalse<IsAny<z.infer<(typeof PlainQueryPaginated)['request']>['query']['limit']>>;
type _pmSearchNotAny = ExpectFalse<IsAny<z.infer<(typeof PlainQueryPaginated)['request']>['query']['search']>>;
