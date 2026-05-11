/**
 * @file types.core.ts
 *
 * Shared core type definitions used across contract creation, response building,
 * handler execution, and access control.
 *
 * SECTIONS:
 * 1. RESPONSE FORMAT TYPES - API envelope and pagination-related types
 * 2. HANDLER DX TYPES - Generic handler return type helpers
 * 3. HANDLER SECURITY TYPES - Access/auth/authz options and contracts
 */

import type { CookieOptions, Request } from "express";
import type createHttpError from "http-errors";
import type { input as Input, ZodType, ZodTypeAny } from "zod";

// ============================================================================
// SECTION 1: RESPONSE FORMAT TYPES
// ============================================================================

/**
 * Input shape for pagination metadata returned by handlers.
 *
 * `page` is 1-based. `offset` and `hasNextPage` are optional and will be
 * computed if omitted.
 */
export type PaginationInput = {
    totalCount: number;
    page: number;
    limit: number;
    offset?: number;
    hasNextPage?: boolean;
};

/**
 * Fully computed pagination metadata used in response envelopes.
 */
export type PaginationMeta = {
    totalCount: number;
    limit: number;
    offset: number;
    hasNextPage: boolean;
};

/**
 * Helper that makes `data` optional when the response data itself is optional.
 */
export type DataField<TData> = undefined extends TData
    ? { data?: TData }
    : { data: TData };

/**
 * Successful response envelope for contract responses.
 */
export type SuccessResponse<TData, TPaginated extends boolean> =
    TPaginated extends true
    ? DataField<TData> & {
        success: true;
        meta: {
            timestamp: string;
            pagination: PaginationMeta;
        };
    }
    : DataField<TData> & {
        success: true;
        meta: {
            timestamp: string;
        };
    };

/**
 * Error response envelope for contract responses.
 */
export type ErrorResponse = {
    success: false;
    error?: unknown;
};

/**
 * Full response union for a contract (success or error).
 */
export type ContractResponse<TData, TPaginated extends boolean> =
    | SuccessResponse<TData, TPaginated>
    | ErrorResponse;

/**
 * Success payload used before response validation/sanitization.
 */
export type SuccessResponsePayload<TData> = {
    success: true;
    data: TData;
    meta: {
        timestamp: string;
        pagination?: PaginationMeta;
    };
};

// ============================================================================
// SECTION 2: HANDLER DX TYPES
// ============================================================================

/**
 * Declarative cookie operation returned by createHandler.
 *
 * Operations are applied in array order after the response payload is validated
 * and before the JSON body is sent. Cookie operations only run for successful
 * handler responses (errors skip them).
 *
 * @example
 * return {
 *   data: { token },
 *   cookies: [
 *     {
 *       action: "set",
 *       name: "session",
 *       value: token,
 *       options: { httpOnly: true, sameSite: "lax" },
 *     },
 *     { action: "clear", name: "legacy-session" },
 *   ],
 * };
 */
export type CookieOperation =
    | {
        action: "set";
        name: string;
        value: string | number | boolean | Record<string, unknown>;
        options?: CookieOptions;
    }
    | {
        action: "clear";
        name: string;
        options?: CookieOptions;
    };

/**
 * Successful handler result shape required by createHandler.
 *
 * For paginated contracts, `pagination` is required. For non-paginated
 * contracts, `pagination` must be omitted.
 *
 * Optional `cookies` allow declarative response cookies to be set or cleared
 * when the handler succeeds.
 */
export type HandlerSuccessResult<
    TResponseSchema extends ZodTypeAny,
    TPaginated extends boolean,
> = {
    data: Input<TResponseSchema>;
    statusCode?: number;
    cookies?: CookieOperation[];
} & (TPaginated extends true
    ? { pagination: PaginationInput }
    : { pagination?: undefined });

/**
 * Type for a validated Express request with strong typing.
 *
 * Maps a validated request schema type to Express's `Request` type, automatically
 * extracting and typing the `params`, `body`, and `query` properties based on the
 * inferred schema type. If a property is not defined in the schema, it defaults to
 * a sensible fallback type.
 */
