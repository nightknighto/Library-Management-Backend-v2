/**
 * HUMAN GUIDE - Interaction lane
 *
 * Put tests here when:
 * - A scenario combines two or more feature axes and you need to prove they work together.
 * - Examples: protected + authSchema + authorize-after-validation + pagination.
 *
 * Do not put tests here when:
 * - The test checks only one isolated behavior (use the capability lane file).
 * - The test is a permanent baseline contract with no intended variation (use the invariant lane file).
 *
 * Fast decision rule:
 * - If removing one feature from the scenario changes the value of the test, it belongs here.
 *
 * This file is compile-only and validated by `pnpm check`.
 */

import createHttpError from "http-errors";
import { z } from "zod";
import {
    createHandler,
    createHandlerFactory,
    type AfterAuthorizationRequest,
} from "../create-handler.core.ts";
import { createContract } from "../create-contract.core.ts";
import type { Equal, Expect, Extends } from "./type-test.utils.ts";

type ScopedAuthContext = {
    userId: string;
    role: "staff" | "member";
    scopes: string[];
};

const ScopedAuthSchema = z.object({
    userId: z.string(),
    role: z.enum(["staff", "member"]),
    scopes: z.array(z.string()),
});

const SearchBooksContract = createContract({
    request: {
        query: {
            q: z.string(),
            page: z.coerce.number().default(1),
            limit: z.coerce.number().default(10),
        },
    },
    response: z.array(z.string()),
    paginated: true,
});

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

type _afterAuthorizationRequestBody = Expect<
    Equal<
        AfterAuthorizationRequest<typeof UpdateBookContract>["body"],
        { title: string }
    >
>;

createHandler(
    SearchBooksContract,
    async (_req, auth) => {
        type _auth = Expect<Extends<typeof auth, ScopedAuthContext>>;
        return {
            data: ["book-1"],
            pagination: {
                totalCount: 1,
                page: 1,
                limit: 10,
            },
        };
    },
    {
        access: "protected",
        security: {
            authenticate: async () => ({
                userId: "u-10",
                role: "staff" as const,
                scopes: ["books:read"],
            }),
            authSchema: ScopedAuthSchema,
            validateBeforeAuthorization: true,
            authorize: [
                async ({ req, auth }) => {
                    type _query = Expect<
                        Extends<typeof req.query, { q: string; page: number; limit: number }>
                    >;
                    type _auth = Expect<Extends<typeof auth, ScopedAuthContext>>;
                    return auth.scopes.includes("books:read") && req.query.limit <= 50;
                },
                async ({ auth }) => auth.role === "staff",
            ],
        },
        errors: {
            unauthorized: () => new createHttpError.Forbidden("Forbidden"),
        },
    },
);

createHandler(
    UpdateBookContract,
    async (_req, auth) => {
        type _authHasUndefined = Expect<Extends<undefined, typeof auth>>;
        type _authShape = Expect<Extends<Exclude<typeof auth, undefined>, ScopedAuthContext>>;
        return { data: { updated: true } };
    },
    {
        access: "optional",
        security: {
            authenticate: async () => ({
                userId: "u-11",
                role: "member" as const,
                scopes: ["books:write"],
            }),
            authSchema: ScopedAuthSchema,
            authorize: async ({ auth }) => auth.scopes.includes("books:write"),
        },
        errors: {
            unauthenticated: () => new createHttpError.Unauthorized("Unauthorized"),
        },
    },
);

const protectedFactory = createHandlerFactory<ScopedAuthContext>({
    access: "protected",
    security: {
        authenticate: async () => ({
            userId: "u-12",
            role: "staff" as const,
            scopes: ["books:write"],
        }),
        authSchema: ScopedAuthSchema,
    },
});

protectedFactory(
    UpdateBookContract,
    async (_req, auth) => {
        type _auth = Expect<Extends<typeof auth, ScopedAuthContext>>;
        return { data: { updated: true } };
    },
    {
        access: "protected",
        security: {
            validateBeforeAuthorization: true,
            authorize: async ({ req, auth }) => {
                type _body = Expect<Equal<typeof req.body, { title: string }>>;
                type _auth = Expect<Extends<typeof auth, ScopedAuthContext>>;
                return auth.role === "staff" && req.body.title.length > 0;
            },
        },
    },
);
