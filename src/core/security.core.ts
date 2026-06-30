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

type AuthorizationExecutionParams<
    TAuthContext,
    TAccess extends AccessMode,
    TRequest extends Request,
> = {
    req: TRequest;
    access: TAccess;
    auth?: TAuthContext;
    authorizers: Array<Authorizer<TAuthContext, TRequest>>;
    errors?: HandlerErrorMappers<TRequest>;
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
 * Evaluates the provided authorizers in order with logical-AND semantics,
 * short-circuiting on the first policy that returns false.
 *
 * Behavior:
 * - When access is `protected` and auth is missing, throws an unauthorized error.
 * - For `optional` access with missing auth, authorization is bypassed.
 * - When any authorizer returns false, a forbidden error is thrown.
 * - Error mappers in `errors.unauthorized` override default failures.
 *
 * This is called twice by the handler runtime: once for the `beforeValidation`
 * bucket (with the raw request) and once for the `afterValidation` bucket
 * (with the validated request).
 */
export async function executeAuthorizationStage<
    TAuthContext,
    TAccess extends AccessMode,
    TRequest extends Request,
>(params: AuthorizationExecutionParams<TAuthContext, TAccess, TRequest>): Promise<void> {
    const { req, access, auth, authorizers, errors } = params;

    if (auth == null) {
        if (access === 'protected') {
            throw errors?.unauthorized?.(req) ?? new createHttpError.Unauthorized('Unauthorized');
        }

        return;
    }

    for (const authorize of authorizers) {
        const isAllowed = await authorize({ req, auth });
        if (!isAllowed) {
            throw errors?.unauthorized?.(req) ?? new createHttpError.Forbidden('Forbidden');
        }
    }
}

// =========================================================================
// SECTION 2: POLICY COMBINATORS
// =========================================================================

/**
 * Combines multiple authorizers with logical-AND semantics.
 *
 * Returns a single composite authorizer that passes only when every input
 * policy passes, short-circuiting on the first failure.
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
 *   async ({ auth }) => auth.role === "staff",
 *   async ({ req }) => req.body.title.length > 0,
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
 * Policies are evaluated in order and stop at the first success.
 *
 * @example
 * const policy = anyOf<AuthContext>([
 *   async ({ auth }) => auth.role === "staff",
 *   async ({ auth }) => auth.scopes.includes("books:write"),
 * ]);
 */
export function anyOf<TContext, TRequest extends Request>(
    policies: Array<Authorizer<TContext, NoInfer<TRequest>>>,
): Authorizer<TContext, TRequest>;
export function anyOf<TContext, TRequest extends Request = Request>(
    policies: Array<Authorizer<TContext, TRequest>>,
): Authorizer<TContext, TRequest>;
export function anyOf(policies: Array<Authorizer<any, Request>>): Authorizer<any, Request> {
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
 * Useful for denial rules or composing policies with allOf/anyOf.
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
export function not(policy: Authorizer<any, Request>): Authorizer<any, Request> {
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
