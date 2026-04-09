/**
 * @file response-builder.core.ts
 * 
 * Handles HTTP response building and pagination computation. This module is responsible
 * for constructing response envelopes, managing pagination metadata, and ensuring
 * response consistency.
 * 
 * SECTIONS:
 * 1. DATA STRUCTURES - Shared pagination/response types (types.core.ts)
 * 2. RESPONSE BUILDERS - Functions to construct response envelopes
 */

import type {
    PaginationInput,
    PaginationMeta,
    SuccessResponsePayload,
} from "./types.core.ts";

// ============================================================================
// SECTION 1: DATA STRUCTURES - Pagination & Response Types
// ============================================================================
// Shared response/pagination types live in types.core.ts.

// ============================================================================
// SECTION 2: RESPONSE BUILDERS - Functions for Response Construction
// ============================================================================
// Helper functions for building and computing response data.

/**
 * Normalizes pagination input into standardized metadata.
 * 
 * Takes handler input and fills in missing fields (offset, hasNextPage)
 * using standard formulas to ensure consistency across the API.
 * 
 * ## Computation Rules
 * 
 * **Offset:**
 * ```
 * offset = provided_offset ?? (page - 1) * limit
 * ```
 * Converts 1-indexed page number to 0-indexed array offset.
 * 
 * **HasNextPage:**
 * ```
 * hasNextPage = provided_hasNextPage ?? page * limit < totalCount
 * ```
 * Determines if more items exist after current page by checking if
 * items on this page would exceed total count.
 * 
 * @param input - Pagination parameters from handler
 * @returns Normalized pagination metadata with all fields computed
 * 
 * @example
 * const meta = buildPaginationMeta({
 *   totalCount: 100,
 *   page: 1,
 *   limit: 10,
 *   // offset and hasNextPage computed below
 * });
 * // Returns: { totalCount: 100, limit: 10, offset: 0, hasNextPage: true }
 */
export function buildPaginationMeta(input: PaginationInput): PaginationMeta {
    // Compute offset if not provided: (page-1)*limit
    const offset = input.offset ?? (input.page - 1) * input.limit;

    // Compute hasNextPage if not provided: true if current page would have more items
    const hasNextPage = input.hasNextPage ?? input.page * input.limit < input.totalCount;

    return {
        totalCount: input.totalCount,
        limit: input.limit,
        offset,
        hasNextPage,
    };
}

/**
 * Builds a success response payload with optional pagination.
 * 
 * Constructs the complete response envelope that will be validated and sanitized.
 * Automatically includes pagination metadata if provided, omits it otherwise.
 * 
 * ## Usage
 * 
 * ```typescript
 * const payload = buildSuccessResponsePayload({
 *   data: books,
 *   timestamp: new Date().toISOString(),
 *   pagination: buildPaginationMeta({ totalCount: 100, page: 1, limit: 10 }),
 * });
 * // Payload sent to sanitizeResponse for validation/stripping
 * ```
 * 
 * @param options - Response data and optional pagination
 * @returns Success response payload ready for sanitization
 */
export function buildSuccessResponsePayload<TData>(options: {
    data: TData;
    timestamp: string;
    pagination?: PaginationMeta;
}): SuccessResponsePayload<TData> {
    return {
        success: true,
        data: options.data,
        meta: {
            timestamp: options.timestamp,
            pagination: options.pagination,
        },
    };
}
