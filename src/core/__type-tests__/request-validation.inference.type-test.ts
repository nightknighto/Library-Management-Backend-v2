import type { Request } from "express";
import { z } from "zod";
import { createContract } from "../create-contract.core.ts";
import { validateContractRequest } from "../validate-contract-request.core.ts";
import { createRequestSchema } from "../../shared/schemas/create-request-schema.ts";
import type {
    Equal,
    Expect,
    ExpectFalse,
    IsAny,
} from "./type-test.utils.ts";

/**
 * Compile-only inference tests for request schema construction
 * and request validation promotion.
 */
const UpdateBookRequestSchema = createRequestSchema({
    body: {
        title: z.string(),
        totalQuantity: z.number().int().min(1),
    },
    params: {
        isbn: z.string(),
    },
    query: {
        dryRun: z.coerce.boolean().default(false),
    },
});

type UpdateBookParsed = z.infer<typeof UpdateBookRequestSchema>;

type _schemaBodyNotAny = ExpectFalse<IsAny<UpdateBookParsed["body"]>>;
type _schemaBodyExact = Expect<
    Equal<
        UpdateBookParsed["body"],
        { title: string; totalQuantity: number }
    >
>;
type _schemaParamsExact = Expect<
    Equal<UpdateBookParsed["params"], { isbn: string }>
>;
type _schemaQueryExact = Expect<
    Equal<UpdateBookParsed["query"], { dryRun: boolean }>
>;

createRequestSchema({
    // @ts-expect-error createRequestSchema only accepts body/query/params keys
    headers: {
        authorization: z.string(),
    },
});

const UpdateBookContract = createContract({
    request: {
        body: {
            title: z.string(),
            totalQuantity: z.number().int().min(1),
        },
        params: {
            isbn: z.string(),
        },
        query: {
            dryRun: z.coerce.boolean().default(false),
        },
    },
    response: z.object({
        updated: z.literal(true),
    }),
});

declare const expressReq: Request;
const validatedPromise = validateContractRequest(UpdateBookContract.request, expressReq);
type ValidatedRequest = Awaited<typeof validatedPromise>;

type _validatedBodyExact = Expect<
    Equal<
        ValidatedRequest["body"],
        { title: string; totalQuantity: number }
    >
>;
type _validatedParamsExact = Expect<
    Equal<ValidatedRequest["params"], { isbn: string }>
>;
type _validatedQueryExact = Expect<
    Equal<ValidatedRequest["query"], { dryRun: boolean }>
>;

const NotARequestEnvelopeSchema = z.object({
    title: z.string(),
});

// @ts-expect-error validateContractRequest requires body/query/params envelope schema
void validateContractRequest(NotARequestEnvelopeSchema, expressReq);
