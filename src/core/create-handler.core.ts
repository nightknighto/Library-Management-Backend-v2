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

import type { Request, RequestHandler, Response } from "express";
import type { Query } from "express-serve-static-core";
import type { infer as Infer, ZodType, ZodTypeAny } from "zod";
import type { Contract } from "./create-contract.core.ts";
import { sanitizeResponse } from "./sanitize-response.core.ts";
import { validateContractRequest } from "./validate-contract-request.core.ts";
import { handleError, handleRequestValidationError, handleResponseValidationError, isZodError } from "./error-handler.core.ts";
import { buildPaginationMeta, buildSuccessResponsePayload } from "./response-builder.core.ts";
import {
    executeAuthenticationStage,
    executeAuthorizationStage,
    mergeHandlerSecurityDefaults,
} from "./security.core.ts";
import type {
    AccessMode,
    Authenticator,
    Authorizer,
    ContractResponse,
    HandlerErrorMappers,
    HandlerOptions,
    HandlerSuccessResult,
    SecurityOptions,
    ValidatedRequest,
} from "./types.core.ts";

// =========================================================================
// SECTION 1: CONTRACT AND REQUEST TYPING
// =========================================================================

type ContractRequestEnvelope = {
    body: unknown;
    query: unknown;
    params: unknown;
};

// The core handler pipeline accepts any contract that matches the request envelope.
type AnyContract = Contract<ZodType<ContractRequestEnvelope>, ZodTypeAny, boolean>;

type ContractRequestPayload<TContract extends AnyContract> = Infer<TContract["request"]>;

type ContractHandlerSuccessResult<TContract extends AnyContract> =
    TContract extends Contract<
        ZodTypeAny,
        infer TResponseDataSchema extends ZodTypeAny,
        infer TPaginated extends boolean
    >
    ? HandlerSuccessResult<TResponseDataSchema, TPaginated>
    : never;

// Enforces that handler results do not include extra top-level keys beyond the contract.
// This keeps response envelopes predictable and prevents accidental payload leakage.
type NoExtraTopLevelKeys<
    TExpected,
    TActual extends TExpected,
> = TActual & Record<Exclude<keyof TActual, keyof TExpected>, never>;

/**
 * Validated request shape for a contract handler.
 *
 * Uses the contract request schema to type body/query/params after validation.
 *
 * @example
 * createHandler(contract, async (req) => {
 *   req.body;
 *   return { data: { ... } };
 * });
 */
export type HandlerRequest<TContract extends AnyContract> =
    ValidatedRequest<ContractRequestPayload<TContract>>;

type AuthorizerBaseRequest = Request<Record<string, string>, any, unknown, Query>;

/**
 * Request type passed to authorizers when authorization runs after validation.
 *
 * Combines the validated request payload with an Express Request base.
 *
 * @example
 * createHandler(contract, {
 *   access: "protected",
 *   security: {
 *     validateBeforeAuthorization: true,
 *     authorize: async ({ req }) => req.body.title.length > 0,
 *   },
 * }, handler);
 */
export type AfterAuthorizationRequest<TContract extends AnyContract> =
    AuthorizerBaseRequest & HandlerRequest<TContract>;

type ExactHandler<TArgs extends unknown[], TExpected, TResult extends TExpected> = ((
    ...args: TArgs
) => Promise<TResult>) & ((
    ...args: TArgs
) => Promise<NoExtraTopLevelKeys<TExpected, TResult>>);

type PublicHandlerExecutor<
    TContract extends AnyContract,
    TResult extends ContractHandlerSuccessResult<TContract>,
> = ExactHandler<
    [HandlerRequest<TContract>],
    ContractHandlerSuccessResult<TContract>,
    TResult
>;

type ProtectedHandlerExecutor<
    TContract extends AnyContract,
    TAuthContext,
    TResult extends ContractHandlerSuccessResult<TContract>,
