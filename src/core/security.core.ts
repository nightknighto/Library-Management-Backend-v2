/**
 * @file security.core.ts
 *
 * Authentication and authorization primitives for createHandler.
 * This module centralizes auth execution, policy composition helpers,
 * and default/override merging behavior.
 */

import type { Request } from 'express';
import createHttpError from 'http-errors';
import type { AccessMode, Authorizer, HandlerErrorMappers, SecurityOptions } from './types.core.ts';

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

type SecurityExecutionResult<TAuthContext, TAccess extends AccessMode> = TAccess extends 'protected'
    ? { auth: TAuthContext }
    : TAccess extends 'optional'
    ? { auth?: TAuthContext }
    : { auth?: undefined };

type AuthorizationExecutionParams<TAuthContext, TRequest extends Request> = {
    req: TRequest;
    auth?: TAuthContext;
    authorizers: Array<Authorizer<TAuthContext, TRequest>>;
};

// Prevents TRequest from being inferred from policy arrays when an explicit
// request type is supplied (used by allOf/anyOf/not overloads).
type NoInfer<T> = [T][T extends unknown ? 0 : never];

/**
 * Executes the authentication stage for a request.
 *
 * Behavior:
 * - If no authenticator is provided and access is `protected`, throws 401.
 * - If authenticator returns null/undefined and access is `protected`, throws 401.
 * - If authSchema is provided, its parse result becomes the auth context.
 * - If authSchema parsing fails, throws unauthenticated error.
 * - Error mappers in `errors.unauthenticated` override default failures.
 */
export async function executeAuthenticationStage<
    TAuthContext,
    TAccess extends AccessMode,
    TRequest extends Request,
>(
    params: AuthenticationExecutionParams<TAuthContext, TAccess, TRequest>,
): Promise<SecurityExecutionResult<TAuthContext, TAccess>> {
    const { req, access, security, errors } = params;

    const authenticate = security?.authenticate;

    if (!authenticate) {
        if (access === 'protected') {
            throw (
                errors?.unauthenticated?.(req) ??
                new createHttpError.Unauthorized('Unauthenticated')
            );
        }

        return {} as SecurityExecutionResult<TAuthContext, TAccess>;
    }

    const maybeAuth = await authenticate(req);
    const auth = maybeAuth ?? null;

    if (auth === null) {
        if (access === 'protected') {
            throw (
                errors?.unauthenticated?.(req) ??
                new createHttpError.Unauthorized('Unauthenticated')
            );
        }

        return {} as SecurityExecutionResult<TAuthContext, TAccess>;
    }

    let parsedAuth: TAuthContext;

    try {
        parsedAuth = security?.authSchema ? await security.authSchema.parseAsync(auth) : auth;
    } catch (_e) {
        throw (
            errors?.unauthenticated?.(req) ??
            new createHttpError.Unauthorized('Invalid authentication data')
        );
    }

    return { auth: parsedAuth } as SecurityExecutionResult<TAuthContext, TAccess>;
}

/**
 * Executes a single authorization bucket for a request.
 *
 * Evaluates the provided authorizers in order with logical-AND semantics. Each
 * authorizer allows by returning `true` and denies by throwing an `HttpError`.
 *
 * Behavior:
 * - When auth is missing, the bucket is bypassed (no policies run).
 * - Authorizers are awaited in order; the first thrown `HttpError` propagates
 *   verbatim (its status code and message become the response) and short-circuits
 *   the remaining authorizers.
 * - Non-`HttpError` exceptions propagate unchanged as unexpected errors (500).
 *
 * This is called twice by the handler runtime: once for the `beforeValidation`
 * bucket (with the raw request) and once for the `afterValidation` bucket
 * (with the validated request).
 */
export async function executeAuthorizationStage<TAuthContext, TRequest extends Request>(
    params: AuthorizationExecutionParams<TAuthContext, TRequest>,
): Promise<void> {
    const { req, auth, authorizers } = params;

    if (auth == null) {
        return;
    }

    for (const authorize of authorizers) {
        await authorize({ req, auth });
    }
}

// =========================================================================
// SECTION 2: POLICY COMBINATORS
// =========================================================================

/**
 * Combines multiple authorizers with logical-AND semantics.
 *
 * Returns a single composite authorizer that allows only when every input
 * policy allows, short-circuiting on the first thrown denial.
 *
 * - A policy that throws an `HttpError` short-circuits the loop; that error
 *   propagates verbatim (status code and message preserved).
 * - A policy that throws a non-`HttpError` propagates unchanged.
 *
 * When to use it:
 * - To AND-combine policies INSIDE an `anyOf` branch or under `not` (a handler's
 *   `authorize` bucket array cannot express nested AND).
 * - To build a reusable, exportable policy as a single `Authorizer` value.
 *
 * When NOT to use it:
 * - For top-level policies in an `authorize` bucket. The bucket already
 *   AND-composes its array elements, so `beforeValidation: [a, b, c]` is
 *   preferred over `beforeValidation: [allOf([a, b, c])]`.
 *
 * Use an explicit request type if authorizers expect a narrowed request.
 *
 * @example
 * // Essential nesting: AND inside an OR branch.
 * const policy = anyOf<AuthContext>([
 *   isStaff,
 *   allOf<AuthContext>([hasRegisteredUser, ownsResource]),
 * ]);
 *
 * @example
 * // Reusable composite with typed request.
 * const policy = allOf<AuthContext, AfterAuthorizationRequest<typeof contract>>([
 *   async ({ auth }) => {
 *     if (auth.role !== "staff") throw new createHttpError.Forbidden("staff only");
 *     return true;
 *   },
 *   async ({ req }) => {
 *     if (req.body.title.length === 0) throw new createHttpError.BadRequest("empty title");
 *     return true;
 *   },
 * ]);
 */
