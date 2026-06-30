/**
 * @file create-handler.core.ts
 *
 * Contract-aware Express handler builder with integrated request validation,
 * authentication, authorization, and response validation.
 *
 * Pipeline:
 * 1. Resolve access/security options.
 * 2. Authenticate (optional/protected).
 * 3. Authorize before validation (optional).
 * 4. Validate and promote request (body/query/params).
 * 5. Authorize after validation (optional).
 * 6. Execute handler.
 * 7. Build success payload + pagination metadata.
 * 8. Validate/sanitize response envelope.
 * 9. Send response or error.
 */

import type { Request, RequestHandler, Response } from 'express';
import type { infer as Infer, ZodType, ZodTypeAny } from 'zod';
import type { Contract } from './create-contract.core.ts';
import {
    handleError,
    handleRequestValidationError,
    handleResponseValidationError,
    isZodError,
} from './error-handler.core.ts';
import { buildPaginationMeta, buildSuccessResponsePayload } from './response-builder.core.ts';
import { sanitizeResponse } from './sanitize-response.core.ts';
import {
    executeAuthenticationStage,
    executeAuthorizationStage,
    mergeHandlerSecurityDefaults,
} from './security.core.ts';
import type {
    AccessMode,
    Authenticator,
    AuthorizationConfig,
    ContractResponse,
    HandlerErrorMappers,
    HandlerOptions,
    HandlerSuccessResult,
    SecurityOptions,
    ValidatedRequest,
} from './types.core.ts';
import { validateContractRequest } from './validate-contract-request.core.ts';

// =========================================================================
// SECTION 1: CONTRACT AND REQUEST TYPING
// =========================================================================

type ContractRequestEnvelope = {
    body: unknown;
    query: unknown;
    params: unknown;
};

type AnyContract = Contract<ZodType<ContractRequestEnvelope>, ZodTypeAny, boolean>;

type ContractRequestPayload<TContract extends AnyContract> = Infer<TContract['request']>;

type ContractHandlerSuccessResult<TContract extends AnyContract> =
    TContract extends Contract<
        ZodTypeAny,
        infer TResponseDataSchema extends ZodTypeAny,
        infer TPaginated extends boolean
    >
    ? HandlerSuccessResult<TResponseDataSchema, TPaginated>
    : never;

type NoExtraTopLevelKeys<TExpected, TActual extends TExpected> = TActual &
    Record<Exclude<keyof TActual, keyof TExpected>, never>;

/**
 * Validated request shape for a contract handler.
 *
 * Uses the contract request schema to type body/query/params after validation.
 * When pagination.request is enabled in the contract, query includes `page` and `limit`
 * unless you defined them explicitly in the request schema.
 *
 * @example
 * createHandler(contract, async ({ req }) => {
 *   req.body;
 *   return { data: { ... } };
 * });
 */
export type HandlerRequest<TContract extends AnyContract> = ValidatedRequest<
    ContractRequestPayload<TContract>
>;

type AuthorizerBaseRequest = Request<Record<string, string>, any, unknown, any>;

/**
 * Request type passed to authorizers when authorization runs after validation.
 *
 * Combines the validated request payload with an Express Request base.
 * This is the request type you should use when authorizers need typed body/query/params.
 *
 * @example
 * createHandler(contract, {
 *   access: "protected",
 *   security: {
 *     authorize: {
 *       afterValidation: [async ({ req }) => req.body.title.length > 0],
 *     },
 *   },
 * }, handler);
 */
export type AfterAuthorizationRequest<TContract extends AnyContract> = AuthorizerBaseRequest &
    HandlerRequest<TContract>;

/**
 * Context object passed to all handler functions.
 *
 * The shape varies by access mode:
 * - `public`: `{ req }` only
 * - `protected`: `{ req, auth }` where auth is always present
 * - `optional`: `{ req, auth? }` where auth may be undefined
 *
 * @typeParam TContract - Contract type (provides request typing)
 * @typeParam TAuth - Auth context type from security.authenticate
 * @typeParam TAccess - Access mode determining which fields are present
 *
 * @example
 * // Public handler
 * createHandler(contract, async ({ req }) => ({ data: { id: req.params.id } }));
 *
 * @example
 * // Protected handler
 * createHandler(contract, { access: 'protected', security: { ... } }, async ({ req, auth }) => {
 *   return { data: { userId: auth.userId } };
 * });
 */
