/**
 * @file create-contract.core.ts
 *
 * Defines the contract system for API requests and responses. A contract is a bidirectional
 * specification that defines both what a handler expects (request schema) and what it returns
 * (response schema), including pagination metadata when applicable.
 *
 * A contract ensures type-safe communication between clients and servers by validating both
 * incoming requests and outgoing responses against a shared schema.
 *
 * SECTIONS:
 * 1. DATA STRUCTURES - Types and builders that define response/pagination formats (developer-facing)
 * 2. TYPE INFERENCE ENGINE - Advanced TypeScript types for automatic type inference (internal)
 * 3. CONTRACT BUILDERS - Main functions to create contracts (developer-facing API)
 */

import z from 'zod';
import {
    createRequestSchema,
    type RequestSchemaInput,
    type RequestSchemaOutput,
} from './create-request-schema.core.ts';
import type { ContractResponse } from './types.core.ts';

// ============================================================================
// SECTION 1: DATA STRUCTURES - Response Formats & Pagination
// ============================================================================
// Shared response format types now live in types.core.ts.
// This section focuses on runtime schema builders for those shared type contracts.

/**
 * Helper function to create error response Zod schema.
 *
 * Builds a schema that validates error responses conform to ErrorResponse structure.
 * Used internally when building complete response schemas.
 */
function createErrorResponseSchema() {
    return z.object({
        success: z.literal(false),
        error: z.unknown(),
    });
}

/**
 * Helper function to create success response schema with pagination.
 *
 * Builds a schema for paginated successful responses. Combines data validation with
 * pagination metadata validation.
 */
function createPaginatedSuccessResponseSchema<TResponseData extends z.ZodTypeAny>(
    responseDataSchema: TResponseData,
) {
    return z.object({
        success: z.literal(true),
        data: responseDataSchema,
        meta: z.object({
            timestamp: z.string(),
            pagination: z.object({
                totalCount: z.number(),
                limit: z.number(),
                offset: z.number(),
                hasNextPage: z.boolean(),
            }),
        }),
    });
}

/**
 * Helper function to create success response schema without pagination.
 *
 * Builds a schema for non-paginated successful responses. Includes only the
 * data and timestamp, omitting pagination metadata.
 */
function createNonPaginatedSuccessResponseSchema<TResponseData extends z.ZodTypeAny>(
    responseDataSchema: TResponseData,
) {
    return z.object({
        success: z.literal(true),
        data: responseDataSchema,
        meta: z.object({
            timestamp: z.string(),
        }),
    });
}

/**
 * Helper function to create the full response schema (success + error).
 *
 * Keeps response schema composition in one place so the contract builder
 * is easy to scan and extend.
 */
function createContractResponseSchema<TResponseData extends z.ZodTypeAny>(
    responseDataSchema: TResponseData,
    paginated: boolean,
) {
    const successResponseSchema = paginated
        ? createPaginatedSuccessResponseSchema(responseDataSchema)
        : createNonPaginatedSuccessResponseSchema(responseDataSchema);

    const errorResponseSchema = createErrorResponseSchema();
    return z.union([successResponseSchema, errorResponseSchema]);
}

// ============================================================================
// SECTION 2: TYPE INFERENCE ENGINE - Advanced TypeScript Types
// ============================================================================
// These are "magical" TypeScript constructs used to provide automatic type inference.
// You typically won't need to modify these unless adding new inference patterns.
// They enable the system to infer types without explicit annotation.

/**
 * Validates request schema input contains only valid request fields.
 *
 * Ensures developers don't accidentally add undefined fields to request schemas
 * that aren't part of the standard request structure (body, query, params).
 */
type StrictRequestInput<TRequest extends RequestSchemaInput> = TRequest &
    Record<Exclude<keyof TRequest, keyof RequestSchemaInput>, never>;

/**
 * The built Zod request schema type after processing by createRequestSchema.
 */
type BuiltRequestSchema<TRequest extends RequestSchemaInput> = z.ZodObject<
    RequestSchemaOutput<StrictRequestInput<TRequest>>
>;

/**
 * Defaults applied when pagination.request injects page/limit.
 */
type PaginationRequestDefaults = {
    /**
     * Default page number when `page` is missing (1-based).
     */
    page?: number;
    /**
     * Default page size when `limit` is missing.
     */
    limit?: number;
};