export function allOf<TContext, TRequest extends Request>(
    policies: Array<Authorizer<TContext, NoInfer<TRequest>>>,
): Authorizer<TContext, TRequest>;
export function allOf<TContext, TRequest extends Request = Request>(
    policies: Array<Authorizer<TContext, TRequest>>,
): Authorizer<TContext, TRequest>;
export function allOf(policies: Array<Authorizer<any, Request>>): Authorizer<any, Request> {
    return async (params) => {
        for (const policy of policies) {
            await policy(params);
        }

        return true;
    };
}

/**
 * Combines multiple authorizers so that any may succeed (logical-OR).
 *
 * Returns a single composite authorizer that allows as soon as one branch
 * allows.
 *
 * - The first branch that resolves (does not throw) short-circuits the composite.
 * - A branch `HttpError` is treated as a denial and swallowed; the next branch
 *   is tried.
 * - A branch that throws a non-`HttpError` propagates immediately and aborts the OR.
 * - When every branch denies (or the list is empty), throws `denialError` if
 *   provided, otherwise `new Forbidden('Forbidden')` (403). The exact instance
 *   is thrown as-is.
 *
 * `denialError` is useful when the OR should fail with a specific status/message
 * (e.g. a 404 to avoid leaking resource existence).
 *
 * Use an explicit request type if authorizers expect a narrowed request.
 *
 * @example
 * const policy = anyOf<AuthContext>([
 *   async ({ auth }) => {
 *     if (auth.role !== "staff") throw new createHttpError.Forbidden("staff only");
 *     return true;
 *   },
 *   async ({ auth }) => {
 *     if (!auth.scopes.includes("books:write")) throw new createHttpError.Forbidden("no scope");
 *     return true;
 *   },
 * ]);
 *
 * @example
 * // Custom denial error for the whole OR when every branch denies.
 * const policy = anyOf<AuthContext>(
 *   [isStaff, ownsResource],
 *   new createHttpError.NotFound("resource not found"),
 * );
 */
export function anyOf<TContext, TRequest extends Request>(
    policies: Array<Authorizer<TContext, NoInfer<TRequest>>>,
    denialError?: createHttpError.HttpError,
): Authorizer<TContext, TRequest>;
export function anyOf<TContext, TRequest extends Request = Request>(
    policies: Array<Authorizer<TContext, TRequest>>,
    denialError?: createHttpError.HttpError,
): Authorizer<TContext, TRequest>;
export function anyOf(
    policies: Array<Authorizer<any, Request>>,
    denialError?: createHttpError.HttpError,
): Authorizer<any, Request> {
    return async (params) => {
        for (const policy of policies) {
            try {
                await policy(params);
                return true;
            } catch (error) {
                if (!(error instanceof createHttpError.HttpError)) {
                    throw error;
                }
            }
        }

        throw denialError ?? new createHttpError.Forbidden('Forbidden');
    };
}

/**
 * Negates an authorizer (logical-NOT).
 *
 * Allows when the wrapped policy denies; denies when the wrapped policy allows.
 *
 * - If the wrapped policy throws an `HttpError`, `not` resolves with `true`
 *   (the wrapped denial is swallowed).
 * - If the wrapped policy resolves with `true`, `not` throws `denialError` if
 *   provided, otherwise `new Forbidden('Forbidden')` (403). The exact instance
 *   is thrown as-is.
 * - If the wrapped policy throws a non-`HttpError`, it propagates unchanged.
 *
 * Useful for denial rules or composing policies with allOf/anyOf.
 *
 * @example
 * const policy = not<AuthContext>(
 *   async ({ auth }) => {
 *     if (auth.role === "member") throw new createHttpError.Forbidden("members blocked");
 *     return true;
 *   },
 * );
 *
 * @example
 * // Custom denial error when the wrapped policy allows.
 * const policy = not<AuthContext>(isPublicUser, new createHttpError.Forbidden("public not allowed"));
 */
export function not<TContext, TRequest extends Request>(
    policy: Authorizer<TContext, NoInfer<TRequest>>,
    denialError?: createHttpError.HttpError,
): Authorizer<TContext, TRequest>;
export function not<TContext, TRequest extends Request = Request>(
    policy: Authorizer<TContext, TRequest>,
    denialError?: createHttpError.HttpError,
): Authorizer<TContext, TRequest>;
export function not(
    policy: Authorizer<any, Request>,
    denialError?: createHttpError.HttpError,
): Authorizer<any, Request> {
    return async (params) => {
        try {
            await policy(params);
        } catch (error) {
            if (!(error instanceof createHttpError.HttpError)) {
                throw error;
            }
            return true;
        }

        throw denialError ?? new createHttpError.Forbidden('Forbidden');
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
 *
 * `security.authorize` is merged per bucket: each authorization bucket
 * (`beforeValidation` / `afterValidation`) provided by the override replaces the
 * matching default bucket; buckets the override omits are inherited from the
 * defaults. Buckets are never concatenated.
 *
 * Call-site values win over defaults when the same key is provided.
 */
export function mergeHandlerSecurityDefaults<TAuthContext, TRequest extends Request = Request>(
    defaults:
        | {
            access?: AccessMode;
            security?: SecurityOptions<TAuthContext, TRequest>;
            errors?: HandlerErrorMappers<TRequest>;
        }
        | undefined,
    overrides:
        | {
            access?: AccessMode;
            security?: SecurityOptions<TAuthContext, TRequest>;
            errors?: HandlerErrorMappers<TRequest>;
        }
        | undefined,
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
            authorize: {
                ...defaults?.security?.authorize,
                ...overrides?.security?.authorize,
            },
        },
        errors: {
            ...defaults?.errors,
            ...overrides?.errors,
        },
    };
}
