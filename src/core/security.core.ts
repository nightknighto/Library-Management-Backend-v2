/**
 * @file security.core.ts
 *
 * Authentication and authorization primitives for createHandler.
 * This module centralizes auth execution, policy composition helpers,
 * and default/override merging behavior.
 */

import createHttpError from "http-errors";
import type { Request } from "express";
import type {
    AccessMode,
    Authenticator,
    Authorizer,
    HandlerErrorMappers,
    MaybePromise,
    SecurityOptions,
} from "./types.core.ts";

// =========================================================================
// SECTION 1: EXECUTION TYPES
// =========================================================================

type AuthenticationExecutionParams<
    TAuthContext,
    TAccess extends AccessMode,
    TRequest extends Request,
> = {
    req: TRequest;
    access: TAccess;
    security?: SecurityOptions<TAuthContext, TRequest>;
    errors?: HandlerErrorMappers<TRequest>;
};

type SecurityExecutionResult<
    TAuthContext,
    TAccess extends AccessMode,
> = TAccess extends "protected"
    ? { auth: TAuthContext }
    : TAccess extends "optional"
    ? { auth?: TAuthContext }
    : { auth?: undefined };

type AuthorizationExecutionParams<
    TAuthContext,
    TAccess extends AccessMode,
    TRequest extends Request,
> = {
    req: TRequest;
    access: TAccess;
    auth?: TAuthContext;
    security?: SecurityOptions<TAuthContext, TRequest>;
    errors?: HandlerErrorMappers<TRequest>;
};

// Prevents TRequest from being inferred from policy arrays when an explicit
// request type is supplied (used by allOf/anyOf/not overloads).
type NoInfer<T> = [T][T extends unknown ? 0 : never];

/**
 * Normalizes authorize config into a flat array for iteration.
 */
function normalizeAuthorizers<TAuthContext, TRequest extends Request>(
    authorize: SecurityOptions<TAuthContext, TRequest>["authorize"],
): Array<Authorizer<TAuthContext, TRequest>> {
    if (!authorize) {
        return [];
    }

    return Array.isArray(authorize) ? authorize : [authorize];
}

/**
 * Executes the authentication stage for a request.
 *
 * Behavior:
 * - If no authenticator is provided and access is `protected`, throws 401.
 * - If authenticator returns null/undefined and access is `protected`, throws 401.
 * - If authSchema is provided, its parse result becomes the auth context.
 */
export async function executeAuthenticationStage<
    TAuthContext,
    TAccess extends AccessMode,
    TRequest extends Request,
>(
    params: AuthenticationExecutionParams<TAuthContext, TAccess, TRequest>,
): Promise<SecurityExecutionResult<TAuthContext, TAccess>> {
    const {
        req,
        access,
        security,
        errors,
    } = params;

    const authenticate = security?.authenticate;

    if (!authenticate) {
        if (access === "protected") {
            throw (
                errors?.unauthenticated?.(req)
                ?? new createHttpError.Unauthorized("Unauthenticated")
            );
        }

        return {} as SecurityExecutionResult<TAuthContext, TAccess>;
    }

    const maybeAuth = await authenticate(req);
    const auth = maybeAuth ?? null;

    if (auth === null) {
        if (access === "protected") {
            throw (
                errors?.unauthenticated?.(req)
                ?? new createHttpError.Unauthorized("Unauthenticated")
            );
        }

        return {} as SecurityExecutionResult<TAuthContext, TAccess>;
    }

    let parsedAuth: TAuthContext;

    try {
        parsedAuth = security?.authSchema
            ? await security.authSchema.parseAsync(auth)
            : auth;
    } catch (e) {
        throw (
            errors?.unauthenticated?.(req)
            ?? new createHttpError.Unauthorized("Invalid authentication data")
        );
    }

    return { auth: parsedAuth } as SecurityExecutionResult<TAuthContext, TAccess>;
}

/**
 * Executes the authorization stage for a request.
 *
 * When access is `protected` and no auth is available, this throws an
 * unauthorized error. For `optional` access, missing auth bypasses authorization.
 *
 * When authorizers are configured, each must return true; otherwise a forbidden
 * error is thrown.
 */
export async function executeAuthorizationStage<
    TAuthContext,
    TAccess extends AccessMode,
    TRequest extends Request,