> = ExactHandler<
    [HandlerRequest<TContract>, TAuthContext],
    ContractHandlerSuccessResult<TContract>,
    TResult
>;

type OptionalHandlerExecutor<
    TContract extends AnyContract,
    TAuthContext,
    TResult extends ContractHandlerSuccessResult<TContract>,
> = ExactHandler<
    [HandlerRequest<TContract>, TAuthContext?],
    ContractHandlerSuccessResult<TContract>,
    TResult
>;

type AnyPublicHandlerExecutor<TContract extends AnyContract> = (
    req: HandlerRequest<TContract>,
) => Promise<ContractHandlerSuccessResult<TContract>>;

type AnyProtectedHandlerExecutor<TContract extends AnyContract, TAuthContext> = (
    req: HandlerRequest<TContract>,
    auth: TAuthContext,
) => Promise<ContractHandlerSuccessResult<TContract>>;

type AnyOptionalHandlerExecutor<TContract extends AnyContract, TAuthContext> = (
    req: HandlerRequest<TContract>,
    auth?: TAuthContext,
) => Promise<ContractHandlerSuccessResult<TContract>>;

type AnyHandlerExecutor<TContract extends AnyContract, TAuthContext> =
    | AnyPublicHandlerExecutor<TContract>
    | AnyOptionalHandlerExecutor<TContract, TAuthContext>
    | AnyProtectedHandlerExecutor<TContract, TAuthContext>;

// =========================================================================
// SECTION 2: HANDLER OPTIONS TYPING
// =========================================================================

type PublicNoSecurityOptions<
    TAccess extends AccessMode,
    TAuthContext,
> = Omit<HandlerOptions<TAccess, TAuthContext, Request>, "security"> & {
    security?: never;
};

type HandlerFactoryDefaults<TAuthContext> = {
    access?: AccessMode;
    security?: SecurityOptions<TAuthContext, Request>;
    errors?: HandlerErrorMappers<Request>;
};

// Forces validateBeforeAuthorization to be optional/required based on defaults.
type ValidateFlag<TValue extends boolean, TOptional extends boolean> =
    TOptional extends true
    ? { validateBeforeAuthorization?: TValue }
    : { validateBeforeAuthorization: TValue };

type SecurityBefore<
    TAuthContext,
    TOptionalFalse extends boolean,
> = Omit<SecurityOptions<TAuthContext, Request>, "validateBeforeAuthorization">
    & ValidateFlag<false, TOptionalFalse>;

type SecurityAfter<
    TAuthContext,
    TContract extends AnyContract,
    TOptionalTrue extends boolean,
> = Omit<
    SecurityOptions<TAuthContext, Request>,
    "authorize" | "validateBeforeAuthorization"
> & {
    authorize?:
    | Authorizer<TAuthContext, AfterAuthorizationRequest<TContract>>
    | Array<Authorizer<TAuthContext, AfterAuthorizationRequest<TContract>>>;
} & ValidateFlag<true, TOptionalTrue>;

// Derived flags for whether validateBeforeAuthorization is optional.

type OptionalFalse<TDefaultValidate extends boolean> =
    TDefaultValidate extends true ? false : true;

type OptionalTrue<TDefaultValidate extends boolean> =
    TDefaultValidate extends true ? true : false;

type SecurityForMode<
    TAuthContext,
    TContract extends AnyContract,
    TMode extends "before" | "after",
    TDefaultValidate extends boolean,
> = TMode extends "after"
    ? SecurityAfter<TAuthContext, TContract, OptionalTrue<TDefaultValidate>>
    : SecurityBefore<TAuthContext, OptionalFalse<TDefaultValidate>>;

// Determine if authenticate is required for an access mode given factory defaults.
type RequiresAuthenticate<
    TAccess extends AccessMode,
    TDefaultHasAuthenticate extends boolean,
> = TAccess extends "public"
    ? false
    : [TDefaultHasAuthenticate] extends [true]
    ? false
    : true;

