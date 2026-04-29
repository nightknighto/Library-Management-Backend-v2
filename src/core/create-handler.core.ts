import type { Request, RequestHandler } from "express";
import type { Query } from "express-serve-static-core";
import type { infer as Infer, ZodType, ZodTypeAny } from "zod";
import type { Contract } from "./create-contract.core.ts";
import type { ValidatedRequest } from "../shared/middlewares/validators.middleware.ts";
import { sanitizeResponse } from "../shared/schemas/sanitize-response.ts";
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
} from "./types.core.ts";

type ContractRequestEnvelope = {
    body: unknown;
    query: unknown;
    params: unknown;
};

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
 * Request type passed to authorizers when validation runs before authorization.
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

export type {
    AccessMode,
    Authenticator,
    Authorizer,
    HandlerErrorMappers,
    HandlerOptions,
    SecurityOptions,
} from "./types.core.ts";

export { allOf, anyOf, not } from "./security.core.ts";

function createHandlerRuntime<
    TContract extends AnyContract,
    TAuthContext,
>(
    contract: TContract,
    handler:
        | AnyPublicHandlerExecutor<TContract>
        | AnyOptionalHandlerExecutor<TContract, TAuthContext>
        | AnyProtectedHandlerExecutor<TContract, TAuthContext>,
    options?: HandlerOptionsByAuthorizationMode<AccessMode, TAuthContext, TContract>,
): RequestHandler {
    return async (req, res) => {
        try {
            const access: AccessMode = options?.access ?? "public";
            const security = options?.security;

            let authenticationResult: { auth?: TAuthContext } = {};

            if (access !== "public") {
                authenticationResult = await executeAuthenticationStage({
                    req,
                    access,
                    security: security
                        ? {
                            authenticate: security.authenticate,
                            authSchema: security.authSchema,
                        }
                        : undefined,
                    errors: options?.errors,
                }) as { auth?: TAuthContext };

                if (security?.validateBeforeAuthorization !== true) {
                    await executeAuthorizationStage({
                        req,
                        access,
                        auth: authenticationResult.auth,
                        security: security
                            ? {
                                authorize: security.authorize,
                            }
                            : undefined,
                        errors: options?.errors,
                    });
                }
            }

            let validatedReq: HandlerRequest<TContract>;
            try {
                validatedReq = await validateContractRequest<TContract["request"]>(
                    contract.request,
                    req,
                );
            } catch (error) {
                // If validation fails, check if it's a ZodError and handle it accordingly
                if (isZodError(error)) {
                    handleRequestValidationError(error, res);
                    return;
                } else { throw error };
            }

            if (access !== "public" && security?.validateBeforeAuthorization === true) {
                await executeAuthorizationStage({
                    req: validatedReq as AfterAuthorizationRequest<TContract>,
                    access,
                    auth: authenticationResult.auth,
                    security: {
                        authorize: security.authorize,
                    },
                    errors: options?.errors,
                });
            }

            let result: ContractHandlerSuccessResult<TContract>;
            if (access === "protected") {
                result = await (handler as AnyProtectedHandlerExecutor<TContract, TAuthContext>)(
                    validatedReq,
                    (authenticationResult as { auth: TAuthContext }).auth,
                );
            } else if (access === "optional") {
                result = await (handler as AnyOptionalHandlerExecutor<TContract, TAuthContext>)(
                    validatedReq,
                    (authenticationResult as { auth?: TAuthContext }).auth,
                );
            } else {
                result = await (handler as AnyPublicHandlerExecutor<TContract>)(validatedReq);
            }

            const statusCode = result.statusCode ?? 200;
            const successPayload = buildSuccessResponsePayload({
                data: result.data,
                timestamp: new Date().toISOString(),
                pagination: result.pagination
                    ? buildPaginationMeta(result.pagination)
                    : undefined,
            });

            let output: ContractResponse<unknown, boolean>
            try {
                output = sanitizeResponse(contract.response, successPayload);
            } catch (error) {
                // If response validation fails, check if it's a ZodError and handle it accordingly
                if (isZodError(error)) {
                    handleResponseValidationError(error, res);
                    return;
                } else { throw error }
            }

            res.status(statusCode).json(output);
        } catch (error) {
            handleError(error, res);
        }
    };
}