export type HandlerContext<
    TContract extends AnyContract,
    TAuth,
    TAccess extends AccessMode,
> = TAccess extends 'public'
    ? { req: HandlerRequest<TContract> }
    : TAccess extends 'protected'
      ? { req: HandlerRequest<TContract>; auth: TAuth }
      : TAccess extends 'optional'
        ? { req: HandlerRequest<TContract>; auth?: TAuth }
        : never;

/**
 * Unified handler function type for all access modes.
 *
 * Single context-object parameter replaces positional (req) and (req, auth) signatures.
 * TypeScript enforces the correct context shape based on the access mode selected
 * in the handler options.
 *
 * Excess top-level keys in the return value are rejected at compile time.
 *
 * @typeParam TContract - Contract providing request and response typing
 * @typeParam TAuth - Auth context type
 * @typeParam TAccess - Access mode
 * @typeParam TResult - Handler return shape (must extend ContractHandlerSuccessResult)
 */
type HandlerFn<
    TContract extends AnyContract,
    TAuth,
    TAccess extends AccessMode,
    TResult extends ContractHandlerSuccessResult<TContract>,
> = (
    ctx: HandlerContext<TContract, TAuth, TAccess>,
) => Promise<NoExtraTopLevelKeys<ContractHandlerSuccessResult<TContract>, TResult>>;

// =========================================================================
// SECTION 2: EXPLICIT SECURITY & OPTION INTERFACES
// =========================================================================

/**
 * Security config for protected/optional handlers where `authenticate` is required.
 *
 * Authorization is expressed as two timing buckets via {@link AuthorizationConfig}:
 * `beforeValidation` policies receive a plain Express `Request`; `afterValidation`
 * policies receive the contract's validated request type.
 *
 * @example
 * const options: ProtectedOpts<AuthContext, typeof contract> = {
 *   access: 'protected',
 *   security: {
 *     authenticate: async () => ({ userId: 'u-1' }),
 *     authorize: {
 *       beforeValidation: [({ auth }) => auth.role === 'staff'],
 *       afterValidation: [({ req, auth }) => auth.userId === req.params.id],
 *     },
 *   },
 * };
 */
interface SecuredSecurity<TAuth, TReq extends Request = Request> {
    /** Authentication callback. Required for protected/optional access. */
    authenticate: Authenticator<TAuth>;
    /**
     * Authorization buckets evaluated around request validation.
     * Omit when authentication is required but no policies are needed.
     */
    authorize?: AuthorizationConfig<TAuth, TReq>;
    /** Zod schema to validate auth context. Failures trigger 401. */
    authSchema?: ZodType<TAuth>;
}

/**
 * Security config for factory-produced handlers where `authenticate` is inherited
 * from the factory defaults. Only `authorize` / `authSchema` may be overridden.
 */
interface InheritedSecurity<TAuth, TReq extends Request = Request> {
    /** Authorization buckets evaluated around request validation. */
    authorize?: AuthorizationConfig<TAuth, TReq>;
    /** Zod schema to validate auth context. Failures trigger 401. */
    authSchema?: ZodType<TAuth>;
}

/**
 * Options for public handlers. No security allowed.
 *
 * @example
 * createHandler(contract, { access: 'public' }, async ({ req }) => ({ data: ... }));
 */
interface PublicHandlerOpts {
    /** Access mode. Default: 'public'. No security allowed. */
    access?: 'public';
    /** @internal Not allowed for public handlers. */
    security?: never;
    /** @internal Not allowed for public handlers. */
    errors?: never;
}

