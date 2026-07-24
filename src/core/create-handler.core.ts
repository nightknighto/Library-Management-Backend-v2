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
 * 9. Apply response headers (before cookies), then cookies.
 * 10. Send response or error.
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
    Authorizer,
    ContractResponse,
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
}

/**
 * Security config for factory-produced handlers where `authenticate` is inherited
 * from the factory defaults. Only `authorize` may be overridden.
 */
interface InheritedSecurity<TAuth, TReq extends Request = Request> {
    /** Authorization buckets evaluated around request validation. */
    authorize?: AuthorizationConfig<TAuth, TReq>;
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

            const authenticationResult =
                access === 'public'
                    ? ({ auth: undefined } as { auth?: TAuth })
                    : ((await executeAuthenticationStage({
                        req,
                        access,
                        security: security
                            ? {
                                authenticate: security.authenticate,
                            }
                            : undefined,
                    })) as { auth?: TAuth });

            const authorize = security?.authorize;

            if (access !== 'public' && authorize?.beforeValidation?.length) {
                await executeAuthorizationStage({
                    req,
                    auth: authenticationResult.auth,
                    authorizers: authorize.beforeValidation,
                });
            }

            const validatedReq = await validateRequestOrRespond(contract, req, res);
            if (!validatedReq) {
                return;
            }