type OptionalSecurity<TRequireAuth extends boolean> =
    TRequireAuth extends true ? false : true;

type RequireAuthenticate<
    TAuthContext,
    TSecurity,
    TRequired extends boolean,
> = TRequired extends true
    ? Omit<TSecurity, "authenticate"> & {
        authenticate: Authenticator<TAuthContext, Request>;
    }
    : TSecurity;

// Shape the security field presence based on access mode and defaults.

type SecurityField<
    TAccess extends AccessMode,
    TSecurity,
    TOptional extends boolean,
> = TAccess extends "public"
    ? { security?: never }
    : TOptional extends true
    ? { security?: TSecurity }
    : { security: TSecurity };

type BaseHandlerOptions<
    TAccess extends AccessMode,
    TAuthContext,
> = Omit<HandlerOptions<TAccess, TAuthContext, Request>, "security">;

type HandlerOptionsForMode<
    TAccess extends AccessMode,
    TAuthContext,
    TContract extends AnyContract,
    TMode extends "before" | "after",
    TDefaultValidate extends boolean,
    TDefaultHasAuthenticate extends boolean,
> = TAccess extends "public"
    ? PublicNoSecurityOptions<TAccess, TAuthContext>
    : BaseHandlerOptions<TAccess, TAuthContext> & SecurityField<
        TAccess,
        RequireAuthenticate<
            TAuthContext,
            SecurityForMode<TAuthContext, TContract, TMode, TDefaultValidate>,
            RequiresAuthenticate<TAccess, TDefaultHasAuthenticate>
        >,
        OptionalSecurity<RequiresAuthenticate<TAccess, TDefaultHasAuthenticate>>
    >;

type HandlerOptionsByAuthorizationMode<
    TAccess extends AccessMode,
    TAuthContext,
    TContract extends AnyContract,
> =
    | HandlerOptionsForMode<TAccess, TAuthContext, TContract, "before", false, false>
    | HandlerOptionsForMode<TAccess, TAuthContext, TContract, "after", false, false>;

type WithRequiredAccess<
    TOptions,
    TAccess extends AccessMode,
    TDefaultAccess extends AccessMode,
> = TOptions extends unknown
    ? [TAccess] extends ["public"]
    ? [TDefaultAccess] extends ["public"]
    ? Omit<TOptions, "access"> & { access: TAccess }
    : Omit<TOptions, "access"> & { access: never }
    : Omit<TOptions, "access"> & { access: TAccess }
    : never;

type RequireOptionsForBefore<
    TDefaultAccess extends AccessMode,
    TDefaultValidateBeforeAuthorization extends boolean,
    TDefaultHasAuthenticate extends boolean,
    TAccess extends AccessMode,
> = [TDefaultAccess] extends [TAccess]
    ? [TDefaultValidateBeforeAuthorization] extends [true]
    ? true
    : RequiresAuthenticate<TAccess, TDefaultHasAuthenticate> extends true
    ? true
    : false
    : true;

type RequireOptionsForAfter<
    TDefaultAccess extends AccessMode,
    TDefaultHasAuthenticate extends boolean,
    TAccess extends AccessMode,
> = [TDefaultAccess] extends [TAccess]
    ? RequiresAuthenticate<TAccess, TDefaultHasAuthenticate> extends true
    ? true
    : false
    : true;

type OptionsArg<
    TOptions,
    TRequired extends boolean,
> = TRequired extends true
    ? [options: TOptions]
    : [options?: TOptions];

type HandlerFactoryBeforeOptionsArg<
    TDefaultAccess extends AccessMode,
    TDefaultValidateBeforeAuthorization extends boolean,
    TDefaultHasAuthenticate extends boolean,
    TAccess extends AccessMode,
    TAuthContext,
    TContract extends AnyContract,