/**
 * Configuration for request pagination injection.
 *
 * The injected `page` and `limit` fields are coerced to numbers and validated:
 * - `page` must be >= 1
 * - `limit` must be >= 1 and <= maxLimit
 */
type PaginationRequestConfig = {
    /**
     * Defaults applied to injected page/limit fields.
     *
     * Defaults are used only when the query param is missing.
     */
    defaults?: PaginationRequestDefaults;
    /**
     * Maximum allowed limit. Values above this will fail validation.
     * Defaults to 100 when omitted.
     */
    maxLimit?: number;
};

/**
 * Enables request pagination.
 *
 * Use `true` for default behavior (page=1, limit=10, maxLimit=100) or provide a
 * config object to override defaults.
 */
type PaginationRequestInput = true | PaginationRequestConfig;

/**
 * Request pagination option, including explicit false to disable injection.
 */
type PaginationRequestOption = PaginationRequestInput | false;

type PaginationConfigInput =
    | {
        /**
         * Enable request pagination by injecting `page` and `limit` into request.query
         * when they are not already defined in your request schema.
         *
         * If you define `page` or `limit` yourself, those schemas take precedence.
         */
        request: PaginationRequestInput;
        /**
         * Enable response pagination metadata in the success response envelope.
         */
        response?: boolean;
    }
    | {
        /**
         * Disable request pagination (default). No page/limit injection occurs.
         */
        request?: false | undefined;
        /**
         * Enable response pagination metadata in the success response envelope.
         */
        response?: boolean;
    };

type PaginationRequestQueryInput = {
    page: z.ZodType<number>;
    limit: z.ZodType<number>;
};

type MergePaginationQuery<TQuery extends Record<string, z.ZodType> | undefined> =
    TQuery extends Record<string, z.ZodType>
    ? TQuery &
    ('page' extends keyof TQuery ? {} : { page: PaginationRequestQueryInput['page'] }) &
    ('limit' extends keyof TQuery
        ? {}
        : { limit: PaginationRequestQueryInput['limit'] })
    : PaginationRequestQueryInput;

type ApplyPaginationRequest<TRequest extends RequestSchemaInput> = Omit<TRequest, 'query'> & {
    query: MergePaginationQuery<TRequest['query']>;
};

type PaginationRequestEnabled<TPagination extends PaginationConfigInput | undefined> =
    TPagination extends { request: PaginationRequestInput } ? true : false;

type WithPaginationRequest<
    TRequest extends RequestSchemaInput,
    TPagination extends PaginationConfigInput | undefined,
> = PaginationRequestEnabled<TPagination> extends true ? ApplyPaginationRequest<TRequest> : TRequest;

type PaginationContractConfig<TPaginated extends boolean> = TPaginated extends true
    ? {
        response: true;
        request?: PaginationRequestOption;
    }
    : {
        response?: false | undefined;
        request?: PaginationRequestOption;
    };

/**
 * Complete response schema type exported from createContract.
 *
 * This is a Zod schema that validates both success and error responses together
 * as a union type. When you call z.infer on this, you get the full response shape.
 *
 * @example
 * type ResponseSchema = ContractResponseSchema<typeof BookSchema, false>;
 */
export type ContractResponseSchema<
    TResponseData extends z.ZodTypeAny,
    TPaginated extends boolean,
> = z.ZodType<
    ContractResponse<z.output<TResponseData>, TPaginated>,
    ContractResponse<z.input<TResponseData>, TPaginated>
>;

/**
 * Validated contract that specifies request and response formats.
 *
 * A contract is the central agreement between a handler and its callers:
 * - `request`: Zod schema for incoming requests (body, query, params)
 * - `response`: Zod schema for outgoing responses (success or error)
 * - `pagination`: Config that enables request/response pagination behavior
 *
 * The `pagination` property is included when pagination is configured. When
 * `pagination.response` is true, response pagination metadata is required.
 *
 * @example
 * const getUsersContract: Contract<..., ..., true> = createContract({
 *   request: { query: { page: z.number() } },
 *   response: z.array(z.object({ id: z.string() })),
 *   pagination: { response: true },
 * });
 */