/**
 * Options for protected handlers.
 *
 * Authentication is required. Authorization may run before validation, after
 * validation, or both via the nested `authorize` buckets.
 *
 * @example
 * createHandler(contract, {
 *   access: 'protected',
 *   security: {
 *     authenticate: async () => ({ userId: 'u-1' }),
 *     authorize: {
 *       beforeValidation: [({ auth }) => auth.role === 'staff'],
 *       afterValidation: [({ req, auth }) => auth.userId === req.params.id],
 *     },
 *   },
 * }, async ({ req, auth }) => ({ data: ... }));
 */
interface ProtectedOpts<TAuth, TContract extends AnyContract> {
    /** Access mode: authentication required. */
    access: 'protected';
    /** Security configuration with nested authorization buckets. */
    security: SecuredSecurity<TAuth, AfterAuthorizationRequest<TContract>>;
    /** Custom error responses for auth failures. */
    errors?: HandlerErrorMappers;
}

/**
 * Options for optional handlers.
 *
 * Authentication may run; auth context is optional in the handler.
 *
 * @example
 * createHandler(contract, {
 *   access: 'optional',
 *   security: { authenticate: async () => ({ userId: 'u-1' }) },
 * }, async ({ req, auth }) => ({ data: ... }));
 */
interface OptionalOpts<TAuth, TContract extends AnyContract> {
    /** Access mode: authentication may run, auth context optional in handler. */
    access: 'optional';
    /** Security configuration with nested authorization buckets. */
    security: SecuredSecurity<TAuth, AfterAuthorizationRequest<TContract>>;
    /** Custom error responses for auth failures. */
    errors?: HandlerErrorMappers;
}

// =========================================================================
// SECTION 3: RUNTIME HELPERS
// =========================================================================

type HandlerArgsResolution<TOptions, THandler> = {
    options?: TOptions;
    handler: THandler;
};

/**
 * Resolves handler arguments to `{ options, handler }` ensuring handler is last.
 */
function resolveHandlerArgs<TOptions, THandler>(
    arg2: THandler | TOptions,
    arg3: THandler | TOptions | undefined,
    errorMessage: string,
): HandlerArgsResolution<TOptions, THandler> {
    if (typeof arg2 === 'function') {
        return {
            handler: arg2 as THandler,
            options: arg3 as TOptions | undefined,
        };
    }

    if (typeof arg3 !== 'function') {
        throw new Error(errorMessage);
    }

    return {
        handler: arg3 as THandler,
        options: arg2 as TOptions,
    };
}

/**
 * Validates the request and sends a 400 response when validation fails.
 */
async function validateRequestOrRespond<TContract extends AnyContract>(
    contract: TContract,
    req: Request,
    res: Response,
): Promise<HandlerRequest<TContract> | null> {
    try {
        return await validateContractRequest<TContract['request']>(contract.request, req);
    } catch (error) {
        if (isZodError(error)) {
            handleRequestValidationError(error, res);
            return null;
        }

        throw error;
    }
}

/**
 * Sanitizes the response and sends a 500 response when output validation fails.
 */
function sanitizeResponseOrRespond<TContract extends AnyContract>(
    contract: TContract,
    payload: ReturnType<typeof buildSuccessResponsePayload>,
    res: Response,
): ContractResponse<unknown, boolean> | null {
    try {
        return sanitizeResponse(contract.response, payload);
    } catch (error) {
        if (isZodError(error)) {
            handleResponseValidationError(error, res);
            return null;
        }

        throw error;
    }
}

/**
 * Executes the handler with the context object based on access mode.
 */
async function executeHandlerByAccess<TContract extends AnyContract, TAuth>(
    access: AccessMode,
    handler: (ctx: HandlerContext<TContract, TAuth, AccessMode>) => Promise<ContractHandlerSuccessResult<TContract>>,
    req: HandlerRequest<TContract>,
    auth: TAuth | undefined,
): Promise<ContractHandlerSuccessResult<TContract>> {
    if (access === 'public') {
        return handler({ req } as HandlerContext<TContract, TAuth, AccessMode>);
    }
    return handler({ req, auth } as HandlerContext<TContract, TAuth, AccessMode>);
}

type AnyHandlerFn<TContract extends AnyContract, TAuth> = (
    ctx: HandlerContext<TContract, TAuth, AccessMode>,
) => Promise<ContractHandlerSuccessResult<TContract>>;