>(
    params: AuthorizationExecutionParams<TAuthContext, TAccess, TRequest>,
): Promise<void> {
    const {
        req,
        access,
        auth,
        security,
        errors,
    } = params;

    if (auth == null) {
        if (access === "protected") {
            throw (
                errors?.unauthorized?.(req)
                ?? new createHttpError.Unauthorized("Unauthorized")
            );
        }

        return;
    }

    const authorizers = normalizeAuthorizers(security?.authorize);
    for (const authorize of authorizers) {
        const isAllowed = await authorize({ req, auth });
        if (!isAllowed) {
            throw (
                errors?.unauthorized?.(req)
                ?? new createHttpError.Forbidden("Forbidden")
            );
        }
    }
}

// =========================================================================
// SECTION 2: POLICY COMBINATORS
// =========================================================================

/**
 * Combines multiple authorizers so that all must succeed.
 *
 * Use an explicit request type if authorizers expect a narrowed request.
 *
 * @example
 * const policy = allOf<AuthContext, AfterAuthorizationRequest<typeof contract>>([
 *   async ({ auth }) => auth.role === "staff",
 *   async ({ req }) => req.body.title.length > 0,
 * ]);
 */
export function allOf<
    TContext,
    TRequest extends Request,
>(
    policies: Array<Authorizer<TContext, NoInfer<TRequest>>>,
): Authorizer<TContext, TRequest>;
export function allOf<
    TContext,
    TRequest extends Request = Request,
>(
    policies: Array<Authorizer<TContext, TRequest>>,
): Authorizer<TContext, TRequest>;
export function allOf(
    policies: Array<Authorizer<any, Request>>,
): Authorizer<any, Request> {
    return async (params) => {
        for (const policy of policies) {
            const result = await policy(params);
            if (!result) {
                return false;
            }
        }

        return true;
    };
}

/**
 * Combines multiple authorizers so that any may succeed.
 *
 * Use an explicit request type if authorizers expect a narrowed request.
 *
 * @example
 * const policy = anyOf<AuthContext>([
 *   async ({ auth }) => auth.role === "staff",
 *   async ({ auth }) => auth.scopes.includes("books:write"),
 * ]);
 */
export function anyOf<
    TContext,
    TRequest extends Request,
>(
    policies: Array<Authorizer<TContext, NoInfer<TRequest>>>,
): Authorizer<TContext, TRequest>;
export function anyOf<
    TContext,
    TRequest extends Request = Request,
>(
    policies: Array<Authorizer<TContext, TRequest>>,
): Authorizer<TContext, TRequest>;
export function anyOf(
    policies: Array<Authorizer<any, Request>>,
): Authorizer<any, Request> {
    return async (params) => {
        for (const policy of policies) {
            const result = await policy(params);
            if (result) {
                return true;
            }
        }

        return false;
    };
}

/**
 * Negates an authorizer result.
 *
 * @example
 * const policy = not<AuthContext>(async ({ auth }) => auth.role === "member");
 */
export function not<TContext, TRequest extends Request>(
    policy: Authorizer<TContext, NoInfer<TRequest>>,
): Authorizer<TContext, TRequest>;
export function not<TContext, TRequest extends Request = Request>(
    policy: Authorizer<TContext, TRequest>,
): Authorizer<TContext, TRequest>;
export function not(
    policy: Authorizer<any, Request>,
): Authorizer<any, Request> {
    return async (params) => {
        const result = await policy(params);
        return !result;
    };
}

// =========================================================================
// SECTION 3: DEFAULT MERGING
// =========================================================================

/**
 * Shallow-merges handler defaults with call-site overrides.
 *
 * Security and error mapper objects are merged by key so that callers can
 * override or extend defaults without replacing the entire object.
 */
export function mergeHandlerSecurityDefaults<
    TAuthContext,
    TRequest extends Request = Request,
>(
    defaults: {
        access?: AccessMode;
        security?: SecurityOptions<TAuthContext, TRequest>;
        errors?: HandlerErrorMappers<TRequest>;
    } | undefined,
    overrides: {
        access?: AccessMode;
        security?: SecurityOptions<TAuthContext, TRequest>;
        errors?: HandlerErrorMappers<TRequest>;
    } | undefined,
): {
    access?: AccessMode;
    security?: SecurityOptions<TAuthContext, TRequest>;
    errors?: HandlerErrorMappers<TRequest>;
} {
    return {
        access: overrides?.access ?? defaults?.access,
        security: {
            ...defaults?.security,
            ...overrides?.security,
        },
        errors: {
            ...defaults?.errors,
            ...overrides?.errors,
        },
    };
}

