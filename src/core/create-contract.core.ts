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

import z from "zod";
import {
    createRequestSchema,
    type RequestSchemaInput,
    type RequestSchemaOutput,
} from "../shared/schemas/create-request-schema.ts";
import type { ContractResponse } from "./types.core.ts";

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
type StrictRequestInput<TRequest extends RequestSchemaInput> =
    TRequest & Record<Exclude<keyof TRequest, keyof RequestSchemaInput>, never>;

/**
 * The built Zod request schema type after processing by createRequestSchema.
 */
type BuiltRequestSchema<TRequest extends RequestSchemaInput> =
    z.ZodObject<RequestSchemaOutput<StrictRequestInput<TRequest>>>;

/**
 * Complete response schema type exported from createContract.
 * 
 * This is a Zod schema that validates both success and error responses together
 * as a union type. When you call z.infer on this, you get the full response shape.
 */
export type ContractResponseSchema<
    TResponseData extends z.ZodTypeAny,
    TPaginated extends boolean,
> = z.ZodType<
    ContractResponse<z.output<TResponseData>, TPaginated>,
    z.ZodTypeDef,
    ContractResponse<z.input<TResponseData>, TPaginated>
>;

/**
 * Validated contract that specifies request and response formats.
 * 
 * A contract is the central agreement between a handler and its callers:
 * - `request`: Zod schema for incoming requests (body, query, params)
 * - `response`: Zod schema for outgoing responses (success or error)
 * - `paginated`: Flag indicating if response includes pagination metadata
 * 
 * The `paginated` property is included as `true` only when the contract is
 * created with `paginated: true`. This enables type-safe pagination inference.
 * 
 * @example
 * const getUsersContract: Contract<..., ..., true> = createContract({
 *   request: { query: { page: z.number() } },
 *   response: z.array(z.object({ id: z.string() })),
 *   paginated: true,
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
     *     pagination?: {      // Only if contract.paginated === true
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
} & (TPaginated extends true ? { paginated: true } : { paginated?: false });

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
     * - **body**: Validate the JSON request body (for POST/PUT/PATCH)
     * - **query**: Validate URL query string parameters
     * - **params**: Validate dynamic route path parameters (from Express router)
     * 
     * ---
     * ### Examples
     * 
     * **Example** - Validate body only
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
     * **Example** - Validate query parameters
     * ```typescript
     * request: {
     *   query: {
     *     page: z.number().int().positive().default(1),
     *     limit: z.number().int().positive().default(10),
     *     search: z.string().optional()
     *   }
     * }
     * 
     * ```
     * 
     * **Example** - Validate path parameters
     * ```typescript
     * request: {
     *   params: {
     *     id: z.string().uuid()
     *   }
     * }
     * ```
     * 
     * **Example** - Validate all three together
     * ```typescript
     * request: {
     *   params: { userId: z.string().uuid() },
     *   body: { name: z.string() },
     *   query: { includeDetails: z.boolean().optional() }
     * }
     * ```
     * 
     * Omit any part you don't need validation for.
     * The request will only be validated against the fields you include.
     */
    request: StrictRequestInput<TRequest>;

    /**
     * Zod schema for the response data your handler returns.
     * 
     * This is the data object that will be wrapped in the success response envelope
     * along with timestamp and optional pagination metadata (if paginated: true).
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
     * Note: If your handler returns pagination, use `paginated: true` in `createContract`
     * to include pagination metadata (totalCount, limit, offset, hasNextPage).
     */
    response: TResponseData;
};

/**
 * Parameters for creating a paginated contract.
 */
type CreatePaginatedContractParams<
    TRequest extends RequestSchemaInput,
    TResponseData extends z.ZodTypeAny,
> = CreateContractBaseParams<TRequest, TResponseData> & {
    /**
     * When `true`, includes pagination metadata in the response.
     * The response will include `meta.pagination` with totalCount, limit, offset, and hasNextPage.
     */
    paginated: true;
};

/**
 * Parameters for creating a non-paginated contract.
 */
type CreateNonPaginatedContractParams<
    TRequest extends RequestSchemaInput,
    TResponseData extends z.ZodTypeAny,
> = CreateContractBaseParams<TRequest, TResponseData> & {
    /**
     * 
     * When `true`, includes pagination metadata in the response.
     * The response will include `meta.pagination` with totalCount, limit, offset, and hasNextPage.
     * 
     * When `false` or omitted, excludes pagination metadata from the response.
     * The response will only include the `meta.timestamp` field.
     */
    paginated?: false | undefined;
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
 * ## Usage - Paginated Response (includes pagination metadata)
 * 
 * ```typescript
 * const getUsersContract = createContract({
 *   request: { query: { page: z.number(), limit: z.number() } },
 *   response: z.array(UserSchema),
 *   paginated: true,  // ← includes pagination in response
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
 *   // paginated omitted or false
 * });
 * // Response shape: { success: true, data: User, meta: { timestamp } }
 * ```
 * 
 * @overload Paginated - Returns contract with pagination metadata
 * @param params Contract definition with paginated: true
 * @returns Paginated contract with pagination metadata in response schema
 * 
 * @overload Non-Paginated - Returns contract without pagination
 * @param params Contract definition with paginated: false or omitted
 * @returns Non-paginated contract without pagination metadata
 * 
 * @throws Type error if request schema contains invalid fields (only body, query, params allowed)
 */
export function createContract<
    TRequest extends RequestSchemaInput,
    TResponseData extends z.ZodTypeAny,
>(
    params: CreatePaginatedContractParams<TRequest, TResponseData>,
): Contract<BuiltRequestSchema<TRequest>, TResponseData, true>;

export function createContract<
    TRequest extends RequestSchemaInput,
    TResponseData extends z.ZodTypeAny,
>(
    params: CreateNonPaginatedContractParams<TRequest, TResponseData>,
): Contract<BuiltRequestSchema<TRequest>, TResponseData, false>;

export function createContract({
    request,
    response,
    paginated,
}: {
    request: RequestSchemaInput;
    response: z.ZodTypeAny;
    paginated?: boolean;
}): unknown {
    // Build the validated request schema (body, query, params)
    const requestSchema = createRequestSchema(request);

    // Create error response schema (shared for both paginated and non-paginated)
    const errorResponseSchema = createErrorResponseSchema();

    if (paginated === true) {
        // For paginated responses: include pagination metadata in success schema
        const successResponseSchema = createPaginatedSuccessResponseSchema(response);
        const responseSchema = z.union([successResponseSchema, errorResponseSchema]);

        return {
            request: requestSchema,
            response: responseSchema,
            paginated: true,
        };
    }

    // For non-paginated responses: omit pagination metadata from success schema
    const successResponseSchema = createNonPaginatedSuccessResponseSchema(response);
    const responseSchema = z.union([successResponseSchema, errorResponseSchema]);

    return {
        request: requestSchema,
        response: responseSchema,
    };
}