/**
 * Internal runtime pipeline for createHandler and createHandlerFactory.
 */
function createHandlerRuntime<TContract extends AnyContract, TAuth>(
    contract: TContract,
    handler: AnyHandlerFn<TContract, TAuth>,
    options?: HandlerOptions<AccessMode, TAuth, Request>,
): RequestHandler {
    return async (req, res) => {
        try {
            const access = options?.access ?? 'public';
            const security = options?.security;
            const errors = options?.errors;

            const authenticationResult =
                access === 'public'
                    ? ({ auth: undefined } as { auth?: TAuth })
                    : ((await executeAuthenticationStage({
                        req,
                        access,
                        security: security
                            ? {
                                authenticate: security.authenticate,
                                authSchema: security.authSchema,
                            }
                            : undefined,
                        errors,
                    })) as { auth?: TAuth });

            const authorize = security?.authorize;

            if (access !== 'public' && authorize?.beforeValidation?.length) {
                await executeAuthorizationStage({
                    req,
                    access,
                    auth: authenticationResult.auth,
                    authorizers: authorize.beforeValidation,
                    errors,
                });
            }

            const validatedReq = await validateRequestOrRespond(contract, req, res);
            if (!validatedReq) {
                return;
            }

            if (access !== 'public' && authorize?.afterValidation?.length) {
                await executeAuthorizationStage({
                    req: validatedReq as AfterAuthorizationRequest<TContract>,
                    access,
                    auth: authenticationResult.auth,
                    authorizers: authorize.afterValidation,
                    errors,
                });
            }

            const result = await executeHandlerByAccess(
                access,
                handler,
                validatedReq,
                authenticationResult.auth,
            );

            const statusCode = result.statusCode ?? 200;
            const successPayload = buildSuccessResponsePayload({
                data: result.data,
                timestamp: new Date().toISOString(),
                pagination: result.pagination ? buildPaginationMeta(result.pagination) : undefined,
            });

            const output = sanitizeResponseOrRespond(contract, successPayload, res);
            if (!output) {
                return;
            }

            if (result.cookies?.length) {
                for (const operation of result.cookies) {
                    if (operation.action === 'set') {
                        const cookieOpts = operation.options ?? {};
                        res.cookie(operation.name, operation.value, cookieOpts);
                    } else {
                        res.clearCookie(operation.name, operation.options);
                    }
                }
            }

            res.status(statusCode).json(output);
        } catch (error) {
            handleError(error, res);
        }
    };
}

// =========================================================================
// SECTION 4: PUBLIC API - CREATE HANDLER
// =========================================================================

/**
 * Creates an Express handler from a contract and an async implementation.
 *
 * The generated handler enforces the contract end-to-end: it validates incoming
 * requests, orchestrates authentication/authorization, and validates the
 * outgoing response against the contract schema.
 *
 * Handler result shape:
 * - `data` is required and must match the contract response schema.
 * - `pagination` is required when contract.pagination.response is true.
 * - `cookies` are applied only for successful responses after validation.
 * - Extra top-level keys are rejected by TypeScript.
 *
 * Access modes:
 * - `public`: no auth context, no security options allowed
 * - `optional`: auth context is optional in the handler
 * - `protected`: auth context is required in the handler
 *
 * Authorization timing:
 * - `authorize.beforeValidation` policies run on the raw Express `Request`
 *   before request validation (fail-fast on cheap checks like roles/scopes).
 * - `authorize.afterValidation` policies run on the validated request with typed
 *   body/query/params (resource ownership, payload-dependent checks).
 * - A handler may use either bucket, both, or neither. Both buckets use
 *   logical-AND semantics and short-circuit on the first failure.
 *
 * Auth inference note:
 * When providing `security.authenticate` with a parameter, explicitly annotate
 * it as `Request` to avoid auth context degrading to `unknown`.
 * See docs/rules/create-handler-auth-inference-limitations.md.
 *
 * Error mapping:
 * Use `options.errors` to override unauthenticated/unauthorized error responses.
 *
 * @param contract - Contract describing request and response schemas.
 * @param options - Optional access/security/errors configuration.
 * @param handler - Async handler receiving a context object and returning a contract-aligned result.
 *
 * @example
 * createHandler(getBookContract, async ({ req }) => ({ data: { book: req.params.isbn } }));
 *
 * @example
 * createHandler(updateBookContract, {
 *   access: "protected",
 *   security: {
 *     authenticate: async (_req: Request) => ({ userId: "u-1" }),
 *     authorize: {
 *       beforeValidation: [({ auth }) => auth.role === "staff"],
 *       afterValidation: [({ req, auth }) => auth.userId === req.params.id],
 *     },
 *   },
 * }, async ({ req, auth }) => ({ data: { updated: true } }));
 *
 * @example
 * createHandler(loginContract, async ({ req }) => ({
 *   data: { token: "jwt" },
 *   cookies: [
 *     {
 *       action: "set",
 *       name: "session",
 *       value: "jwt",
 *       options: { httpOnly: true, sameSite: "lax" },
 *     },
 *   ],
 * }));
 *
 * @example
 * createHandler(listBooksContract, async ({ req }) => ({
 *   data: [{ id: "b-1", title: "Title" }],
 *   pagination: { totalCount: 100, page: req.query.page, limit: req.query.limit },
 * }));
 */
