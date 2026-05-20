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
 * When validateBeforeAuthorization is true, `req` can be the validated request type.
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
 * Security configuration for createHandler.
 *
 * Provides authentication, authorization, and auth schema validation options.
 *
 * @example
 * const security: SecurityOptions<AuthContext> = {
 *   authenticate: async (_req: Request) => ({ userId: "u-1" }),
 *   validateBeforeAuthorization: true,
 *   authorize: async ({ req, auth }) => auth.userId === req.params.userId,
 * };
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
     * typed body/query/params from the validated request.
     *
     * When false (default), authorization runs before validation and receives a plain
     * Express Request.
     */
    validateBeforeAuthorization?: boolean;
    /**
     * Authorization policy or policies evaluated for the request.
     *
     * For `optional` access, policies only run when authentication succeeds.
     * When multiple policies are provided, all must return true (logical AND).
     */
    authorize?: Authorizer<TAuthContext, TRequest> | Array<Authorizer<TAuthContext, TRequest>>;
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
 * const options: HandlerOptions<"protected", AuthContext> = {
 *   access: "protected",
 *   security: {
 *     authenticate: async () => ({ userId: "u-1" }),
 *     authorize: async ({ auth }) => auth.userId === "u-1",
 *   },
 * };
 */
export type HandlerOptions<
    TAccess extends AccessMode,
    TAuthContext,
    TRequest extends Request<any, any, any, any> = Request,
> = {
    /**
     * Access mode for the handler. Defaults to `public`.
     */
    access?: TAccess;
    /**
     * Security settings for authentication and authorization.
     * Not allowed when access is `public`.
     */
    security?: SecurityOptions<TAuthContext, TRequest>;
    /**
     * Optional overrides for auth error mapping.
     */
    errors?: HandlerErrorMappers<TRequest>;
};