> = OptionsArg<
    [TDefaultAccess] extends [TAccess]
    ? HandlerOptionsForMode<
        TAccess,
        TAuthContext,
        TContract,
        "before",
        TDefaultValidateBeforeAuthorization,
        TDefaultHasAuthenticate
    >
    : WithRequiredAccess<
        HandlerOptionsForMode<
            TAccess,
            TAuthContext,
            TContract,
            "before",
            TDefaultValidateBeforeAuthorization,
            TDefaultHasAuthenticate
        >,
        TAccess,
        TDefaultAccess
    >,
    RequireOptionsForBefore<
        TDefaultAccess,
        TDefaultValidateBeforeAuthorization,
        TDefaultHasAuthenticate,
        TAccess
    >
>;

type HandlerFactoryAfterOptionsArg<
    TDefaultAccess extends AccessMode,
    TDefaultValidateBeforeAuthorization extends boolean,
    TDefaultHasAuthenticate extends boolean,
    TAccess extends AccessMode,
    TAuthContext,
    TContract extends AnyContract,
> = OptionsArg<
    [TDefaultAccess] extends [TAccess]
    ? HandlerOptionsForMode<
        TAccess,
        TAuthContext,
        TContract,
        "after",
        TDefaultValidateBeforeAuthorization,
        TDefaultHasAuthenticate
    >
    : WithRequiredAccess<
        HandlerOptionsForMode<
            TAccess,
            TAuthContext,
            TContract,
            "after",
            TDefaultValidateBeforeAuthorization,
            TDefaultHasAuthenticate
        >,
        TAccess,
        TDefaultAccess
    >,
    RequireOptionsForAfter<
        TDefaultAccess,
        TDefaultHasAuthenticate,
        TAccess
    >
>;

// =========================================================================
// SECTION 3: HANDLER FACTORY TYPE SIGNATURES
// =========================================================================

type HandlerFactoryArgsWithHandlerLast<
    TArgs extends unknown[],
    THandler,
> = [] extends TArgs
    ? [handler: THandler] | [options: TArgs[0], handler: THandler]
    : [options: TArgs[0], handler: THandler];

type ConfiguredHandlerFactory<
    TAuthContext,
    TDefaultAccess extends AccessMode,
    TDefaultValidateBeforeAuthorization extends boolean,
    TDefaultHasAuthenticate extends boolean,
> = {
    <
        TContract extends AnyContract,
        TResult extends ContractHandlerSuccessResult<TContract>,
    >(
        contract: TContract,
        ...args: HandlerFactoryArgsWithHandlerLast<
            HandlerFactoryBeforeOptionsArg<
                TDefaultAccess,
                TDefaultValidateBeforeAuthorization,
                TDefaultHasAuthenticate,
                "public",
                TAuthContext,
                TContract
            >,
            PublicHandlerExecutor<TContract, TResult>
        >
    ): RequestHandler;
    <
        TContract extends AnyContract,
        TResult extends ContractHandlerSuccessResult<TContract>,
    >(
        contract: TContract,
        ...args: HandlerFactoryArgsWithHandlerLast<
            HandlerFactoryAfterOptionsArg<
                TDefaultAccess,
                TDefaultValidateBeforeAuthorization,
                TDefaultHasAuthenticate,
                "public",
                TAuthContext,
                TContract
            >,
            PublicHandlerExecutor<TContract, TResult>
        >
    ): RequestHandler;
    <
        TContract extends AnyContract,
        TResult extends ContractHandlerSuccessResult<TContract>,
    >(
        contract: TContract,
        ...args: HandlerFactoryArgsWithHandlerLast<
            HandlerFactoryBeforeOptionsArg<
                TDefaultAccess,
                TDefaultValidateBeforeAuthorization,
                TDefaultHasAuthenticate,
                "optional",
                TAuthContext,
                TContract
            >,
            OptionalHandlerExecutor<TContract, TAuthContext, TResult>
        >
    ): RequestHandler;
    <
        TContract extends AnyContract,
        TResult extends ContractHandlerSuccessResult<TContract>,
    >(
        contract: TContract,
        ...args: HandlerFactoryArgsWithHandlerLast<
            HandlerFactoryAfterOptionsArg<
                TDefaultAccess,
                TDefaultValidateBeforeAuthorization,
                TDefaultHasAuthenticate,
                "optional",
                TAuthContext,
                TContract
            >,
            OptionalHandlerExecutor<TContract, TAuthContext, TResult>
        >
    ): RequestHandler;
    <
        TContract extends AnyContract,
        TResult extends ContractHandlerSuccessResult<TContract>,
    >(
        contract: TContract,
        ...args: HandlerFactoryArgsWithHandlerLast<
            HandlerFactoryBeforeOptionsArg<
                TDefaultAccess,
                TDefaultValidateBeforeAuthorization,
                TDefaultHasAuthenticate,
                "protected",
                TAuthContext,
                TContract
            >,
            ProtectedHandlerExecutor<TContract, TAuthContext, TResult>
        >
    ): RequestHandler;
    <
        TContract extends AnyContract,
        TResult extends ContractHandlerSuccessResult<TContract>,
    >(
        contract: TContract,
        ...args: HandlerFactoryArgsWithHandlerLast<
            HandlerFactoryAfterOptionsArg<
                TDefaultAccess,
                TDefaultValidateBeforeAuthorization,
                TDefaultHasAuthenticate,
                "protected",
                TAuthContext,
                TContract
            >,
            ProtectedHandlerExecutor<TContract, TAuthContext, TResult>
        >
    ): RequestHandler;
};