export function createHandler<
    TContract extends AnyContract,
    TResult extends ContractHandlerSuccessResult<TContract>,
>(contract: TContract, handler: HandlerFn<TContract, never, 'public', TResult>): RequestHandler;

export function createHandler<
    TContract extends AnyContract,
    TResult extends ContractHandlerSuccessResult<TContract>,
>(
    contract: TContract,
    options: PublicHandlerOpts,
    handler: HandlerFn<TContract, never, 'public', TResult>,
): RequestHandler;

export function createHandler<
    TContract extends AnyContract,
    TAuth,
    TResult extends ContractHandlerSuccessResult<TContract>,
>(
    contract: TContract,
    options: ProtectedOpts<TAuth, TContract>,
    handler: HandlerFn<TContract, TAuth, 'protected', TResult>,
): RequestHandler;

export function createHandler<
    TContract extends AnyContract,
    TAuth,
    TResult extends ContractHandlerSuccessResult<TContract>,
>(
    contract: TContract,
    options: OptionalOpts<TAuth, TContract>,
    handler: HandlerFn<TContract, TAuth, 'optional', TResult>,
): RequestHandler;

export function createHandler<TContract extends AnyContract, TAuth>(
    contract: TContract,
    arg2:
        | PublicHandlerOpts
        | ProtectedOpts<TAuth, TContract>
        | OptionalOpts<TAuth, TContract>
        | ((ctx: any) => Promise<any>),
    arg3?: (ctx: any) => Promise<any>,
): RequestHandler {
    const { handler, options } = resolveHandlerArgs<
        PublicHandlerOpts | ProtectedOpts<TAuth, TContract> | OptionalOpts<TAuth, TContract>,
        (ctx: any) => Promise<any>
    >(arg2, arg3, 'createHandler requires a handler function as the last argument.');

    const access = (options as HandlerOptions<AccessMode, TAuth, Request>)?.access ?? 'public';
    if (access !== 'public' && !(options as HandlerOptions<AccessMode, TAuth, Request>)?.security?.authenticate) {
        throw new Error(
            `createHandler: ${access} handlers require an authenticate function in security options.`,
        );
    }

    return createHandlerRuntime(contract, handler as AnyHandlerFn<TContract, TAuth>, options as HandlerOptions<AccessMode, TAuth, Request>);
}

/**
 * Thin wrapper used by handler factories after defaults are merged.
 */
function createHandlerInternal<TContract extends AnyContract, TAuth>(
    contract: TContract,
    handler: AnyHandlerFn<TContract, TAuth>,
    options?: HandlerOptions<AccessMode, TAuth, Request>,
): RequestHandler {
    return createHandlerRuntime<TContract, TAuth>(contract, handler, options);
}

