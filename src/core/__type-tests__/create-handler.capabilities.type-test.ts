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

// @ts-expect-error handlers do not accept unknown top-level result keys
createHandler(UpdateBookContract, async (_req) => ({
    data: { updated: true },
    metax: { timestamp: "2026-01-01T00:00:00.000Z" },
}));

// @ts-expect-error paginated handlers do not accept unknown top-level result keys
createHandler(ListBooksContract, async (_req) => ({
    data: ["book-1"],
    pagination: {
        totalCount: 1,
        page: 1,
        limit: 10,
    },
    metax: { timestamp: "2026-01-01T00:00:00.000Z" },
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
            validateBeforeAuthorization: true,
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

createHandler(
    UpdateBookContract,
    async (_req, _auth) => ({ data: { updated: true } }),
    {
        access: "protected",
        security: {
            authenticate: async () => ({ userId: "u-3", role: "staff" as const }),
            authSchema: AuthSchema,
            validateBeforeAuthorization: false, // <============
            authorize: async ({ req, auth }) => {
                type _authorizedReqBody = Expect<Equal<typeof req, Request>>;
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
            unauthenticated: (req) => {
                type _reqShape = Expect<Extends<typeof req, Request>>;
                return new createHttpError.Unauthorized("Unauthenticated");
            },
            unauthorized: (req) => {
                type _reqShape = Expect<Extends<typeof req, Request>>;
                return new createHttpError.Unauthorized("Unauthorized");
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

const privateFactoryAuthSchemaAndAuthenticate = createHandlerFactory({
    access: "protected",
    security: {
        authSchema: AuthSchema,
        authenticate: async () => ({ userId: "u-5", role: "staff" as const }),
    },
});

privateFactoryAuthSchemaAndAuthenticate(
    UpdateBookContract,
    async (_req, auth) => {
        type _authExact = Expect<Extends<typeof auth, AuthContext>>;
        return { data: { updated: true } };
    },
    {
        security: {
            validateBeforeAuthorization: false, // <===========
            authorize: async ({ req, auth }) => {
                type _authorizedReqBody = Expect<Equal<typeof req, Request>>;
                type _authorizedAuth = Expect<Extends<typeof auth, AuthContext>>;
                return auth.role === "staff" && req.body.title.length > 0;
            },
        },
    },
);

privateFactoryAuthSchemaAndAuthenticate(
    UpdateBookContract,
    async (_req, auth) => {
        type _authExact = Expect<Extends<typeof auth, AuthContext>>;
        return { data: { updated: true } };
    },
    {
        security: {
            validateBeforeAuthorization: true, // <===========
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

const privateFactoryAuthenticateOnly = createHandlerFactory({
    access: "protected",
    security: {
        authenticate: async () => ({ userId: "u-5", role: "staff" as const }),
    }
})

privateFactoryAuthenticateOnly(
    UpdateBookContract,
    async (req, auth) => {
        type _authExact = Expect<Extends<typeof auth, AuthContext>>;
        return { data: { updated: true } };
    },
    {
        security: {
            authorize: async ({ req, auth }) => {
                type _authorizedReqBody = Expect<Equal<typeof req, Request>>;
                type _authorizedAuth = Expect<Extends<typeof auth, AuthContext>>;
                return auth.role === "staff" && req.body.title.length > 0;
            },
        }
    }
)

const privateFactoryValidationBeforeAuth = createHandlerFactory({
    access: "protected",
    security: {
        validateBeforeAuthorization: true, // <===========
        authenticate: async () => ({ userId: "u-5", role: "staff" as const }),
    }
})

privateFactoryValidationBeforeAuth(
    UpdateBookContract,
    async (_req, auth) => {
        type _authExact = Expect<Extends<typeof auth, AuthContext>>;
        return { data: { updated: true } };
    },
    {
        security: {
            authorize: async ({ req, auth }) => {
                type _authorizedReqBody = Expect<Equal<typeof req.body, { title: string; totalQuantity: number }>>;
                type _authorizedAuth = Expect<Extends<typeof auth, AuthContext>>;
                return auth.role === "staff" && req.body.title.length > 0;
            },
        }
    }
)

/**
 * Dedicated negative assertions for missing `security.authenticate`.
 */

createHandler(
    UpdateBookContract,
    async (_req, _auth) => ({ data: { updated: true } }),
    // @ts-expect-error protected handlers require security.authenticate
    {
        access: "protected",
        // security: {
        // authenticate: async () => ({ userId: "u-5", role: "staff" as const }),
        // }
    },
);

createHandler(
    UpdateBookContract,
    async (_req, _auth) => ({ data: { updated: true } }),
    {
        // @ts-expect-error optional handlers require security.authenticate
        access: "optional",
        // security: {
        // authenticate: async () => ({ userId: "u-5", role: "staff" as const }),
        // }
    },
);

const protectedFactoryWithoutAuthenticate = createHandlerFactory<AuthContext>({
    access: "protected",
});

// @ts-expect-error protected factory handlers require authenticate from defaults or call options
protectedFactoryWithoutAuthenticate(
    UpdateBookContract,
    async (_req: unknown, _auth: AuthContext) => {
        return { data: { updated: true } };
    },
);

const optionalFactoryWithoutAuthenticate = createHandlerFactory<AuthContext>({
    access: "optional",
});

// @ts-expect-error optional factory handlers require authenticate from defaults or call options
optionalFactoryWithoutAuthenticate(
    UpdateBookContract,
    async (_req: unknown, _auth: AuthContext) => {
        return { data: { updated: true } };
    },
    // {
    //     security: {
    //         authenticate: async () => ({ userId: "u-5", role: "staff" as const }),
    //     }
    // }
);

const protectedFactoryAuthSchemaWithoutAuthenticate = createHandlerFactory<AuthContext>({
    access: "protected",
    security: {
        authSchema: AuthSchema,
    },
});

// @ts-expect-error protected factory handlers with authSchema but no authenticate must fail
protectedFactoryAuthSchemaWithoutAuthenticate(
    UpdateBookContract,
    async (_req: unknown, _auth: AuthContext) => {
        return { data: { updated: true } };
    },
);

const optionalFactoryAuthSchemaWithoutAuthenticate = createHandlerFactory<AuthContext>({
    access: "optional",
    security: {
        authSchema: AuthSchema,
    },
});

// @ts-expect-error optional factory handlers with authSchema but no authenticate must fail
optionalFactoryAuthSchemaWithoutAuthenticate(
    UpdateBookContract,
    async (_req: unknown, _auth: AuthContext) => {
        return { data: { updated: true } };
    },
);

createHandler(
    UpdateBookContract,
    async (_req) => ({ data: { updated: true } }),
    {
        // @ts-expect-error public handlers must not accept security options
        security: {
            authenticate: async () => ({ userId: "u-public-1", role: "staff" as const }),
        },
    },
);

createHandler(
    UpdateBookContract,
    async (_req) => ({ data: { updated: true } }),
    {
        // @ts-expect-error public handlers must not accept security options
        security: {
            authorize: async () => true,
        },
    },
);

publicFactory(
    UpdateBookContract,
    async (_req) => ({ data: { updated: true } }),
    {
        // @ts-expect-error public factory handlers must not accept security options
        security: {
            authenticate: async () => ({ userId: "u-public-2", role: "staff" as const }),
        },
    },
);

createHandlerFactory<AuthContext>({
    access: "public",
    // @ts-expect-error public factories must not accept security defaults
    security: {
        authenticate: async () => ({ userId: "u-public-default-1", role: "staff" as const }),
    },
});

createHandlerFactory<AuthContext>({
    // @ts-expect-error public factories must not accept security defaults when access is omitted
    security: {
        authenticate: async () => ({ userId: "u-public-default-2", role: "staff" as const }),
    },
});

publicFactory(
    UpdateBookContract,
    async (_req) => ({ data: { updated: true } }),
    {
        // @ts-expect-error public factory handlers must not accept security options even when access is explicit
        access: "public",
        // @ts-expect-error public factory handlers must not accept security options even when access is explicit
        security: {
            authorize: async () => true,
        },
    },
);