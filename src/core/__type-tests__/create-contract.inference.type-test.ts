import { z } from "zod";
import { createContract } from "../create-contract.core.ts";
import type {
    Equal,
    Expect,
    ExpectFalse,
    Extends,
    IsAny,
} from "./type-test.utils.ts";

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

type _requestBodyNotAny = ExpectFalse<IsAny<CreateBookRequest["body"]>>;
type _requestBodyExact = Expect<
    Equal<CreateBookRequest["body"], { title: string; copies: number }>
>;
type _requestParamsExact = Expect<
    Equal<CreateBookRequest["params"], { isbn: string }>
>;
type _requestQueryExact = Expect<
    Equal<CreateBookRequest["query"], { preview: boolean }>
>;

type _successDataExact = Expect<
    Equal<CreateBookSuccess["data"], { id: string; title: string }>
>;
type _successMetaExact = Expect<
    Equal<CreateBookSuccess["meta"], { timestamp: string }>
>;
type _errorShape = Expect<Extends<CreateBookError, { error?: unknown }>>;
type _nonPaginatedMetaHasNoPagination = ExpectFalse<
    "pagination" extends keyof CreateBookSuccess["meta"] ? true : false
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
    paginated: true,
});

type ListBooksResponse = z.infer<typeof ListBooksContract.response>;
type ListBooksSuccess = Extract<ListBooksResponse, { success: true }>;

const _paginatedFlag: true = ListBooksContract.paginated;
type _paginatedDataExact = Expect<
    Equal<ListBooksSuccess["data"], Array<{ isbn: string }>>
>;
type _paginatedMetaPresent = Expect<
    Equal<ListBooksSuccess["meta"]["pagination"]["limit"], number>
>;

createContract({
    request: {
        // @ts-expect-error request supports only body/query/params keys
        headers: {
            authorization: z.string(),
        },
    },
    response: z.string(),
});