// =========================================================================
// SECTION 4: RUNTIME HELPERS
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
    if (typeof arg2 === "function") {
        return {
            handler: arg2 as THandler,
            options: arg3 as TOptions | undefined,
        };
    }

    if (typeof arg3 !== "function") {
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
        return await validateContractRequest<TContract["request"]>(
            contract.request,
            req,
        );
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
 * Executes the handler with the correct access-mode signature.
 */
async function executeHandlerByAccess<TContract extends AnyContract, TAuthContext>(
    access: AccessMode,
    handler: AnyHandlerExecutor<TContract, TAuthContext>,
    req: HandlerRequest<TContract>,
    auth: TAuthContext | undefined,
): Promise<ContractHandlerSuccessResult<TContract>> {
    if (access === "protected") {
        return (handler as AnyProtectedHandlerExecutor<TContract, TAuthContext>)(
            req,
            auth as TAuthContext,
        );
    }

    if (access === "optional") {
        return (handler as AnyOptionalHandlerExecutor<TContract, TAuthContext>)(
            req,
            auth,
        );
    }

    return (handler as AnyPublicHandlerExecutor<TContract>)(req);
}

/**
 * Internal runtime pipeline for createHandler and createHandlerFactory.
 */
function createHandlerRuntime<
    TContract extends AnyContract,
    TAuthContext,
>(
    contract: TContract,
    handler: AnyHandlerExecutor<TContract, TAuthContext>,
    options?: HandlerOptionsByAuthorizationMode<AccessMode, TAuthContext, TContract>,
): RequestHandler {
    return async (req, res) => {
        try {
            const access = options?.access ?? "public";
            const security = options?.security;
            const errors = options?.errors;

            const authenticationResult = access === "public"
                ? ({ auth: undefined } as { auth?: TAuthContext })
                : await executeAuthenticationStage({
                    req,
                    access,
                    security: security
                        ? {
                            authenticate: security.authenticate,
                            authSchema: security.authSchema,
                        }
                        : undefined,
                    errors,
                }) as { auth?: TAuthContext };

            if (access !== "public" && security?.validateBeforeAuthorization !== true) {
                await executeAuthorizationStage({
                    req,
                    access,
                    auth: authenticationResult.auth,
                    security: security
                        ? {
                            authorize: security.authorize,
                        }
                        : undefined,
                    errors,
                });
            }

            const validatedReq = await validateRequestOrRespond(contract, req, res);
            if (!validatedReq) {
                return;
            }

            if (access !== "public" && security?.validateBeforeAuthorization === true) {
                await executeAuthorizationStage({
                    req: validatedReq as AfterAuthorizationRequest<TContract>,
                    access,
                    auth: authenticationResult.auth,
                    security: {
                        authorize: security.authorize,
                    },
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
                pagination: result.pagination
                    ? buildPaginationMeta(result.pagination)
                    : undefined,
            });

            const output = sanitizeResponseOrRespond(contract, successPayload, res);
            if (!output) {
                return;
            }

            if (result.cookies?.length) {
                for (const operation of result.cookies) {
                    if (operation.action === "set") {
                        const options = operation.options ?? {};
                        res.cookie(operation.name, operation.value, options);
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
// SECTION 5: PUBLIC API - CREATE HANDLER
// =========================================================================

/**
 * Creates an Express handler from a contract and an async implementation.
 *
 * The generated handler enforces the contract end-to-end: it validates incoming
 * requests, orchestrates authentication/authorization, and validates the
 * outgoing response against the contract schema.
 *
 * Access modes:
 * - `public`: no auth context, no security options allowed
 * - `optional`: auth context is optional in the handler
 * - `protected`: auth context is required in the handler
 *
 * Authorization timing:
 * - `validateBeforeAuthorization: false` (default) runs authorization before
 *   request validation, so `authorize` receives a plain Express Request.
 * - `validateBeforeAuthorization: true` runs authorization after validation,
 *   so `authorize` receives typed body/query/params.
 *
 * Auth inference note:
 * When providing `security.authenticate` with a parameter, explicitly annotate
 * it as `Request` to avoid auth context degrading to `unknown`.
 * See docs/rules/create-handler-auth-inference-limitations.md.
 *
 * @param contract - Contract describing request and response schemas.
 * @param options - Optional access/security/errors configuration.
 * @param handler - Async handler returning a contract-aligned result.
 *
 * @example
 * createHandler(getBookContract, async (req) => ({ data: { book: req.params.isbn } }));
 *
 * @example
 * createHandler(updateBookContract, {
 *   access: "protected",
 *   security: {
 *     authenticate: async (_req: Request) => ({ userId: "u-1" }),
 *     validateBeforeAuthorization: true,
 *     authorize: async ({ req, auth }) => auth.userId === req.params.id,
 *   },
 * }, async (req, auth) => ({ data: { updated: true } }));
 *
 * @example
 * createHandler(loginContract, async (req) => ({
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
 */
export function createHandler<
    TContract extends AnyContract,
    TResult extends ContractHandlerSuccessResult<TContract>,
>(
    contract: TContract,
    handler: PublicHandlerExecutor<TContract, TResult>,
): RequestHandler;
export function createHandler<
    TContract extends AnyContract,
    TResult extends ContractHandlerSuccessResult<TContract>,
>(
    contract: TContract,
    options: HandlerOptionsForMode<"public", never, TContract, "before", false, false>,
    handler: PublicHandlerExecutor<TContract, TResult>,
): RequestHandler;
export function createHandler<
    TContract extends AnyContract,
    TResult extends ContractHandlerSuccessResult<TContract>,
>(
    contract: TContract,
    options: HandlerOptionsForMode<"public", never, TContract, "after", false, false>,
    handler: PublicHandlerExecutor<TContract, TResult>,
): RequestHandler;
export function createHandler<
    TContract extends AnyContract,
    TAuthContext,
    TResult extends ContractHandlerSuccessResult<TContract>,
>(
    contract: TContract,
    options: Omit<HandlerOptionsForMode<"optional", TAuthContext, TContract, "before", false, false>, "access"> & {
        access: "optional";
    },
    handler: OptionalHandlerExecutor<TContract, TAuthContext, TResult>,
): RequestHandler;
export function createHandler<
    TContract extends AnyContract,
    TAuthContext,
    TResult extends ContractHandlerSuccessResult<TContract>,
>(
    contract: TContract,
    options: Omit<HandlerOptionsForMode<"optional", TAuthContext, TContract, "after", false, false>, "access"> & {
        access: "optional";
    },
    handler: OptionalHandlerExecutor<TContract, TAuthContext, TResult>,
): RequestHandler;
export function createHandler<
    TContract extends AnyContract,
    TAuthContext,
    TResult extends ContractHandlerSuccessResult<TContract>,
>(
    contract: TContract,
    options: Omit<HandlerOptionsForMode<"protected", TAuthContext, TContract, "before", false, false>, "access"> & {
        access: "protected";
    },
    handler: ProtectedHandlerExecutor<TContract, TAuthContext, TResult>,
): RequestHandler;
export function createHandler<
    TContract extends AnyContract,
    TAuthContext,
    TResult extends ContractHandlerSuccessResult<TContract>,
>(
    contract: TContract,
    options: Omit<HandlerOptionsForMode<"protected", TAuthContext, TContract, "after", false, false>, "access"> & {
        access: "protected";
    },
    handler: ProtectedHandlerExecutor<TContract, TAuthContext, TResult>,
): RequestHandler;
export function createHandler<
    TContract extends AnyContract,
    TAuthContext,
>(
    contract: TContract,
    arg2:
        | AnyHandlerExecutor<TContract, TAuthContext>
        | HandlerOptionsByAuthorizationMode<AccessMode, TAuthContext, TContract>,
    arg3?:
        | AnyHandlerExecutor<TContract, TAuthContext>
        | HandlerOptionsByAuthorizationMode<AccessMode, TAuthContext, TContract>,
): RequestHandler {
    const { handler, options } = resolveHandlerArgs<
        HandlerOptionsByAuthorizationMode<AccessMode, TAuthContext, TContract>,
        AnyHandlerExecutor<TContract, TAuthContext>
    >(
        arg2,
        arg3,
        "createHandler requires a handler function as the last argument.",
    );

    return createHandlerRuntime(contract, handler, options);
}

/**
 * Thin wrapper used by handler factories after defaults are merged.
 */
function createHandlerInternal<
    TContract extends AnyContract,
    TAuthContext,
>(
    contract: TContract,
    handler: AnyHandlerExecutor<TContract, TAuthContext>,
    options?: HandlerOptions<AccessMode, TAuthContext, Request>,
): RequestHandler {
    return createHandlerRuntime<TContract, TAuthContext>(
        contract,
        handler,
        options as HandlerOptionsByAuthorizationMode<AccessMode, TAuthContext, TContract>,
    );
}

type FactorySecurityWithRequiredAuthenticate<TAuthContext> =
    SecurityOptions<TAuthContext, Request> & {
        authenticate: Authenticator<TAuthContext, Request>;
    };

type PublicFactoryDefaults<TAuthContext> =
    Omit<HandlerFactoryDefaults<TAuthContext>, "access" | "security"> & {
        access?: "public";
        security?: never;
    };

type AccessOnlyFactoryDefaults<TAuthContext> =
    Omit<HandlerFactoryDefaults<TAuthContext>, "security"> & {
        access: AccessMode;
        security?: never;
    };

// =========================================================================
// SECTION 6: PUBLIC API - HANDLER FACTORIES
// =========================================================================

/**
 * Creates a preconfigured handler factory with default access/security/errors.
 *
 * Defaults are shallow-merged with per-handler options. If defaults include
 * `validateBeforeAuthorization: true`, callers must explicitly set
 * `validateBeforeAuthorization: false` to authorize before validation.
 *
 * Access restriction:
 * - Factories with `access: "public"` cannot specify `security` defaults.
 * - Per-handler options must follow the same rule when access is `public`.
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
 * protectedFactory(contract, async (req, auth) => ({ data: { id: auth.userId } }));
 *
 * @example
 * const optionalFactory = createHandlerFactory({
 *   access: "optional",
 *   security: { authenticate: async (_req: Request) => ({ userId: "u-2" }) },
 * });
 *
 * optionalFactory(contract, async (_req, auth) => ({ data: { userId: auth?.userId } }));
 */
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & {
        access: "optional";
        security: FactorySecurityWithRequiredAuthenticate<TAuthContext> & {
            validateBeforeAuthorization: true;
        };
    },
): ConfiguredHandlerFactory<TAuthContext, "optional", true, true>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & {
        access: "optional";
        security: SecurityOptions<TAuthContext, Request> & {
            validateBeforeAuthorization: true;
        };
    },
): ConfiguredHandlerFactory<TAuthContext, "optional", true, false>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & {
        access: "protected";
        security: FactorySecurityWithRequiredAuthenticate<TAuthContext> & {
            validateBeforeAuthorization: true;
        };
    },
): ConfiguredHandlerFactory<TAuthContext, "protected", true, true>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & {
        access: "protected";
        security: SecurityOptions<TAuthContext, Request> & {
            validateBeforeAuthorization: true;
        };
    },
): ConfiguredHandlerFactory<TAuthContext, "protected", true, false>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & {
        access: "optional";
        security: FactorySecurityWithRequiredAuthenticate<TAuthContext>;
    },
): ConfiguredHandlerFactory<TAuthContext, "optional", false, true>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & { access: "optional" },
): ConfiguredHandlerFactory<TAuthContext, "optional", false, false>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & {
        access: "protected";
        security: FactorySecurityWithRequiredAuthenticate<TAuthContext>;
    },
): ConfiguredHandlerFactory<TAuthContext, "protected", false, true>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & { access: "protected" },
): ConfiguredHandlerFactory<TAuthContext, "protected", false, false>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: PublicFactoryDefaults<TAuthContext> & { access: "public" },
): ConfiguredHandlerFactory<TAuthContext, "public", false, false>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: AccessOnlyFactoryDefaults<TAuthContext>,
): ConfiguredHandlerFactory<TAuthContext, AccessMode, false, false>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults?: HandlerFactoryDefaults<TAuthContext>,
): ConfiguredHandlerFactory<TAuthContext, AccessMode, boolean, boolean> {
    if (defaults?.security && (defaults.access ?? "public") === "public") {
        throw new Error(
            "createHandlerFactory: public access cannot define security defaults. "
            + "Use access: 'optional' or 'protected' instead.",
        );
    }

    function createConfiguredHandler<TContract extends AnyContract>(
        contract: TContract,
        arg2:
            | AnyHandlerExecutor<TContract, TAuthContext>
            | HandlerOptions<AccessMode, TAuthContext, Request>,
        arg3?:
            | AnyHandlerExecutor<TContract, TAuthContext>
            | HandlerOptions<AccessMode, TAuthContext, Request>,
    ): RequestHandler {
        const { handler, options } = resolveHandlerArgs<
            HandlerOptions<AccessMode, TAuthContext, Request>,
            AnyHandlerExecutor<TContract, TAuthContext>
        >(
            arg2,
            arg3,
            "Configured handlers require a handler function as the last argument.",
        );

        const merged = mergeHandlerSecurityDefaults(defaults, options);

        const mergedOptions: HandlerOptions<AccessMode, TAuthContext, Request> = {
            ...options,
            access: merged.access,
            security: merged.security,
            errors: merged.errors,
        };

        return createHandlerInternal<TContract, TAuthContext>(
            contract,
            handler,
            mergedOptions,
        );
    }

    return createConfiguredHandler as ConfiguredHandlerFactory<
        TAuthContext,
        AccessMode,
        boolean,
        boolean
    >;
}
