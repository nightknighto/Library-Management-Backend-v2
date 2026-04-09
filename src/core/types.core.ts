/**
 * @file types.core.ts
 *
 * Shared core type definitions used across contract creation, response building,
 * and handler execution.
 *
 * SECTIONS:
 * 1. RESPONSE FORMAT TYPES - API envelope and pagination-related types
 * 2. HANDLER DX TYPES - Generic handler return type helpers
 */

import type { input as Input, ZodTypeAny } from "zod";

// ============================================================================
// SECTION 1: RESPONSE FORMAT TYPES
// ============================================================================
// Shared response and pagination types used by contract and response modules.

/**
 * Pagination input provided by handlers.
 *
 * Used as input when handlers return paginated results. Missing fields can be
 * computed by response builder helpers.
 */
export type PaginationInput = {
    totalCount: number;
    page: number;
    limit: number;
    offset?: number;
    hasNextPage?: boolean;
};

/**
 * Normalized pagination metadata included in successful paginated responses.
 */
export type PaginationMeta = {
    totalCount: number;
    limit: number;
    offset: number;
    hasNextPage: boolean;
};

/**
 * Conditionally makes the `data` field optional when the response data type can be undefined.
 */
export type DataField<TData> = undefined extends TData
    ? { data?: TData }
    : { data: TData };

/**
 * Successful API response envelope shape.
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
 * Error API response envelope shape.
 */
export type ErrorResponse = {
    success: false;
    error?: unknown;
};

/**
 * Full API response shape (success or error).
 */
export type ContractResponse<TData, TPaginated extends boolean> =
    | SuccessResponse<TData, TPaginated>
    | ErrorResponse;

/**
 * Success response payload shape before sanitization.
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
// Shared type utilities that improve handler return type inference.

/**
 * Generic success result returned by business handlers.
 *
 * For paginated endpoints, pagination is required. For non-paginated endpoints,
 * pagination must be omitted.
 */
export type HandlerSuccessResult<
    TResponseSchema extends ZodTypeAny,
    TPaginated extends boolean,
> = {
    data: Input<TResponseSchema>;
    statusCode?: number;
} & (TPaginated extends true
    ? { pagination: PaginationInput }
    : { pagination?: undefined });
