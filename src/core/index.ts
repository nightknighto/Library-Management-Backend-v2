/**
 * @file index.ts
 *
 * Public exports for the core framework surface.
 * Use this entry point for application and feature imports.
 */

export type { Contract, ContractResponseSchema } from './create-contract.core.ts';
export { createContract } from './create-contract.core.ts';
export type { AfterAuthorizationRequest, HandlerRequest } from './create-handler.core.ts';
export { createHandler, createHandlerFactory } from './create-handler.core.ts';
export type {
    RequestSchema,
    RequestSchemaInput,
    RequestSchemaOutput,
} from './create-request-schema.core.ts';
export { createRequestSchema } from './create-request-schema.core.ts';
export { buildPaginationMeta, buildSuccessResponsePayload } from './response-builder.core.ts';
export { sanitizeResponse } from './sanitize-response.core.ts';

export { allOf, anyOf, createAuthenticator, not } from './security.core.ts';
export type {
    AccessMode,
    Authenticator,
    AuthenticatorOptions,
    AuthorizationConfig,
    Authorizer,
    ContractResponse,
    CookieOperation,
    ErrorResponse,
    HandlerOptions,
    HandlerSuccessResult,
    MaybePromise,
    PaginationInput,
    PaginationMeta,
    SecurityOptions,
    SuccessResponse,
    SuccessResponsePayload,
    ValidatedRequest,
} from './types.core.ts';
export { validateContractRequest } from './validate-contract-request.core.ts';
