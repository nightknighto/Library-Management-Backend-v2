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

import type { CookieOptions, Request } from 'express';
import type createHttpError from 'http-errors';
import type { input as Input, ZodType, ZodTypeAny } from 'zod';

// ============================================================================
// SECTION 1: RESPONSE FORMAT TYPES
// ============================================================================

/**
 * Input shape for pagination metadata returned by handlers.
 *
 * `page` is 1-based. `offset` and `hasNextPage` are optional and will be
 * computed if omitted.
 *
 * @example
 * const pagination: PaginationInput = { totalCount: 120, page: 2, limit: 20 };
 */
export type PaginationInput = {
    /**
     * Total number of records across all pages.
     */
    totalCount: number;
    /**
     * Current page number (1-based).
     */
    page: number;
    /**
     * Number of items per page.
     */
    limit: number;
    /**
     * Optional offset override. If omitted, computed as (page - 1) * limit.
     */
    offset?: number;
    /**
     * Optional next-page hint. If omitted, computed as page * limit < totalCount.
     */
    hasNextPage?: boolean;
};

/**
 * Fully computed pagination metadata used in response envelopes.
 *
 * @example
 * const meta: PaginationMeta = { totalCount: 120, limit: 20, offset: 20, hasNextPage: true };
 */
export type PaginationMeta = {
    /**
     * Total number of records across all pages.
     */
    totalCount: number;
    /**
     * Number of items per page.
     */
    limit: number;
    /**
     * Zero-based offset into the full dataset.
     */
    offset: number;
    /**
     * True when another page exists after the current page.
     */
    hasNextPage: boolean;
};

/**
 * Helper that makes `data` optional when the response data itself is optional.
 */
export type DataField<TData> = undefined extends TData ? { data?: TData } : { data: TData };

/**
 * Successful response envelope for contract responses.
 *
 * @example
 * type Success = SuccessResponse<{ id: string }, false>;
 */
export type SuccessResponse<TData, TPaginated extends boolean> = TPaginated extends true
    ? DataField<TData> & {
        success: true;
        meta: {
            /**
             * ISO timestamp for when the response was generated.
             */
            timestamp: string;
            /**
             * Pagination metadata returned when contract.pagination.response is true.
             */
            pagination: PaginationMeta;
        };
    }
    : DataField<TData> & {
        success: true;
        meta: {
            /**
             * ISO timestamp for when the response was generated.
             */
            timestamp: string;
        };
    };

/**
 * Error response envelope for contract responses.
 *
 * @example
 * const error: ErrorResponse = { success: false, error: "Not Found" };
 */
export type ErrorResponse = {
    success: false;
    /**
     * Optional error payload. Framework handlers may return a string or structured object.
     */
    error?: unknown;
};

/**
 * Full response union for a contract (success or error).
 *
 * @example
 * type Response = ContractResponse<{ id: string }, false>;
 */
export type ContractResponse<TData, TPaginated extends boolean> =
    | SuccessResponse<TData, TPaginated>
    | ErrorResponse;

/**
 * Success payload used before response validation/sanitization.
 *
 * @example
 * const payload: SuccessResponsePayload<{ id: string }> = {
 *   success: true,
 *   data: { id: "b-1" },
 *   meta: { timestamp: new Date().toISOString() },
 * };
 */
