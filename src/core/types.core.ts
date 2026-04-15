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

import type { Request } from "express";
import type createHttpError from "http-errors";
import type { input as Input, ZodType, ZodTypeAny } from "zod";

// ============================================================================
// SECTION 1: RESPONSE FORMAT TYPES
// ============================================================================

export type PaginationInput = {
    totalCount: number;
    page: number;
    limit: number;
    offset?: number;
    hasNextPage?: boolean;
};

export type PaginationMeta = {
    totalCount: number;
    limit: number;
    offset: number;
    hasNextPage: boolean;
};

export type DataField<TData> = undefined extends TData
    ? { data?: TData }
    : { data: TData };

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

export type ErrorResponse = {
    success: false;
    error?: unknown;
};

export type ContractResponse<TData, TPaginated extends boolean> =
    | SuccessResponse<TData, TPaginated>
    | ErrorResponse;

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

export type HandlerSuccessResult<
    TResponseSchema extends ZodTypeAny,
    TPaginated extends boolean,
> = {
    data: Input<TResponseSchema>;
    statusCode?: number;
} & (TPaginated extends true
    ? { pagination: PaginationInput }
    : { pagination?: undefined });

// ============================================================================
// SECTION 3: HANDLER SECURITY TYPES
// ============================================================================

export type MaybePromise<T> = T | Promise<T>;

export type AccessMode = "public" | "protected" | "optional";

export type Authenticator<
    TAuthContext,
    TRequest extends Request<any, any, any, any> = Request,
> = (
    req: TRequest,
) => MaybePromise<TAuthContext | null | undefined>;

export type Authorizer<
    TAuthContext,
    TRequest extends Request<any, any, any, any> = Request,
> = (
    params: {
        req: TRequest;
        auth: TAuthContext;
    },
) => MaybePromise<boolean>;

export type AuthErrorMapper<TRequest extends Request<any, any, any, any> = Request> = (
    req: TRequest,
) => createHttpError.HttpError;

export type SecurityOptions<
    TAuthContext,
    TRequest extends Request<any, any, any, any> = Request,
> = {
    authenticate?: Authenticator<TAuthContext, TRequest>;
    authorizationBeforeValidation?: boolean;
    authorize?:
    | Authorizer<TAuthContext, TRequest>
    | Array<Authorizer<TAuthContext, TRequest>>;
    authSchema?: ZodType<TAuthContext>;
};

export type HandlerErrorMappers<TRequest extends Request<any, any, any, any> = Request> = {
    unauthorized?: AuthErrorMapper<TRequest>;
    forbidden?: AuthErrorMapper<TRequest>;
};

export type HandlerOptions<
    TAccess extends AccessMode,
    TAuthContext,
    TRequest extends Request<any, any, any, any> = Request,
> = {
    access?: TAccess;
    security?: SecurityOptions<TAuthContext, TRequest>;
    errors?: HandlerErrorMappers<TRequest>;
};