// =========================================================================
// SECTION 5: HANDLER FACTORY TYPES
// =========================================================================

type HandlerFactoryDefaults<TAuthContext> = {
    /**
     * Default access mode applied to handlers created by this factory.
     */
    access?: AccessMode;
    /**
     * Default security configuration merged into each handler's options.
     */
    security?: SecurityOptions<TAuthContext, Request>;
    /**
     * Default auth error mappers merged into each handler's options.
     */
    errors?: HandlerErrorMappers<Request>;
};

type FactoryProtectedOpts<TAuth, TContract extends AnyContract> = {
    access?: 'protected';
    security?: InheritedSecurity<TAuth, AfterAuthorizationRequest<TContract>>;
    errors?: HandlerErrorMappers;
};

type FactoryOptionalOpts<TAuth, TContract extends AnyContract> = {
    access?: 'optional';
    security?: InheritedSecurity<TAuth, AfterAuthorizationRequest<TContract>>;
    errors?: HandlerErrorMappers;
};

type FactoryPublicOverrideOpts = {
    access: 'public';
    security?: never;
};

/**
 * Handler factory return type for protected/optional factories.
 *
 * A single factory interface covers both before- and after-validation
 * authorization, because timing is expressed per-bucket in `authorize` rather
 * than as a factory-level toggle. Per-handler overrides may use either bucket.
 *
 * @typeParam TAuth - Auth context type from the factory's `authenticate` default.
 * @typeParam TDefaultAccess - Default access mode (protected or optional).
 */
interface SecuredFactory<
    TAuth,
    TDefaultAccess extends Exclude<AccessMode, 'public'>,
> {
    <TContract extends AnyContract, TResult extends ContractHandlerSuccessResult<TContract>>(
        contract: TContract,
        handler: HandlerFn<TContract, TAuth, TDefaultAccess, TResult>,
    ): RequestHandler;

    <TContract extends AnyContract, TResult extends ContractHandlerSuccessResult<TContract>>(
        contract: TContract,
        options: FactoryProtectedOpts<TAuth, TContract>,
        handler: HandlerFn<TContract, TAuth, 'protected', TResult>,
    ): RequestHandler;

    <TContract extends AnyContract, TResult extends ContractHandlerSuccessResult<TContract>>(
        contract: TContract,
        options: FactoryOptionalOpts<TAuth, TContract>,
        handler: HandlerFn<TContract, TAuth, 'optional', TResult>,
    ): RequestHandler;

    <TContract extends AnyContract, TResult extends ContractHandlerSuccessResult<TContract>>(
        contract: TContract,
        options: FactoryPublicOverrideOpts,
        handler: HandlerFn<TContract, never, 'public', TResult>,
    ): RequestHandler;
}

/**
 * Handler factory return type for public-only factory.
 * Supports overriding to protected/optional with full security options.
 */
interface PublicFactory {
    <TContract extends AnyContract, TResult extends ContractHandlerSuccessResult<TContract>>(
        contract: TContract,
        handler: HandlerFn<TContract, never, 'public', TResult>,
    ): RequestHandler;

    <TContract extends AnyContract, TResult extends ContractHandlerSuccessResult<TContract>>(
        contract: TContract,
        options: PublicHandlerOpts,
        handler: HandlerFn<TContract, never, 'public', TResult>,
    ): RequestHandler;

    <TContract extends AnyContract, TAuth, TResult extends ContractHandlerSuccessResult<TContract>>(
        contract: TContract,
        options: ProtectedOpts<TAuth, TContract>,
        handler: HandlerFn<TContract, TAuth, 'protected', TResult>,
    ): RequestHandler;

    <TContract extends AnyContract, TAuth, TResult extends ContractHandlerSuccessResult<TContract>>(
        contract: TContract,
        options: OptionalOpts<TAuth, TContract>,
        handler: HandlerFn<TContract, TAuth, 'optional', TResult>,
    ): RequestHandler;
}

// =========================================================================
// SECTION 6: PUBLIC API - HANDLER FACTORIES
// =========================================================================

