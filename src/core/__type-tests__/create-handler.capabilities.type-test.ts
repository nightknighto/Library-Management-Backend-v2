import type { Request } from "express";
import createHttpError from "http-errors";
import { z } from "zod";
import {
    allOf,
    anyOf,
    createHandler,
    createHandlerFactory,
    not,
} from "../create-handler.core.ts";
import { createContract } from "../create-contract.core.ts";
import type {
    Equal,
    Expect,
    ExpectFalse,
    Extends,
    IsAny,
} from "./type-test.utils.ts";

/**
 * HUMAN GUIDE - Capability lane
 *
 * Put tests here when:
 * - You are validating exactly one feature axis in isolation.
 * - Examples: request typing only, auth typing only, pagination rule only.
 *
 * Do not put tests here when:
 * - The test intentionally combines multiple axes (use the interaction lane file).
 * - The test encodes a historical bug that must never return (use the regression lane file).
 *
 * Fast decision rule:
 * - If the test title can be phrased as "feature X works by itself", this file is correct.
 *
 * This file is compile-only and validated by `pnpm check`.
 */
type AuthContext = {
    userId: string;
    role: "staff" | "member";
};

const AuthSchema = z.object({
    userId: z.string(),
    role: z.enum(["staff", "member"]),
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
    response: z.array(z.string()),
    paginated: true,
});

createHandler(UpdateBookContract, async (req) => {
    type _bodyNotAny = ExpectFalse<IsAny<typeof req.body>>;
    type _bodyExact = Expect<
        Equal<typeof req.body, { title: string; totalQuantity: number }>
    >;
    type _paramsExact = Expect<Equal<typeof req.params, { isbn: string }>>;
    type _queryExact = Expect<Equal<typeof req.query, { dryRun: boolean }>>;

    return { data: { updated: true } };
});

// @ts-expect-error handler data must satisfy the response schema
createHandler(UpdateBookContract, async (_req) => ({ data: { updated: "no" } }));

createHandler(ListBooksContract, async (_req) => ({
    data: ["book-1"],
    pagination: {
        totalCount: 1,
        page: 1,
        limit: 10,
    },
}));

// @ts-expect-error paginated contracts require pagination in handler result
createHandler(ListBooksContract, async (_req) => ({ data: ["book-1"] }));

// @ts-expect-error non-paginated contracts do not accept pagination payload
createHandler(UpdateBookContract, async (_req) => ({
    data: { updated: true },
    pagination: {
        totalCount: 1,
        page: 1,
        limit: 10,
    },
}));

createHandler(
    UpdateBookContract,
    async (_req, auth) => {
        type _authExact = Expect<Extends<typeof auth, AuthContext>>;
        return { data: { updated: true } };
    },
    {
        access: "protected",
        security: {
            authenticate: async () => ({ userId: "u-1", role: "staff" as const }),
            authSchema: AuthSchema,
        },
    },
);

createHandler(
    UpdateBookContract,
    async (_req, auth) => {
        type _authExact = Expect<Extends<typeof auth, AuthContext>>;
        return { data: { updated: true } };
    },
    {
        access: "protected",
        security: {
            authenticate: async () => ({ userId: "u-1", role: "staff" as const }),
        },
    },
);

createHandler(
    UpdateBookContract,
    async (_req, auth) => {
        type _authNotAny = ExpectFalse<IsAny<typeof auth>>;
        type _authExact = Expect<Extends<typeof auth, AuthContext>>;
        return { data: { updated: true } };
    },
    {
        access: "protected",
        security: {
            authenticate: async () => ({ userId: "u-1", role: "staff" as const }),
        },
    },
);

createHandler(
    UpdateBookContract,
    async (_req, auth) => {
        type _authHasUndefined = Expect<Extends<undefined, typeof auth>>;
        type _authNotAny = ExpectFalse<IsAny<typeof auth>>;
        type _authShape = Expect<Extends<Exclude<typeof auth, undefined>, AuthContext>>;
        return { data: { updated: true } };
    },
    {
        access: "optional",
        security: {
            authenticate: async (_req: Request) => ({ userId: "u-2", role: "member" as const }),
        },
    },
);

// @ts-expect-error public handlers do not receive auth parameter
createHandler(UpdateBookContract, async (_req, _auth) => ({ data: { updated: true } }));

createHandler(
    UpdateBookContract,
    async (_req, _auth) => ({ data: { updated: true } }),
    {
        access: "protected",
        security: {
            authenticate: async () => ({ userId: "u-3", role: "staff" as const }),
            authSchema: AuthSchema,
            authorizationBeforeValidation: false,
            authorize: async ({ req, auth }) => {
                type _authorizedReqBody = Expect<
                    Equal<typeof req.body, { title: string; totalQuantity: number }>
                >;
                type _authorizedAuth = Expect<Extends<typeof auth, AuthContext>>;
                return auth.role === "staff" && req.body.title.length > 0;
            },
        },
    },
);

const composedPolicy = allOf<AuthContext>([
    async ({ auth }) => auth.role === "staff",
    anyOf<AuthContext>([
        async ({ auth }) => auth.userId.startsWith("u-"),
        not<AuthContext>(async ({ auth }) => auth.role === "member"),
    ]),
]);

createHandler(
    UpdateBookContract,
    async (_req, _auth) => ({ data: { updated: true } }),
    {
        access: "protected",
        security: {
            authenticate: async () => ({ userId: "u-4", role: "staff" as const }),
            authorize: composedPolicy,
        },
        errors: {
            unauthorized: (req) => {
                type _reqShape = Expect<Extends<typeof req, Request>>;
                return new createHttpError.Unauthorized("Unauthorized");
            },
            forbidden: (req) => {
                type _reqShape = Expect<Extends<typeof req, Request>>;
                return new createHttpError.Forbidden("Forbidden");
            },
        },
    },
);

const publicFactory = createHandlerFactory<AuthContext>({
    access: "public",
});

publicFactory(
    UpdateBookContract,
    // @ts-expect-error protected handlers require explicit access override for public-default factory
    async (_req: unknown, _auth: AuthContext) => {
        return { data: { updated: true } };
    },
);

publicFactory(
    UpdateBookContract,
    async (_req, auth) => {
        type _authExact = Expect<Extends<typeof auth, AuthContext>>;
        return { data: { updated: true } };
    },
    {
        access: "protected",
        security: {
            authenticate: async () => ({ userId: "u-5", role: "staff" as const }),
            authSchema: AuthSchema,
        },
    },
);