export type Contract<
    TRequest extends z.ZodTypeAny = z.ZodTypeAny,
    TResponseData extends z.ZodTypeAny = z.ZodTypeAny,
    TPaginated extends boolean = boolean,
> = {
    /**
     * Zod schema that validates incoming HTTP requests.
     *
     * This schema is automatically built from the request definition you provide
     * to `createContract()`. It validates three optional request parts:
     *
     * - **body**: Request body validation (POST/PUT payload)
     * - **query**: URL query parameters validation
     * - **params**: URL path parameters validation
     *
     * Only fields present in the schema are validated. Omitted fields are not required.
        *
        * When `pagination.request` is enabled, the query schema includes `page` and
        * `limit` unless you explicitly define them yourself.
     */
    request: TRequest;

    /**
     * Zod schema that validates outgoing HTTP responses.
     *
     * This is a union schema that validates both success (200/201) and error responses.
     * The schema automatically wraps your response data in a standardized envelope:
      *
      * **Success Response** (when handler returns successfully):
      * ```typescript
      * {
      *   success: true,
      *   data: <your response data>,
      *   meta: {
      *     timestamp: string,  // ISO datetime
      *     pagination?: {      // Only if contract.pagination.response === true
      *       totalCount: number,
      *       limit: number,
      *       offset: number,
      *       hasNextPage: boolean
      *     }
      *   }
      * }
      * ```
     *
     * **Error Response** (when validation fails or exception is thrown):
     * ```typescript
     * {
     *   success: false,
     *   error: string | { message: string, issues: ZodError[] }
     * }
     * ```
     */
    response: ContractResponseSchema<TResponseData, TPaginated>;

    /**
     * Pagination configuration for this contract.
     *
      * When `pagination.request` is true (or configured), page/limit are injected into
      * the request query schema unless the request already defines them.
     *
     * When `pagination.response` is true, response pagination metadata is required.
     */
    pagination?: PaginationContractConfig<TPaginated>;
} & (TPaginated extends true ? { pagination: PaginationContractConfig<true> } : {});

/**
 * Base parameters for creating a contract.
 */
type CreateContractBaseParams<
    TRequest extends RequestSchemaInput,
    TResponseData extends z.ZodTypeAny,
> = {
    /**
     * Zod schemas that define what the request should contain.
     *
     * Pass an object with any combination of `body`, `query`, and `params` fields.
     * Each field should contain Zod schema definitions for that part of the request.
     *
     * - **body**: Validate the JSON request body (for POST/PUT/PATCH).
     *   Accepts a plain object of Zod schemas (strict mode by default) or a full
     *   `z.ZodType` whose output is a plain object (e.g. `z.object()`,
     *   `z.discriminatedUnion()`, `.refine()`, `.transform()`). Primitives like
     *   `z.string()` are rejected at compile time.
     * - **query**: Validate URL query string parameters.
     *   Only accepts a plain object of Zod schemas (pagination merging needs
     *   the raw shape).
     * - **params**: Validate dynamic route path parameters (from Express router).
     *   Accepts a plain object of Zod schemas or a full `z.ZodType` whose output
     *   is a plain object.
     *
     * ---
     * ### Examples
     *
     * **Example** - Validate body only (plain object)
     * ```typescript
     * request: {
     *   body: {
     *     name: z.string().min(1),
     *     email: z.string().email(),
     *     age: z.number().int().positive().optional()
     *   }
     * }
     * ```
     *
     * **Example** - Validate body with `z.object()`
     * ```typescript
     * request: {
     *   body: z.object({
     *     name: z.string().min(1),
     *     email: z.string().email(),
     *   })
     * }
     * ```
     *
     * **Example** - Validate body with discriminated union
     * ```typescript
     * request: {
     *   body: z.discriminatedUnion('type', [
     *     z.object({ type: z.literal('book'), title: z.string() }),
     *     z.object({ type: z.literal('magazine'), issue: z.number() }),
     *   ])
     * }
     * ```
     *
     * **Example** - Validate query parameters
     * ```typescript
     * request: {
     *   query: {
     *     page: z.number().int().positive().default(1),
     *     limit: z.number().int().positive().default(10),
     *     search: z.string().optional()
     *   }
     * }
     * ```
     *
     * **Example** - Validate path parameters with `z.object()`
     * ```typescript
     * request: {
     *   params: z.object({ id: z.string().uuid() })
     * }
     * ```
     *
     * **Example** - Mixed: `z.object` body/params with plain query
     * ```typescript
     * request: {
     *   body: z.object({ name: z.string() }),
     *   params: z.object({ userId: z.string().uuid() }),
     *   query: { includeDetails: z.boolean().optional() }
     * }
     * ```
     *
     * Omit any part you don't need validation for.
     * The request will only be validated against the fields you include.
     *
     * When `pagination.request` is enabled, `page` and `limit` are injected into the
     * query schema if you did not define them yourself.
     */
    request: StrictRequestInput<TRequest>;

    /**
     * Zod schema for the response data your handler returns.
     *
        * This is the data object that will be wrapped in the success response envelope
        * along with timestamp and optional pagination metadata (if pagination.response is true).
     *
     * This should be the schema for just your data, not the full response wrapper—
     * the wrapper is automatically added by createHandler.
     *
     * ---
     * ### Examples
     *
     * **Example** - Single object response
     * ```typescript
     * response: z.object({
     *   id: z.string().uuid(),
     *   name: z.string(),
     *   email: z.string().email()
     * })
     * // Final response: { success: true, data: { id, name, email }, meta: {...} }
     * ```
     *
     * **Example** - Array response
     * ```typescript
     * response: z.array(UserSchema)
     * // Final response: { success: true, data: [...], meta: { timestamp, pagination: {...} } }
     * ```
     *
     * **Example** - Token response
     * ```typescript
     * response: z.object({
     *   token: z.string(),
     *   expiresIn: z.number()
     * })
     * // Final response: { success: true, data: { token, expiresIn }, meta: {...} }
     * ```
     *
      * Note: If your handler returns pagination, use `pagination.response: true` in
      * `createContract` to include pagination metadata (totalCount, limit, offset, hasNextPage).
     */
    response: TResponseData;
};