            if (access !== 'public' && authorize?.afterValidation?.length) {
                await executeAuthorizationStage({
                    req: validatedReq as AfterAuthorizationRequest<TContract>,
                    auth: authenticationResult.auth,
                    authorizers: authorize.afterValidation,
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

            // Apply headers before cookies so a Set-Cookie from the cookies block
            // is never overwritten by a blanket header write. Express's res.set
            // accepts string | string[]; HeaderValue widens that with number/boolean,
            // which are coerced to strings here (matching cookie value handling).
            if (result.headers) {
                for (const [name, value] of Object.entries(result.headers)) {
                    res.set(name, Array.isArray(value) ? value : String(value));
                }
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
 * Authentication errors:
 * Authentication failures (expired/revoked/malformed credentials) are thrown by
 * the authenticator and propagate in both `optional` and `protected` access. The
 * "no credentials on a protected route" default is owned by the authenticator via
 * `onMissingCredentials` (set with `createAuthenticator`); there is no handler-
 * level error mapper. See docs/create-handler-security-guide.md.
 *
 * @param contract - Contract describing request and response schemas.
 * @param options - Optional access/security configuration.
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

// Factory authorizer shape propagation.
//
// A factory produces handlers for many contracts, so an authorizer installed
// at factory or .extend() time cannot be checked against a single contract.
// Instead its required request shape is CAPTURED into a TReq type parameter
// and enforced at each invocation, where the contract's AfterAuthorizationRequest
// is known.
//
// Only afterValidation authorizers contribute: beforeValidation policies run
// against a plain Request before validation and therefore impose no
// contract-bound requirement.

/** Extracts the required Request shape from an afterValidation authorizer array. */
type ExtractAfterReq<T> =
    T extends ReadonlyArray<infer A>
        ? A extends Authorizer<any, infer R> ? R : never
        : never;

/** Extracts the required Request shape from an `authorize` config. */
type ExtractAuthorizeReq<TAuthorize> = TAuthorize extends {
    afterValidation?: infer B;
}
    ? ExtractAfterReq<B>
    : Request;

/**
 * Widened `AuthorizationConfig` constraint for authorizer shape inference.
 *
 * Authorizers are contravariant in their `TRequest`: an authorizer typed
 * `Authorizer<Auth, Request<{isbn:string},...>>` is NOT assignable to
 * `Authorizer<Auth, Request>` (plain Request.params is `ParamsDictionary`, an
 * index signature with no named `isbn`). Using plain `Request` as the
 * constraint would therefore reject the very shape-bound authorizers this
 * feature exists to support.
 *
 * Using `Request<any, any, any, any>` widens the constraint so contravariance
 * is satisfied for any `Request` specialization (because `any` is assignable to
 * everything), while inference still captures the concrete authorizer shape
 * into `TAuthorize` for {@link ExtractAuthorizeReq} to read.
 */
type AnyReqAuthorizeConfig<TAuth> = AuthorizationConfig<TAuth, Request<any, any, any, any>>;

/**
 * Enforces that a contract satisfies an accumulated authorizer requirement.
 *
 * Returns `TContract` unchanged when its {@link AfterAuthorizationRequest} is
 * assignable to `TReq`; otherwise yields an incompatible type so the contract
 * is rejected at the call site. Wrapping the contract parameter in this
 * conditional preserves `TContract` inference (call-site generics still infer
 * the original contract type) — verified by inference tests.
 *
 * The `false` branch adds a REQUIRED property whose NAME is a self-contained,
 * human-readable explanation of the failure. A real contract object never
 * carries it, so the assignment fails and TypeScript echoes the property name
 * verbatim in the diagnostic — the developer reads the explanation directly in
 * the error message. (An optional marker would silently satisfy every object,
 * so the property must be required. The message carries no links: a consuming
 * project's tooling surfaces only the literal text, never this repo's docs.)
 */
type Checked<TContract extends AnyContract, TReq extends Request> =
    AfterAuthorizationRequest<TContract> extends TReq
        ? TContract
        : TContract & {
              readonly '[ERROR] Contract rejected: this factory has an afterValidation authorizer that requires a request field (e.g. a params/body/query field) the contract does not provide. Make the contract define the field(s) the authorizer reads.': unique symbol;
          };

type HandlerFactoryDefaults<
    TAuthContext,
    TAuthorize extends AnyReqAuthorizeConfig<TAuthContext> = AnyReqAuthorizeConfig<TAuthContext>,
> = {
    /**
     * Default access mode applied to handlers created by this factory.
     */
    access?: AccessMode;
    /**
     * Default security configuration merged into each handler's options.
     * `authenticate` carries `TAuthContext`; `authorize` is generic in
     * `TAuthorize` so the caller's passed authorizer shape can be captured and
     * propagated onto the factory's accumulated requirement.
     */
    security?: {
        authenticate?: Authenticator<TAuthContext>;
        authorize?: TAuthorize;
    };
};

/**
 * Options accepted by {@link SecuredFactory.extend} — an already-secured factory's
 * `authenticate` is transitively locked and may not be re-declared; only
 * `authorize` buckets may be layered on, and `access` may move between
 * `protected`/`optional` but never widen to `public` (which would erase the
 * parent's security pipeline).
 *
 * The `authorize` field is generic in `TAuthorize` so the caller's passed
 * authorizer shape can be captured and propagated onto the derived factory's
 * accumulated requirement (see the {@link Checked} helper). The constraint is
 * widened via {@link AnyReqAuthorizeConfig} so shape-bound authorizers fit
 * while their concrete shape is preserved for inference.
 * @typeParam TAuth - Auth context inherited from the parent factory.
 * @typeParam TAuthorize - Inferred shape of the passed `authorize` config.
 */
type SecuredFactoryExtension<TAuth, TAuthorize extends AnyReqAuthorizeConfig<TAuth> = AnyReqAuthorizeConfig<TAuth>> = {
    /**
     * New default access for the derived factory. Omit to inherit the parent's.
     * `'public'` is intentionally excluded: a derived factory cannot erase the
     * parent's security baseline.
     */
    access?: Exclude<AccessMode, 'public'>;
    /**
     * Authorize buckets to concatenate additively after the parent's buckets.
     * `authenticate` is inherited from the parent and cannot be set here.
     */
    security?: { authorize?: TAuthorize };
};

/**
 * Options accepted by {@link PublicFactory.extend} — a public factory has no
 * authenticator, so extending it is an *upgrade*: the caller supplies the
 * `authenticate` ("first setter") and may layer `authorize`. After this, the
 * returned secured factory locks `authenticate` for its own descendants.
 *
 * Like {@link SecuredFactoryExtension}, `authorize` is generic in `TAuthorize`
 * so the passed authorizer shape can be captured onto the resulting secured
 * factory's requirement.
 * @typeParam TAuth - Auth context introduced by this upgrade.
 * @typeParam TAuthorize - Inferred shape of the passed `authorize` config.
 */
type PublicFactoryUpgrade<
    TAuth,
    TAuthorize extends AnyReqAuthorizeConfig<TAuth> = AnyReqAuthorizeConfig<TAuth>,
> = {
    /**
     * New (secured) default access. Required: a public factory must be upgraded
     * to `protected` or `optional` to gain a security pipeline.
     */
    access: Exclude<AccessMode, 'public'>;
    /**
     * Authenticator (first setter) plus optional authorize buckets for the
     * upgraded factory.
     */
    security: {
        authenticate: Authenticator<TAuth>;
        authorize?: TAuthorize;
    };
};

type FactoryProtectedOpts<TAuth, TContract extends AnyContract> = {
    access?: 'protected';
    security?: InheritedSecurity<TAuth, AfterAuthorizationRequest<TContract>>;
};

type FactoryOptionalOpts<TAuth, TContract extends AnyContract> = {
    access?: 'optional';
    security?: InheritedSecurity<TAuth, AfterAuthorizationRequest<TContract>>;
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
 * @typeParam TReq - Accumulated request shape required by the factory's
 *   baseline `afterValidation` authorizers (and by every ancestor's, via
 *   `.extend()`). A contract passed to this factory must produce an
 *   {@link AfterAuthorizationRequest} assignable to `TReq`. Defaults to plain
 *   `Request` (no requirement) for factories without shape-bound authorizers.
 */
interface SecuredFactory<
    TAuth,
    TDefaultAccess extends Exclude<AccessMode, 'public'>,
    TReq extends Request = Request,
> {
    <TContract extends AnyContract, TResult extends ContractHandlerSuccessResult<TContract>>(
        contract: Checked<TContract, TReq>,
        handler: HandlerFn<TContract, TAuth, TDefaultAccess, TResult>,
    ): RequestHandler;

    <TContract extends AnyContract, TResult extends ContractHandlerSuccessResult<TContract>>(
        contract: Checked<TContract, TReq>,
        options: FactoryProtectedOpts<TAuth, TContract>,
        handler: HandlerFn<TContract, TAuth, 'protected', TResult>,
    ): RequestHandler;

    <TContract extends AnyContract, TResult extends ContractHandlerSuccessResult<TContract>>(
        contract: Checked<TContract, TReq>,
        options: FactoryOptionalOpts<TAuth, TContract>,
        handler: HandlerFn<TContract, TAuth, 'optional', TResult>,
    ): RequestHandler;

    <TContract extends AnyContract, TResult extends ContractHandlerSuccessResult<TContract>>(
        contract: TContract,
        options: FactoryPublicOverrideOpts,
        handler: HandlerFn<TContract, never, 'public', TResult>,
    ): RequestHandler;

    /**
     * Derives a new factory that layers authorize buckets on top of this
     * factory's baseline, producing another first-class factory that is itself
     * extendable and handler-producible.
     *
     * Merge semantics:
     * - **authorize buckets concatenate additively**, parent-first (this
     *   factory's `beforeValidation`/`afterValidation` run before the child's).
     *   Re-declaring an authorizer at both layers runs it twice — no dedup.
     * - **authenticate is transitively locked**: inherited from this factory,
     *   never overridable by a descendant. Changing identity requires a sibling
     *   factory built from the root, not a child.
     * - **access may move between `protected` and `optional`, but never widen to
     *   `public`** (which would erase the parent's security pipeline). Omit
     *   `access` to inherit this factory's.
     * - **afterValidation authorizer shapes accumulate**: each authorizer's
     *   required request shape is intersected onto the parent's accumulated
     *   `TReq`, so every contract passed to the derived factory must satisfy
     *   every baseline requirement (parent + child). `beforeValidation`
     *   authorizers impose no requirement (they run on a plain `Request`).
     *
     * The result is flattened — indistinguishable from a root factory built with
     * the same merged defaults — so chains of arbitrary depth are well-defined.
     *
     * @param ext - Authorize buckets to concatenate and an optional access
     *   transition. `authenticate` must not appear (it is locked).
     * @returns A derived factory with the same `TAuth`, the (possibly
     *   transitioned) access, and the accumulated authorizer requirement.
     *
     * @example
     * const jwtFactory = createHandlerFactory({
     *   access: "protected",
     *   security: { authenticate: authenticateJwt },
     * });
     *
     * // Every adminFactory handler authenticates via JWT AND passes isAdmin.
     * const adminFactory = jwtFactory.extend({
     *   security: { authorize: { afterValidation: [({ auth }) => auth.role === "admin"] } },
     * });
     *
     * @example
     * // A shape-bound authorizer requires params.isbn on every contract.
     * const requireIsbn: Authorizer<Auth, Request<{ isbn: string }, any, unknown, any>> =
     *   async ({ req }) => { if (!req.params.isbn) throw new HttpError.Forbidden(); return true; };
     * const ownerFactory = jwtFactory.extend({
     *   security: { authorize: { afterValidation: [requireIsbn] } },
     * });
     *
     * @example
     * // Optional-access child of a protected factory — same pipeline, guests allowed.
     * const optionalFactory = jwtFactory.extend({ access: "optional" });
     */
    extend<TAuthorize extends AnyReqAuthorizeConfig<TAuth> = AnyReqAuthorizeConfig<TAuth>>(
        ext: { access: 'protected' } & SecuredFactoryExtension<TAuth, TAuthorize>,
    ): SecuredFactory<TAuth, 'protected', TReq & ExtractAuthorizeReq<TAuthorize>>;
    /** @inheritdoc */
    extend<TAuthorize extends AnyReqAuthorizeConfig<TAuth> = AnyReqAuthorizeConfig<TAuth>>(
        ext: { access: 'optional' } & SecuredFactoryExtension<TAuth, TAuthorize>,
    ): SecuredFactory<TAuth, 'optional', TReq & ExtractAuthorizeReq<TAuthorize>>;
    /** @inheritdoc */
    extend<TAuthorize extends AnyReqAuthorizeConfig<TAuth> = AnyReqAuthorizeConfig<TAuth>>(
        ext?: SecuredFactoryExtension<TAuth, TAuthorize>,
    ): SecuredFactory<TAuth, TDefaultAccess, TReq & ExtractAuthorizeReq<TAuthorize>>;
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

    /**
     * Upgrades this public factory to a secured one by supplying an
     * authenticator — the "first setter" — plus optional authorize buckets.
     * The returned factory is a regular {@link SecuredFactory}: its `authenticate`
     * is now locked for its own descendants.
     *
     * Use this when a public baseline should gain a security pipeline without
     * being rebuilt from `createHandlerFactory`. Once upgraded, the pipeline
     * cannot be erased by further extensions (no descendant may widen back to
     * `public`).
     *
     * Any shape requirement expressed by `upgrade.security.authorize`'s
     * `afterValidation` authorizers becomes the baseline `TReq` of the resulting
     * secured factory — every contract passed to it must satisfy that shape.
     *
     * @param upgrade - The secured access to adopt and the authenticator that
     *   introduces `TAuth`. Optional authorize buckets may be layered on.
     * @returns A secured factory whose `TAuth` is inferred from
     *   `upgrade.security.authenticate` and whose `TReq` is inferred from any
     *   `afterValidation` authorizers.
     *
     * @example
     * const publicFactory = createHandlerFactory({ access: "public" });
     *
     * // Upgrade to a protected, JWT-authenticated factory.
     * const jwtFactory = publicFactory.extend({
     *   access: "protected",
     *   security: { authenticate: authenticateJwt },
     * });
     */
    extend<TAuth, TAuthorize extends AnyReqAuthorizeConfig<TAuth> = AnyReqAuthorizeConfig<TAuth>>(
        upgrade: { access: 'protected' } & PublicFactoryUpgrade<TAuth, TAuthorize>,
    ): SecuredFactory<TAuth, 'protected', ExtractAuthorizeReq<TAuthorize>>;
    /** @inheritdoc */
    extend<TAuth, TAuthorize extends AnyReqAuthorizeConfig<TAuth> = AnyReqAuthorizeConfig<TAuth>>(
        upgrade: { access: 'optional' } & PublicFactoryUpgrade<TAuth, TAuthorize>,
    ): SecuredFactory<TAuth, 'optional', ExtractAuthorizeReq<TAuthorize>>;
}

// =========================================================================
// SECTION 6: PUBLIC API - HANDLER FACTORIES
// =========================================================================

/**
 * Creates a preconfigured handler factory with default access/security.
 *
 * Defaults are shallow-merged with per-handler options. If defaults include
 * `authenticate`, callers do not need to provide it again.
 *
 * Merge rules:
 * - `access` is overridden by per-handler options when provided.
 * - `security.authenticate` is overridden by per-handler options when provided.
 * - `security.authorize` buckets concatenate additively: the factory's
 *   `beforeValidation`/`afterValidation` arrays run first, then the per-handler
 *   arrays for the same bucket. Re-declaring an authorizer at both layers runs it
 *   twice (no deduplication). Each bucket is independent.
 * - Public access cannot define or accept security options.
 *
 * @param defaults - Default access and security settings.
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
 *
 * @example
 * // Factory baseline authorizers concatenate with per-handler authorizers.
 * const auditedFactory = createHandlerFactory({
 *   access: "protected",
 *   security: {
 *     authenticate: async () => ({ userId: "u-1" }),
 *     authorize: { afterValidation: [auditAccess] }, // baseline: applies to every handler
 *   },
 * });
 *
 * // auditAccess (factory) runs first, then requireOwner (per-handler) — both run.
 * auditedFactory(contract, {
 *   security: { authorize: { afterValidation: [requireOwner] } },
 * }, async ({ req, auth }) => ({ data: { id: auth.userId } }));
 *
 * @example
 * // Factories extend other factories via .extend(). Baseline authenticate is
 * // transitively locked; authorize buckets concatenate; access can move between
 * // protected/optional but never widen to public.
 * const jwtFactory = createHandlerFactory({
 *   access: "protected",
 *   security: { authenticate: authenticateJwt },
 * });
 *
 * // adminFactory handlers authenticate via JWT AND pass isAdmin.
 * const adminFactory = jwtFactory.extend({
 *   security: { authorize: { afterValidation: [({ auth }) => auth.role === "admin"] } },
 * });
 */
export function createHandlerFactory<TAuth, TAuthorize extends AnyReqAuthorizeConfig<TAuth> = AnyReqAuthorizeConfig<TAuth>>(
    defaults: HandlerFactoryDefaults<TAuth, TAuthorize> & {
        access: 'protected';
    },
): SecuredFactory<TAuth, 'protected', ExtractAuthorizeReq<TAuthorize>>;

export function createHandlerFactory<TAuth, TAuthorize extends AnyReqAuthorizeConfig<TAuth> = AnyReqAuthorizeConfig<TAuth>>(
    defaults: HandlerFactoryDefaults<TAuth, TAuthorize> & {
        access: 'optional';
    },
): SecuredFactory<TAuth, 'optional', ExtractAuthorizeReq<TAuthorize>>;

export function createHandlerFactory<TAuth>(
    defaults: { access: 'public'; security?: never },
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
        };

        return createHandlerInternal<TContract, TAuth>(contract, handler, mergedOptions);
    }

    // Factory-extends-factory: merge child defaults into this factory's defaults
    // and delegate to createHandlerFactory, which re-attaches .extend (so derived
    // factories are themselves extendable — "flatten on extend"). The result is
    // indistinguishable from a root factory built with the same merged defaults.
    //
    // Transitive authenticate-lock: mergeHandlerSecurityDefaults still does
    // scalar-override on `authenticate` (only `authorize` is additive), so an
    // injected child authenticate would silently replace the parent's. The lock
    // is "first setter wins": when the parent already defines an authenticator,
    // the child's authenticate is discarded at runtime (the type-level absence of
    // the key on extension types is the hint; this strip is the enforcement).
    // When the parent has none — i.e. extending a public factory — the child's
    // authenticate is the legitimate first setter and is kept.
    createConfiguredHandler.extend = ((childOpts: any) => {
        const parentHasAuthenticate = !!defaults?.security?.authenticate;
        const childSecurity = childOpts?.security;
        const { authenticate: _stripped, ...childAuthorizeOnly } = childSecurity ?? {};
        const safeChild = {
            ...childOpts,
            security: parentHasAuthenticate ? childAuthorizeOnly : childSecurity,
        };
        const mergedDefaults = mergeHandlerSecurityDefaults(defaults, safeChild);
        return createHandlerFactory<TAuth>(mergedDefaults as any);
    }) as any;

    if ((defaults?.access ?? 'public') === 'public') {
        return createConfiguredHandler as PublicFactory;
    }

    return createConfiguredHandler as SecuredFactory<TAuth, Exclude<AccessMode, 'public'>>;
}