export type ValidatedRequest<T> = Request<
    T extends { params: infer P } ? P : Record<string, string>,
    any,
    T extends { body: infer B } ? B : unknown,
    T extends { query: infer Q } ? Q : Record<string, unknown>
>;

// ============================================================================
// SECTION 3: HANDLER SECURITY TYPES
// ============================================================================

/**
 * Utility that allows both sync and async returns.
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Access modes supported by createHandler.
 */
export type AccessMode = "public" | "protected" | "optional";

/**
 * Authentication callback contract used by framework handlers.
 *
 * Important typing note for this repository:
 * in handler-first call shapes, TypeScript can lose `TAuthContext` inference
 * when this callback uses an unannotated parameter (for example
 * `authenticate: async (req) => ({ ... })`).
 *
 * If the callback needs `req`, annotate it explicitly:
 * `authenticate: async (req: Request) => ({ ... })`.
 *
 * If `req` is not needed, prefer parameterless:
 * `authenticate: async () => ({ ... })`.
 *
 * @typeParam TAuthContext
 * Auth context shape returned by authentication and propagated to handlers/authorizers.
 *
 * @typeParam TRequest
 * Request type accepted by the callback.
 *
 * @example
 * type JwtAuth = { email: string };
 *
 * const authenticate: Authenticator<JwtAuth> = async (req: Request) => {
 *   const header = req.headers.authorization;
 *   if (!header) {
 *     return null;
 *   }
 *
 *   return { email: "user@example.com" };
 * };
 *
 * @see docs/rules/create-handler-auth-inference-limitations.md
 */
export type Authenticator<
    TAuthContext,
    TRequest extends Request<any, any, any, any> = Request,
> = (
    req: TRequest,
) => MaybePromise<TAuthContext | null | undefined>;

/**
 * Authorization policy callback.
 *
 * Return true to allow the request; false to deny.
 */
export type Authorizer<
    TAuthContext,
    TRequest extends Request<any, any, any, any> = Request,
> = (
    params: {
        req: TRequest;
        auth: TAuthContext;
    },
) => MaybePromise<boolean>;

/**
 * Error mapper for authentication/authorization failures.
 */
export type AuthErrorMapper<TRequest extends Request<any, any, any, any> = Request> = (
    req: TRequest,
) => createHttpError.HttpError;

/**
 * Security configuration for createHandler.
 *
 * Provides authentication, authorization, and auth schema validation options.
 */
export type SecurityOptions<
    TAuthContext,
    TRequest extends Request<any, any, any, any> = Request,
> = {
    /**
     * Authentication callback used to build auth context for protected/optional handlers.
     *
     * Edge case:
     * In generic object-literal call sites, unannotated callback parameters can cause
     * `TAuthContext` to degrade to `unknown`.
     *
     * Recommended patterns:
     * - `authenticate: async (req: Request) => ({ ... })` when request access is needed.
     * - `authenticate: async () => ({ ... })` when request access is not needed.
     *
     * @see docs/rules/create-handler-auth-inference-limitations.md
     */
    authenticate?: Authenticator<TAuthContext, TRequest>;
    /**
     * When true, run authorization after request validation so `authorize` receives
     * typed body/query/params.
     */
    validateBeforeAuthorization?: boolean;
    /**
     * Authorization policy or policies evaluated for the request.
     */
    authorize?:
    | Authorizer<TAuthContext, TRequest>
    | Array<Authorizer<TAuthContext, TRequest>>;
    /**
     * Optional schema to validate the authentication result.
     */
    authSchema?: ZodType<TAuthContext>;
};

/**
 * Error mapper overrides for auth-related failures.
 */
export type HandlerErrorMappers<TRequest extends Request<any, any, any, any> = Request> = {
    unauthenticated?: AuthErrorMapper<TRequest>;
    unauthorized?: AuthErrorMapper<TRequest>;
};

/**
 * Top-level handler options accepted by createHandler.
 */
export type HandlerOptions<
    TAccess extends AccessMode,
    TAuthContext,
    TRequest extends Request<any, any, any, any> = Request,
> = {
    access?: TAccess;
    security?: SecurityOptions<TAuthContext, TRequest>;
    errors?: HandlerErrorMappers<TRequest>;
};