/**
 * Creates a preconfigured handler factory with default access/security/errors.
 *
 * Defaults are shallow-merged with per-handler options. If defaults include
 * `authenticate`, callers do not need to provide it again.
 *
 * Merge rules:
 * - `access` is overridden by per-handler options when provided.
 * - `security` and `errors` are merged by key (callers can override specific fields).
 * - Public access cannot define or accept security options.
 *
 * @param defaults - Default access, security, and error mapping settings.
 * @returns A handler factory that enforces the configured defaults.
 *
 * @example
 * const protectedFactory = createHandlerFactory({
 *   access: "protected",
 *   security: { authenticate: async () => ({ userId: "u-1" }) },
 * });
 *
 * protectedFactory(contract, async ({ req, auth }) => ({ data: { id: auth.userId } }));
 *
 * @example
 * const optionalFactory = createHandlerFactory({
 *   access: "optional",
 *   security: { authenticate: async (_req: Request) => ({ userId: "u-2" }) },
 * });
 *
 * optionalFactory(contract, async ({ req, auth }) => ({ data: { userId: auth?.userId } }));
 *
 * @example
 * const strictFactory = createHandlerFactory({
 *   access: "protected",
 *   security: {
 *     authenticate: async (_req: Request) => ({ userId: "u-3" }),
 *     authorize: { afterValidation: [({ auth }) => auth.userId.startsWith("u-")] },
 *   },
 * });
 *
 * strictFactory(contract, async ({ req, auth }) => ({ data: { id: auth.userId } }));
 */
export function createHandlerFactory<TAuth>(
    defaults: HandlerFactoryDefaults<TAuth> & {
        access: 'protected';
    },
): SecuredFactory<TAuth, 'protected'>;

export function createHandlerFactory<TAuth>(
    defaults: HandlerFactoryDefaults<TAuth> & {
        access: 'optional';
    },
): SecuredFactory<TAuth, 'optional'>;

export function createHandlerFactory<TAuth>(
    defaults: { access: 'public'; security?: never; errors?: never },
): PublicFactory;

export function createHandlerFactory<TAuth>(): PublicFactory;

export function createHandlerFactory<TAuth>(
    defaults?: HandlerFactoryDefaults<TAuth>,
): SecuredFactory<TAuth, Exclude<AccessMode, 'public'>> | PublicFactory {
    if (defaults?.security && (defaults.access ?? 'public') === 'public') {
        throw new Error(
            'createHandlerFactory: public access cannot define security defaults. ' +
            "Use access: 'optional' or 'protected' instead.",
        );
    }

    function createConfiguredHandler<TContract extends AnyContract>(
        contract: TContract,
        arg2:
            | AnyHandlerFn<TContract, TAuth>
            | HandlerOptions<AccessMode, TAuth, Request>,
        arg3?:
            | AnyHandlerFn<TContract, TAuth>
            | HandlerOptions<AccessMode, TAuth, Request>,
    ): RequestHandler {
        const { handler, options } = resolveHandlerArgs<
            HandlerOptions<AccessMode, TAuth, Request>,
            AnyHandlerFn<TContract, TAuth>
        >(arg2, arg3, 'Configured handlers require a handler function as the last argument.');

        const merged = mergeHandlerSecurityDefaults(defaults, options);

        const resolvedAccess = merged.access;
        if (resolvedAccess !== 'public' && !merged.security?.authenticate) {
            throw new Error(
                `createHandlerFactory: ${resolvedAccess} handlers require an authenticate function. ` +
                'Provide it in factory defaults or per-handler security options.',
            );
        }

        const mergedOptions: HandlerOptions<AccessMode, TAuth, Request> = {
            ...options,
            access: resolvedAccess,
            security: merged.security,
            errors: merged.errors,
        };

        return createHandlerInternal<TContract, TAuth>(contract, handler, mergedOptions);
    }

    if ((defaults?.access ?? 'public') === 'public') {
        return createConfiguredHandler as PublicFactory;
    }

    return createConfiguredHandler as SecuredFactory<TAuth, Exclude<AccessMode, 'public'>>;
}