/**
 * Creates an Express handler from a contract and an async implementation.
 *
 * The handler validates request payloads, runs authentication/authorization
 * stages, and validates/sanitizes the response against the contract schema.
 *
 * Access modes:
 * - public: no auth context
 * - optional: auth context is optional in the handler
 * - protected: auth context is required in the handler
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
 *     authenticate: async () => ({ userId: "u-1" }),
 *     validateBeforeAuthorization: true,
 *     authorize: async ({ req, auth }) => auth.userId === req.params.id,
 *   },
 * }, async (req, auth) => ({ data: { updated: true } }));
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
        | AnyPublicHandlerExecutor<TContract>
        | AnyOptionalHandlerExecutor<TContract, TAuthContext>
        | AnyProtectedHandlerExecutor<TContract, TAuthContext>
        | HandlerOptionsByAuthorizationMode<AccessMode, TAuthContext, TContract>,
    arg3?:
        | AnyPublicHandlerExecutor<TContract>
        | AnyOptionalHandlerExecutor<TContract, TAuthContext>
        | AnyProtectedHandlerExecutor<TContract, TAuthContext>
        | HandlerOptionsByAuthorizationMode<AccessMode, TAuthContext, TContract>,
): RequestHandler {
    if (typeof arg2 === "function") {
        return createHandlerRuntime(
            contract,
            arg2,
            arg3 as HandlerOptionsByAuthorizationMode<AccessMode, TAuthContext, TContract> | undefined,
        );
    }

    if (typeof arg3 !== "function") {
        throw new Error("createHandler requires a handler function as the last argument.");
    }

    return createHandlerRuntime(contract, arg3, arg2);
}

function createHandlerInternal<
    TContract extends AnyContract,
    TAuthContext,
>(
    contract: TContract,
    handler:
        | AnyPublicHandlerExecutor<TContract>
        | AnyOptionalHandlerExecutor<TContract, TAuthContext>
        | AnyProtectedHandlerExecutor<TContract, TAuthContext>,
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

/**
 * Creates a preconfigured handler factory with default access/security/errors.
 *
 * Defaults are merged with per-handler options. If defaults include
 * validateBeforeAuthorization: true, callers must explicitly set
 * validateBeforeAuthorization: false to authorize before validation.
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
            | AnyPublicHandlerExecutor<TContract>
            | AnyOptionalHandlerExecutor<TContract, TAuthContext>
            | AnyProtectedHandlerExecutor<TContract, TAuthContext>
            | HandlerOptions<AccessMode, TAuthContext, Request>,
        arg3?:
            | AnyPublicHandlerExecutor<TContract>
            | AnyOptionalHandlerExecutor<TContract, TAuthContext>
            | AnyProtectedHandlerExecutor<TContract, TAuthContext>
            | HandlerOptions<AccessMode, TAuthContext, Request>,
    ): RequestHandler {
        let options: HandlerOptions<AccessMode, TAuthContext, Request> | undefined;
        let handler:
            | AnyPublicHandlerExecutor<TContract>
            | AnyOptionalHandlerExecutor<TContract, TAuthContext>
            | AnyProtectedHandlerExecutor<TContract, TAuthContext>;

        if (typeof arg2 === "function") {
            handler = arg2;
            options = arg3 as HandlerOptions<AccessMode, TAuthContext, Request> | undefined;
        } else {
            options = arg2;

            if (typeof arg3 !== "function") {
                throw new Error("Configured handlers require a handler function as the last argument.");
            }

            handler = arg3;
        }

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