/**
 * Parameters for creating a response-paginated contract.
 */
type CreatePaginatedResponseContractParams<
    TRequest extends RequestSchemaInput,
    TResponseData extends z.ZodTypeAny,
    TPagination extends PaginationConfigInput & { response: true },
> = CreateContractBaseParams<TRequest, TResponseData> & {
    /**
     * Pagination configuration for this contract.
     * Use `response: true` to include pagination metadata in the response.
     * Optionally enable request pagination with `request`.
     *
     * When request pagination is enabled, `page` and `limit` are injected into
     * request.query unless you already defined them.
     */
    pagination: TPagination;
};

/**
 * Parameters for creating a non-paginated contract.
 */
type CreateNonPaginatedContractParams<
    TRequest extends RequestSchemaInput,
    TResponseData extends z.ZodTypeAny,
    TPagination extends (PaginationConfigInput & { response?: false | undefined }) | undefined,
> = CreateContractBaseParams<TRequest, TResponseData> & {
    /**
     * Optional pagination configuration.
     * When `response` is true, the response will include pagination metadata.
     * When `response` is false or omitted, the response includes only meta.timestamp.
     *
     * When `request` is enabled, page/limit are injected into the request query
     * unless the request already defines them.
     */
    pagination?: TPagination;
};

// ============================================================================
// SECTION 3: CONTRACT BUILDERS - Main API Functions
// ============================================================================
// These are the main functions you'll use as a developer. They take request/response
// schemas and return fully-formed contracts ready for use in handlers.