export type SuccessResponsePayload<TData> = {
    success: true;
    /**
     * Handler data payload before contract response validation.
     */
    data: TData;
    meta: {
        /**
         * ISO timestamp for when the response payload was assembled.
         */
        timestamp: string;
        /**
         * Pagination metadata included only when handlers return pagination.
         */
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
        /**
         * Cookie action to perform.
         */
        action: 'set';
        /**
         * Cookie name.
         */
        name: string;
        /**
         * Cookie value (serialized by Express).
         */
        value: string | number | boolean | Record<string, unknown>;
        /**
         * Express cookie options to apply.
         */
        options?: CookieOptions;
    }
    | {
        /**
         * Cookie action to perform.
         */
        action: 'clear';
        /**
         * Cookie name.
         */
        name: string;
        /**
         * Express cookie options to apply when clearing.
         */
        options?: CookieOptions;
    };

/**
 * Successful handler result shape required by createHandler.
 *
 * For response-paginated contracts, `pagination` is required. For contracts without
 * response pagination, `pagination` must be omitted.
 *
 * Optional `cookies` allow declarative response cookies to be set or cleared
 * when the handler succeeds.
 *
 * @example
 * const result: HandlerSuccessResult<typeof BookSchema, true> = {
 *   data: [{ id: "b-1" }],
 *   pagination: { totalCount: 10, page: 1, limit: 10 },
 * };
 */
export type HandlerSuccessResult<TResponseSchema extends ZodTypeAny, TPaginated extends boolean> = {
    /**
     * Response data that matches the contract response schema.
     */
    data: Input<TResponseSchema>;
    /**
     * Optional HTTP status code (defaults to 200).
     */
    statusCode?: number;
    /**
     * Optional cookie operations applied after successful response validation.
     */
    cookies?: CookieOperation[];
} & (TPaginated extends true
    ? {
        /**
         * Pagination input required for paginated response contracts.
         */
        pagination: PaginationInput;
    }
    : {
        /**
         * Pagination is not allowed when the contract response is not paginated.
         */
        pagination?: undefined;
    });

/**
 * Type for a validated Express request with strong typing.
 *
 * Maps a validated request schema type to Express's `Request` type, automatically
 * extracting and typing the `params`, `body`, and `query` properties based on the
 * inferred schema type. If a property is not defined in the schema, it defaults to
 * a sensible fallback type.
 *
 * When createContract enables pagination.request, the validated `query` type includes
 * `page` and `limit` unless you explicitly define them in the request schema.
 *
 * @example
 * createHandler(contract, async (req) => {
 *   const { page, limit } = req.query;
 *   return { data: [], pagination: { totalCount: 0, page, limit } };
 * });
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
 *
 * @example
 * const value: MaybePromise<number> = Promise.resolve(42);
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Access modes supported by createHandler.
 *
 * - `public`: no authentication; handler receives only the validated request.
 * - `optional`: authentication may run; handler receives auth when available.
 * - `protected`: authentication required; handler always receives auth.
 *
 * @example
 * const access: AccessMode = "protected";
 */
export type AccessMode = 'public' | 'protected' | 'optional';

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
 * Behavior:
 * - Return a context object to authenticate the request.
 * - Return null/undefined to indicate no auth context.
 * - For `protected` access, null/undefined triggers an unauthenticated error.
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
export type Authenticator<TAuthContext, TRequest extends Request<any, any, any, any> = Request> = (
    req: TRequest,
) => MaybePromise<TAuthContext | null | undefined>;

/**
 * Authorization policy callback.
 *
 * Return true to allow the request; false to deny.
 * In the `afterValidation` bucket, `req` is the validated request type with
 * typed body/query/params; in the `beforeValidation` bucket it is a plain Request.
 *
 * Note: For `optional` access, policies only run when authentication succeeds.
 *
 * @example
 * const canEdit: Authorizer<AuthContext> = async ({ auth }) => auth.role === "staff";
 */
export type Authorizer<
    TAuthContext,
    TRequest extends Request<any, any, any, any> = Request,
> = (params: { req: TRequest; auth: TAuthContext }) => MaybePromise<boolean>;

/**
 * Error mapper for authentication/authorization failures.
 *
 * Return an HttpError to override the default error response for auth failures.
 *
 * @example
 * const unauthenticated: AuthErrorMapper = () =>
 *   new createHttpError.Unauthorized("Missing token");
 */
export type AuthErrorMapper<TRequest extends Request<any, any, any, any> = Request> = (
    req: TRequest,
) => createHttpError.HttpError;

/**
 * Authorization configuration split into two timing buckets.
 *
 * Policies in `beforeValidation` run against the raw Express `Request` before
 * the contract request is validated (fail-fast). Policies in `afterValidation`
 * run against the validated request (typed body/query/params).
 *
 * Both buckets are evaluated with logical-AND semantics and short-circuit on
 * the first failing policy. A `beforeValidation` denial skips request
 * validation entirely. The buckets are independent: a handler may use either,
 * both, or neither.
 *
 * Bucket membership is enforced structurally by TypeScript's function-parameter
 * contravariance: an authorizer written against a validated request type cannot
 * be placed in `beforeValidation` (compile error), while an authorizer written
 * against a plain `Request` fits either bucket.
 *
 * @typeParam TAuthContext
 * Auth context shape produced by {@link Authenticator} and consumed by policies.
 *
 * @typeParam TAfterRequest
 * Request type passed to `afterValidation` policies. Defaults to `Request` and
 * is bound to the contract's validated request type at handler call sites.
 *
 * @example
 * const authorize: AuthorizationConfig<AuthContext> = {
 *   beforeValidation: [({ auth }) => auth.role === "staff"],
 *   afterValidation: [({ req, auth }) => auth.userId === req.params.id],
 * };
 */
export type AuthorizationConfig<
    TAuthContext,
    TAfterRequest extends Request<any, any, any, any> = Request,
> = {
    /**
     * Authorization policies evaluated BEFORE request validation.
     *
     * Each policy receives a plain Express `Request` (unvalidated body/query/params).
     * Use this bucket for fail-fast checks that do not require typed request data
     * (e.g. role or scope checks). All policies must return true; first false
     * short-circuits with a 403 and skips validation.
     */
    beforeValidation?: Array<Authorizer<TAuthContext, Request>>;
    /**
     * Authorization policies evaluated AFTER request validation.
     *
     * Each policy receives the validated request with typed body/query/params.
     * Use this bucket for ownership or resource checks that need the parsed
     * request. All policies must return true; first false short-circuits with a 403.
     */
    afterValidation?: Array<Authorizer<TAuthContext, TAfterRequest>>;
};

/**
 * Security configuration for createHandler.
 *
 * Provides authentication, authorization buckets, and auth-schema validation.
 *
 * Authorization timing is expressed structurally via
 * {@link AuthorizationConfig}: a handler may run policies before validation,
 * after validation, or both. There is no global before/after toggle.
 *
 * @example
 * const security: SecurityOptions<AuthContext, AfterAuthorizationRequest<typeof Contract>> = {
 *   authenticate: async (_req: Request) => ({ userId: "u-1" }),
 *   authorize: {
 *     beforeValidation: [({ auth }) => auth.role === "staff"],
 *     afterValidation: [({ req, auth }) => auth.userId === req.params.userId],
 *   },
 * };
 */
export type SecurityOptions<
    TAuthContext,
    TAfterRequest extends Request<any, any, any, any> = Request,
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
    authenticate?: Authenticator<TAuthContext>;
    /**
     * Authorization buckets evaluated around request validation.
     *
     * Omit when the handler requires authentication but no authorization policies.
     */
    authorize?: AuthorizationConfig<TAuthContext, TAfterRequest>;
    /**
     * Optional schema to validate the authentication result.
     *
     * If provided, auth context is parsed with this schema and failures are treated as
     * unauthenticated errors.
     */
    authSchema?: ZodType<TAuthContext>;
};

