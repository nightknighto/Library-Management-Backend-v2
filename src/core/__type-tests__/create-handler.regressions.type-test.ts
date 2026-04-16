import { z } from "zod";
import { createHandler } from "../create-handler.core.ts";
import { createContract } from "../create-contract.core.ts";
import type {
    Equal,
    Expect,
    ExpectFalse,
    Extends,
    IsAny,
} from "./type-test.utils.ts";

/**
 * Historical regression lane
 *
 * Put tests here when:
 * - A real bug, fragile edge case, or prior inference failure was fixed and must never return.
 * - The case should be traceable and ideally numbered or named.
 *
 * Do not put tests here when:
 * - The test is for a brand-new feature with no bug history (use capability or interaction lanes).
 * - The test defines broad baseline contracts (use the invariant lane file).
 *
 * Fast decision rule:
 * - If you can describe it as "this broke before", it belongs here.
 *
 * This file is compile-only and validated by `pnpm check`.
 */

type AuthContext = {
    userId: string;
    role: "staff" | "member";
};

const UpdateBookContract = createContract({
    request: {
        body: {
            title: z.string(),
        },
        params: {
            isbn: z.string(),
        },
    },
    response: z.object({
        updated: z.boolean(),
    }),
});

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

/**
 * Regression-001: authorization after validation must keep typed req payload.
 */
createHandler(
    UpdateBookContract,
    async (_req, _auth) => ({ data: { updated: true } }),
    {
        access: "protected",
        security: {
            authenticate: async () => ({ userId: "r-1", role: "staff" as const }),
            authorizationBeforeValidation: false,
            authorize: async ({ req, auth }) => {
                type _body = Expect<Equal<typeof req.body, { title: string }>>;
                type _auth = Expect<Extends<typeof auth, AuthContext>>;
                return auth.role === "staff" && req.body.title.length > 0;
            },
        },
    },
);

/**
 * Regression-002: paginated contracts must always return pagination metadata.
 */
// @ts-expect-error paginated contracts require pagination payload
createHandler(ListBooksContract, async (_req) => ({ data: [{ isbn: "x" }] }));

/**
 * Regression-003: optional auth remains optional inside handlers.
 */
createHandler(
    UpdateBookContract,
    async (_req, auth) => {
        type _optionalHasUndefined = Expect<Extends<undefined, typeof auth>>;
        type _optionalAuthShape = Expect<Extends<Exclude<typeof auth, undefined>, AuthContext>>;
        return { data: { updated: true } };
    },
    {
        access: "optional",
        security: {
            authenticate: async () => ({ userId: "r-2", role: "member" as const }),
        },
    },
);

/**
 * Regression-004: request payload inference must not degrade to any.
 */
createHandler(UpdateBookContract, async (req) => {
    type _bodyNotAny = ExpectFalse<IsAny<typeof req.body>>;
    return { data: { updated: true } };
});

/**
 * Regression-005: contract response still includes the error envelope branch.
 */
type UpdateBookContractResponse = z.infer<typeof UpdateBookContract.response>;
type UpdateBookErrorResponse = Extract<UpdateBookContractResponse, { success: false }>;
type _hasErrorEnvelope = Expect<Equal<UpdateBookErrorResponse["success"], false>>;