/**
 * Creates an API contract (bidirectional schema).
 *
 * A contract defines both the request shape a handler expects and the response shape
 * it produces. The contract is validated against both incoming requests and outgoing
 * responses to ensure type safety.
 *
 * Pagination request behavior:
 * - When `pagination.request` is enabled, `page` and `limit` are injected into request.query.
 * - Injected fields are `z.coerce.number()` with min/max validation and defaults.
 * - If you define `query.page` or `query.limit`, your schemas are used and no injection occurs.
 *
 * ## Usage - Paginated Response (includes pagination metadata)
 *
 * ```typescript
 * const getUsersContract = createContract({
 *   request: { query: { page: z.number(), limit: z.number() } },
 *   response: z.array(UserSchema),
 *   pagination: { response: true },  // ← includes pagination in response
 * });
 * // Response shape: { success: true, data: User[], meta: { timestamp, pagination: {...} } }
 * ```
 *
 * ## Usage - Non-Paginated Response (no pagination metadata)
 *
 * ```typescript
 * const createUserContract = createContract({
 *   request: { body: { name: z.string(), email: z.string().email() } },
 *   response: UserSchema,
 *   // pagination.response omitted or false
 * });
 * // Response shape: { success: true, data: User, meta: { timestamp } }
 * ```
 *
 * ## Usage - Request Pagination (page/limit injected)
 *
 * ```typescript
 * const searchUsersContract = createContract({
 *   request: { query: { q: z.string().optional() } },
 *   response: z.array(UserSchema),
 *   pagination: {
 *     request: { defaults: { page: 1, limit: 10 }, maxLimit: 100 },
 *     response: true,
 *   },
 * });
 * // Request query includes page/limit defaults and maxLimit enforcement.
 * ```
 *
 * @overload Response Pagination - Returns contract with pagination metadata
 * @param params Contract definition with pagination.response: true
 * @returns Contract with pagination metadata in response schema
 *
 * @overload No Response Pagination - Returns contract without pagination metadata
 * @param params Contract definition with pagination.response omitted or false
 * @returns Contract without pagination metadata in response schema
 *
 * @throws Type error if request schema contains invalid fields (only body, query, params allowed)
 */
export function createContract<
    TRequest extends RequestSchemaInput,
    TResponseData extends z.ZodTypeAny,
    TPagination extends PaginationConfigInput & { response: true },
>(
    params: CreatePaginatedResponseContractParams<TRequest, TResponseData, TPagination>,
): Contract<BuiltRequestSchema<WithPaginationRequest<TRequest, TPagination>>, TResponseData, true>;

export function createContract<
    TRequest extends RequestSchemaInput,
    TResponseData extends z.ZodTypeAny,
    TPagination extends
    | (PaginationConfigInput & { response?: false | undefined })
    | undefined,
>(
    params: CreateNonPaginatedContractParams<TRequest, TResponseData, TPagination>,
): Contract<BuiltRequestSchema<WithPaginationRequest<TRequest, TPagination>>, TResponseData, false>;

export function createContract({
    request,
    response,
    pagination,
}: {
    request: RequestSchemaInput;
    response: z.ZodTypeAny;
    pagination?: PaginationConfigInput;
}): unknown {
    const responsePaginated = pagination?.response === true;
    const requestShape = buildPaginationRequestShape(request, pagination?.request);
    const requestSchema = createRequestSchema(requestShape);
    const responseSchema = createContractResponseSchema(response, responsePaginated);

    if (pagination) {
        return {
            request: requestSchema,
            response: responseSchema,
            pagination,
        };
    }

    return {
        request: requestSchema,
        response: responseSchema,
    };
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const DEFAULT_MAX_LIMIT = 100;

function buildPaginationRequestShape(
    request: RequestSchemaInput,
    paginationRequest: PaginationRequestOption | undefined,
): RequestSchemaInput {
    if (!paginationRequest) {
        return request;
    }

    const config = paginationRequest === true ? {} : paginationRequest;
    const defaultPage = config.defaults?.page ?? DEFAULT_PAGE;
    const defaultLimit = config.defaults?.limit ?? DEFAULT_LIMIT;
    const maxLimit = config.maxLimit ?? DEFAULT_MAX_LIMIT;

    const pageSchema = z.coerce
        .number()
        .min(1, 'Page must be a positive number')
        .default(defaultPage);

    const limitSchema = z.coerce
        .number()
        .min(1, 'Limit must be a positive number')
        .max(maxLimit, `Limit must be between 1 and ${maxLimit}`)
        .default(defaultLimit);

    const existingQuery = request.query ?? {};
    const mergedQuery: Record<string, z.ZodType> = { ...existingQuery };

    if (!Object.prototype.hasOwnProperty.call(existingQuery, 'page')) {
        mergedQuery.page = pageSchema;
    }

    if (!Object.prototype.hasOwnProperty.call(existingQuery, 'limit')) {
        mergedQuery.limit = limitSchema;
    }

    return {
        ...request,
        query: mergedQuery,
    };
}
