import type { Response } from "express";

/**
 * Standard controller response type for single resource operations.
 * @template T - The data type of the successful response
 */
export type ControllerResponse<T> = Response<{
    success: true;
    data: T;
    meta: {
        timestamp: string;
    };
} | {
    success: false;
    error: any
}>;

/**
 * Paginated controller response type for list operations.
 * @template T - The array data type of the paginated response
 */
export type PaginatedControllerResponse<T> = Response<{
    success: true;
    data: T;
    meta: {
        timestamp: string;
        pagination: {
            totalCount: number;
            limit: number;
            offset: number;
            hasNextPage: boolean;
        }
    }
} | {
    success: false;
    error: any
}>;