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