/**
 * Error mapper overrides for auth-related failures.
 *
 * @example
 * const errors: HandlerErrorMappers = {
 *   unauthenticated: () => new createHttpError.Unauthorized("Missing token"),
 *   unauthorized: () => new createHttpError.Forbidden("Not allowed"),
 * };
 */
export type HandlerErrorMappers<TRequest extends Request<any, any, any, any> = Request> = {
    /**
     * Override for authentication failures (missing/invalid auth context).
     */
    unauthenticated?: AuthErrorMapper<TRequest>;
    /**
     * Override for authorization failures (policy denies or missing auth for protected).
     */
    unauthorized?: AuthErrorMapper<TRequest>;
};

/**
 * Top-level handler options accepted by createHandler.
 *
 * @example
 * const options: HandlerOptions<"protected", AuthContext, AfterAuthorizationRequest<typeof Contract>> = {
 *   access: "protected",
 *   security: {
 *     authenticate: async () => ({ userId: "u-1" }),
 *     authorize: {
 *       beforeValidation: [({ auth }) => auth.role === "staff"],
 *       afterValidation: [({ req, auth }) => auth.userId === req.params.userId],
 *     },
 *   },
 * };
 */
export type HandlerOptions<
    TAccess extends AccessMode,
    TAuthContext,
    TAfterRequest extends Request<any, any, any, any> = Request,
> = {
    /**
     * Access mode for the handler. Defaults to `public`.
     */
    access?: TAccess;
    /**
     * Security settings for authentication and authorization.
     * Not allowed when access is `public`.
     */
    security?: SecurityOptions<TAuthContext, TAfterRequest>;
    /**
     * Optional overrides for auth error mapping.
     */
    errors?: HandlerErrorMappers<TAfterRequest>;
};
