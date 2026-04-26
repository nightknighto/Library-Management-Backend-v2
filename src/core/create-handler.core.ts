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

export type HandlerRequest<TContract extends AnyContract> =
    ValidatedRequest<ContractRequestPayload<TContract>>;

type AuthorizerBaseRequest = Request<Record<string, string>, any, unknown, Query>;

export type AfterAuthorizationRequest<TContract extends AnyContract> =
    AuthorizerBaseRequest & HandlerRequest<TContract>;

type PublicHandlerExecutor<
    TContract extends AnyContract,
    TResult extends ContractHandlerSuccessResult<TContract>,
> = ((
    req: HandlerRequest<TContract>,
) => Promise<TResult>)
    & ((
        req: HandlerRequest<TContract>,
    ) => Promise<NoExtraTopLevelKeys<ContractHandlerSuccessResult<TContract>, TResult>>);

type ProtectedHandlerExecutor<
    TContract extends AnyContract,
    TAuthContext,
    TResult extends ContractHandlerSuccessResult<TContract>,
> = ((
    req: HandlerRequest<TContract>,
    auth: TAuthContext,
) => Promise<TResult>)
    & ((
        req: HandlerRequest<TContract>,
        auth: TAuthContext,
    ) => Promise<NoExtraTopLevelKeys<ContractHandlerSuccessResult<TContract>, TResult>>);

type OptionalHandlerExecutor<
    TContract extends AnyContract,
    TAuthContext,
    TResult extends ContractHandlerSuccessResult<TContract>,
> = ((
    req: HandlerRequest<TContract>,
    auth?: TAuthContext,
) => Promise<TResult>)
    & ((
        req: HandlerRequest<TContract>,
        auth?: TAuthContext,
    ) => Promise<NoExtraTopLevelKeys<ContractHandlerSuccessResult<TContract>, TResult>>);

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

type RequiredAuthenticateAccessMode = "protected" | "optional";

type HandlerFactoryDefaults<TAuthContext> = {
    access?: AccessMode;
    security?: SecurityOptions<TAuthContext, Request>;
    errors?: HandlerErrorMappers<Request>;
};

type BeforeSecurityOptions<TAuthContext> =
    Omit<SecurityOptions<TAuthContext, Request>, "validateBeforeAuthorization"> & {
        validateBeforeAuthorization?: false | undefined;
    };

type BeforeSecurityOptionsWithRequiredAuthenticate<TAuthContext> =
    Omit<BeforeSecurityOptions<TAuthContext>, "authenticate"> & {
        authenticate: Authenticator<TAuthContext, Request>;
    };

type AfterSecurityOptions<
    TAuthContext,
    TContract extends AnyContract,
> = Omit<
    SecurityOptions<TAuthContext, Request>,
    "authorize" | "validateBeforeAuthorization"
> & {
    validateBeforeAuthorization: true;
    authorize?:
    | Authorizer<TAuthContext, AfterAuthorizationRequest<TContract>>
    | Array<Authorizer<TAuthContext, AfterAuthorizationRequest<TContract>>>;
};

type AfterSecurityOptionsWithRequiredAuthenticate<
    TAuthContext,
    TContract extends AnyContract,
> = Omit<AfterSecurityOptions<TAuthContext, TContract>, "authenticate"> & {
    authenticate: Authenticator<TAuthContext, Request>;
};

type BeforeHandlerOptions<
    TAccess extends AccessMode,
    TAuthContext,
> = Omit<HandlerOptions<TAccess, TAuthContext, Request>, "security"> & {
    security: TAccess extends RequiredAuthenticateAccessMode
    ? BeforeSecurityOptionsWithRequiredAuthenticate<TAuthContext>
    : BeforeSecurityOptions<TAuthContext> | undefined;
};

type AfterHandlerOptionsBase<
    TAccess extends AccessMode,
    TAuthContext,
    TContract extends AnyContract,
> = Omit<HandlerOptions<TAccess, TAuthContext, Request>, "security"> & {
    security: AfterSecurityOptions<TAuthContext, TContract>;
};

type AfterHandlerOptionsWithRequiredAuthenticate<
    TAccess extends RequiredAuthenticateAccessMode,
    TAuthContext,
    TContract extends AnyContract,
> = Omit<HandlerOptions<TAccess, TAuthContext, Request>, "security"> & {
    security: AfterSecurityOptionsWithRequiredAuthenticate<TAuthContext, TContract>;
};

type AfterHandlerOptions<
    TAccess extends AccessMode,
    TAuthContext,
    TContract extends AnyContract,
> = TAccess extends RequiredAuthenticateAccessMode
    ? AfterHandlerOptionsWithRequiredAuthenticate<TAccess, TAuthContext, TContract>
    : AfterHandlerOptionsBase<TAccess, TAuthContext, TContract>;

type FactoryBeforeSecurityOptions<TAuthContext> =
    Omit<
        SecurityOptions<TAuthContext, Request>,
        "validateBeforeAuthorization"
    > & {
        validateBeforeAuthorization?: false | undefined;
    };

type FactoryBeforeSecurityOptionsWithRequiredAuthenticate<TAuthContext> =
    Omit<FactoryBeforeSecurityOptions<TAuthContext>, "authenticate"> & {
        authenticate: Authenticator<TAuthContext, Request>;
    };

type FactoryBeforeHandlerOptions<
    TAccess extends AccessMode,
    TAuthContext,
> = Omit<
    HandlerOptions<TAccess, TAuthContext, Request>,
    "security"
> & {
    security?: FactoryBeforeSecurityOptions<TAuthContext>;
};

type FactoryBeforeHandlerOptionsWithRequiredAuthenticate<
    TAccess extends RequiredAuthenticateAccessMode,
    TAuthContext,
> = Omit<
    HandlerOptions<TAccess, TAuthContext, Request>,
    "security"
> & {
    security: FactoryBeforeSecurityOptionsWithRequiredAuthenticate<TAuthContext>;
};

type FactoryBeforeSecurityOptionsWithExplicitFalse<TAuthContext> =
    Omit<FactoryBeforeSecurityOptions<TAuthContext>, "validateBeforeAuthorization"> & {
        validateBeforeAuthorization: false;
    };

type FactoryBeforeSecurityOptionsWithExplicitFalseAndRequiredAuthenticate<TAuthContext> =
    Omit<FactoryBeforeSecurityOptionsWithExplicitFalse<TAuthContext>, "authenticate"> & {
        authenticate: Authenticator<TAuthContext, Request>;
    };

type FactoryBeforeHandlerOptionsWithExplicitFalse<
    TAccess extends AccessMode,
    TAuthContext,
> = Omit<HandlerOptions<TAccess, TAuthContext, Request>, "security"> & {
    security: FactoryBeforeSecurityOptionsWithExplicitFalse<TAuthContext>;
};
type FactoryBeforeHandlerOptionsWithExplicitFalseAndRequiredAuthenticate<
    TAccess extends RequiredAuthenticateAccessMode,
    TAuthContext,
> = Omit<HandlerOptions<TAccess, TAuthContext, Request>, "security"> & {
    security: FactoryBeforeSecurityOptionsWithExplicitFalseAndRequiredAuthenticate<TAuthContext>;
};

type FactoryAfterSecurityOptionsWithImplicitTrue<
    TAuthContext,
    TContract extends AnyContract,
> = Omit<AfterSecurityOptions<TAuthContext, TContract>, "validateBeforeAuthorization"> & {
    validateBeforeAuthorization?: true | undefined;
};

type FactoryAfterSecurityOptionsWithImplicitTrueAndRequiredAuthenticate<
    TAuthContext,
    TContract extends AnyContract,
> = Omit<FactoryAfterSecurityOptionsWithImplicitTrue<TAuthContext, TContract>, "authenticate"> & {
    authenticate: Authenticator<TAuthContext, Request>;
};

type FactoryAfterHandlerOptionsWithImplicitTrue<
    TAccess extends AccessMode,
    TAuthContext,
    TContract extends AnyContract,
> = Omit<HandlerOptions<TAccess, TAuthContext, Request>, "security"> & {
    security?: FactoryAfterSecurityOptionsWithImplicitTrue<TAuthContext, TContract>;
};

type FactoryAfterHandlerOptionsWithImplicitTrueAndRequiredAuthenticate<
    TAccess extends RequiredAuthenticateAccessMode,
    TAuthContext,
    TContract extends AnyContract,
> = Omit<HandlerOptions<TAccess, TAuthContext, Request>, "security"> & {
    security: FactoryAfterSecurityOptionsWithImplicitTrueAndRequiredAuthenticate<
        TAuthContext,
        TContract
    >;
};

type HandlerOptionsByAuthorizationMode<
    TAccess extends AccessMode,
    TAuthContext,
    TContract extends AnyContract,
> =
    | BeforeHandlerOptions<TAccess, TAuthContext>
    | AfterHandlerOptions<TAccess, TAuthContext, TContract>;

type WithRequiredAccess<
    TOptions,
    TAccess extends AccessMode,
> = TOptions extends unknown
    ? Omit<TOptions, "access"> & { access: TAccess }
    : never;

type FactoryBeforeOptionsByAuthenticateRequirement<
    TAccess extends AccessMode,
    TAuthContext,
    TDefaultHasAuthenticate extends boolean,
> = TAccess extends RequiredAuthenticateAccessMode
    ? [TDefaultHasAuthenticate] extends [true]
    ? FactoryBeforeHandlerOptions<TAccess, TAuthContext>
    : FactoryBeforeHandlerOptionsWithRequiredAuthenticate<TAccess, TAuthContext>
    : FactoryBeforeHandlerOptions<TAccess, TAuthContext>;

type FactoryBeforeOptionsWithExplicitFalseByAuthenticateRequirement<
    TAccess extends AccessMode,
    TAuthContext,
    TDefaultHasAuthenticate extends boolean,
> = TAccess extends RequiredAuthenticateAccessMode
    ? [TDefaultHasAuthenticate] extends [true]
    ? FactoryBeforeHandlerOptionsWithExplicitFalse<TAccess, TAuthContext>
    : FactoryBeforeHandlerOptionsWithExplicitFalseAndRequiredAuthenticate<TAccess, TAuthContext>
    : FactoryBeforeHandlerOptionsWithExplicitFalse<TAccess, TAuthContext>;

type FactoryAfterOptionsByAuthenticateRequirement<
    TAccess extends AccessMode,
    TAuthContext,
    TContract extends AnyContract,
    TDefaultHasAuthenticate extends boolean,
> = TAccess extends RequiredAuthenticateAccessMode
    ? [TDefaultHasAuthenticate] extends [true]
    ? AfterHandlerOptionsBase<TAccess, TAuthContext, TContract>
    : AfterHandlerOptionsWithRequiredAuthenticate<TAccess, TAuthContext, TContract>
    : AfterHandlerOptionsBase<TAccess, TAuthContext, TContract>;

type FactoryAfterOptionsWithImplicitTrueByAuthenticateRequirement<
    TAccess extends AccessMode,
    TAuthContext,
    TContract extends AnyContract,
    TDefaultHasAuthenticate extends boolean,
> = TAccess extends RequiredAuthenticateAccessMode
    ? [TDefaultHasAuthenticate] extends [true]
    ? FactoryAfterHandlerOptionsWithImplicitTrue<TAccess, TAuthContext, TContract>
    : FactoryAfterHandlerOptionsWithImplicitTrueAndRequiredAuthenticate<
        TAccess,
        TAuthContext,
        TContract
    >
    : FactoryAfterHandlerOptionsWithImplicitTrue<TAccess, TAuthContext, TContract>;

type HandlerFactoryBeforeOptionsArg<
    TDefaultAccess extends AccessMode,
    TDefaultValidateBeforeAuthorization extends boolean,
    TDefaultHasAuthenticate extends boolean,
    TAccess extends AccessMode,
    TAuthContext,
> = [TDefaultAccess] extends [TAccess]
    ? [TDefaultValidateBeforeAuthorization] extends [true]
    ? [
        options: FactoryBeforeOptionsWithExplicitFalseByAuthenticateRequirement<
            TAccess,
            TAuthContext,
            TDefaultHasAuthenticate
        >
    ]
    : TAccess extends RequiredAuthenticateAccessMode
    ? [TDefaultHasAuthenticate] extends [true]
    ? [options?: FactoryBeforeHandlerOptions<TAccess, TAuthContext>]
    : [options: FactoryBeforeHandlerOptionsWithRequiredAuthenticate<TAccess, TAuthContext>]
    : [options?: FactoryBeforeHandlerOptions<TAccess, TAuthContext>]
    : [
        options: WithRequiredAccess<
            [TDefaultValidateBeforeAuthorization] extends [true]
            ? FactoryBeforeOptionsWithExplicitFalseByAuthenticateRequirement<
                TAccess,
                TAuthContext,
                TDefaultHasAuthenticate
            >
            : FactoryBeforeOptionsByAuthenticateRequirement<
                TAccess,
                TAuthContext,
                TDefaultHasAuthenticate
            >,
            TAccess
        >
    ];

type HandlerFactoryAfterOptionsArg<
    TDefaultAccess extends AccessMode,
    TDefaultValidateBeforeAuthorization extends boolean,
    TDefaultHasAuthenticate extends boolean,
    TAccess extends AccessMode,
    TAuthContext,
    TContract extends AnyContract,
> = [TDefaultAccess] extends [TAccess]
    ? [TDefaultValidateBeforeAuthorization] extends [true]
    ? TAccess extends RequiredAuthenticateAccessMode
    ? [TDefaultHasAuthenticate] extends [true]
    ? [options?: FactoryAfterHandlerOptionsWithImplicitTrue<TAccess, TAuthContext, TContract>]
    : [
        options: FactoryAfterHandlerOptionsWithImplicitTrueAndRequiredAuthenticate<
            TAccess,
            TAuthContext,
            TContract
        >
    ]
    : [options?: FactoryAfterHandlerOptionsWithImplicitTrue<TAccess, TAuthContext, TContract>]
    : [
        options: FactoryAfterOptionsByAuthenticateRequirement<
            TAccess,
            TAuthContext,
            TContract,
            TDefaultHasAuthenticate
        >
    ]
    : [
        options: WithRequiredAccess<
            [TDefaultValidateBeforeAuthorization] extends [true]
            ? FactoryAfterOptionsWithImplicitTrueByAuthenticateRequirement<
                TAccess,
                TAuthContext,
                TContract,
                TDefaultHasAuthenticate
            >
            : FactoryAfterOptionsByAuthenticateRequirement<
                TAccess,
                TAuthContext,
                TContract,
                TDefaultHasAuthenticate
            >,
            TAccess
        >
    ];

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
        handler: PublicHandlerExecutor<TContract, TResult>,
        ...args: HandlerFactoryBeforeOptionsArg<
            TDefaultAccess,
            TDefaultValidateBeforeAuthorization,
            TDefaultHasAuthenticate,
            "public",
            TAuthContext
        >
    ): RequestHandler;
    <
        TContract extends AnyContract,
        TResult extends ContractHandlerSuccessResult<TContract>,
    >(
        contract: TContract,
        handler: PublicHandlerExecutor<TContract, TResult>,
        ...args: HandlerFactoryAfterOptionsArg<
            TDefaultAccess,
            TDefaultValidateBeforeAuthorization,
            TDefaultHasAuthenticate,
            "public",
            TAuthContext,
            TContract
        >
    ): RequestHandler;
    <
        TContract extends AnyContract,
        TResult extends ContractHandlerSuccessResult<TContract>,
    >(
        contract: TContract,
        handler: OptionalHandlerExecutor<TContract, TAuthContext, TResult>,
        ...args: HandlerFactoryBeforeOptionsArg<
            TDefaultAccess,
            TDefaultValidateBeforeAuthorization,
            TDefaultHasAuthenticate,
            "optional",
            TAuthContext
        >
    ): RequestHandler;
    <
        TContract extends AnyContract,
        TResult extends ContractHandlerSuccessResult<TContract>,
    >(
        contract: TContract,
        handler: OptionalHandlerExecutor<TContract, TAuthContext, TResult>,
        ...args: HandlerFactoryAfterOptionsArg<
            TDefaultAccess,
            TDefaultValidateBeforeAuthorization,
            TDefaultHasAuthenticate,
            "optional",
            TAuthContext,
            TContract
        >
    ): RequestHandler;
    <
        TContract extends AnyContract,
        TResult extends ContractHandlerSuccessResult<TContract>,
    >(
        contract: TContract,
        handler: ProtectedHandlerExecutor<TContract, TAuthContext, TResult>,
        ...args: HandlerFactoryBeforeOptionsArg<
            TDefaultAccess,
            TDefaultValidateBeforeAuthorization,
            TDefaultHasAuthenticate,
            "protected",
            TAuthContext
        >
    ): RequestHandler;
    <
        TContract extends AnyContract,
        TResult extends ContractHandlerSuccessResult<TContract>,
    >(
        contract: TContract,
        handler: ProtectedHandlerExecutor<TContract, TAuthContext, TResult>,
        ...args: HandlerFactoryAfterOptionsArg<
            TDefaultAccess,
            TDefaultValidateBeforeAuthorization,
            TDefaultHasAuthenticate,
            "protected",
            TAuthContext,
            TContract
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

            const authenticationResult = await executeAuthenticationStage({
                req,
                access,
                security: security
                    ? {
                        authenticate: security.authenticate,
                        authSchema: security.authSchema,
                    }
                    : undefined,
                errors: options?.errors,
            });

            if (security?.validateBeforeAuthorization !== true) {
                await executeAuthorizationStage({
                    req,
                    access,
                    auth: (authenticationResult as { auth?: TAuthContext }).auth,
                    security: security
                        ? {
                            authorize: security.authorize,
                        }
                        : undefined,
                    errors: options?.errors,
                });
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

            if (security?.validateBeforeAuthorization === true) {
                await executeAuthorizationStage({
                    req: validatedReq as AfterAuthorizationRequest<TContract>,
                    access,
                    auth: (authenticationResult as { auth?: TAuthContext }).auth,
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

export function createHandler<
    TContract extends AnyContract,
    TResult extends ContractHandlerSuccessResult<TContract>,
    TAuthContext = never,
>(
    contract: TContract,
    handler: PublicHandlerExecutor<TContract, TResult>,
    options?: BeforeHandlerOptions<"public", TAuthContext>,
): RequestHandler;
export function createHandler<
    TContract extends AnyContract,
    TResult extends ContractHandlerSuccessResult<TContract>,
    TAuthContext = never,
>(
    contract: TContract,
    handler: PublicHandlerExecutor<TContract, TResult>,
    options: AfterHandlerOptions<"public", TAuthContext, TContract>,
): RequestHandler;
export function createHandler<
    TContract extends AnyContract,
    TAuthContext,
    TResult extends ContractHandlerSuccessResult<TContract>,
>(
    contract: TContract,
    handler: OptionalHandlerExecutor<TContract, TAuthContext, TResult>,
    options: BeforeHandlerOptions<"optional", TAuthContext>,
): RequestHandler;
export function createHandler<
    TContract extends AnyContract,
    TAuthContext,
    TResult extends ContractHandlerSuccessResult<TContract>,
>(
    contract: TContract,
    handler: OptionalHandlerExecutor<TContract, TAuthContext, TResult>,
    options: AfterHandlerOptions<"optional", TAuthContext, TContract>,
): RequestHandler;
export function createHandler<
    TContract extends AnyContract,
    TAuthContext,
    TResult extends ContractHandlerSuccessResult<TContract>,
>(
    contract: TContract,
    handler: ProtectedHandlerExecutor<TContract, TAuthContext, TResult>,
    options: BeforeHandlerOptions<"protected", TAuthContext>,
): RequestHandler;
export function createHandler<
    TContract extends AnyContract,
    TAuthContext,
    TResult extends ContractHandlerSuccessResult<TContract>,
>(
    contract: TContract,
    handler: ProtectedHandlerExecutor<TContract, TAuthContext, TResult>,
    options: AfterHandlerOptions<"protected", TAuthContext, TContract>,
): RequestHandler;
export function createHandler<
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
    return createHandlerRuntime(contract, handler, options);
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

export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & {
        access: "public";
        security: FactorySecurityWithRequiredAuthenticate<TAuthContext> & {
            validateBeforeAuthorization: true;
        };
    },
): ConfiguredHandlerFactory<TAuthContext, "public", true, true>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & {
        access: "public";
        security: SecurityOptions<TAuthContext, Request> & {
            validateBeforeAuthorization: true;
        };
    },
): ConfiguredHandlerFactory<TAuthContext, "public", true, false>;
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
        access: AccessMode;
        security: FactorySecurityWithRequiredAuthenticate<TAuthContext> & {
            validateBeforeAuthorization: true;
        };
    },
): ConfiguredHandlerFactory<TAuthContext, AccessMode, true, true>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & {
        access: AccessMode;
        security: SecurityOptions<TAuthContext, Request> & {
            validateBeforeAuthorization: true;
        };
    },
): ConfiguredHandlerFactory<TAuthContext, AccessMode, true, false>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & {
        access: "public";
        security: FactorySecurityWithRequiredAuthenticate<TAuthContext>;
    },
): ConfiguredHandlerFactory<TAuthContext, "public", false, true>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & { access: "public" },
): ConfiguredHandlerFactory<TAuthContext, "public", false, false>;
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
    defaults: HandlerFactoryDefaults<TAuthContext> & {
        access: AccessMode;
        security: FactorySecurityWithRequiredAuthenticate<TAuthContext>;
    },
): ConfiguredHandlerFactory<TAuthContext, AccessMode, false, true>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & { access: AccessMode },
): ConfiguredHandlerFactory<TAuthContext, AccessMode, false, false>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & {
        security: FactorySecurityWithRequiredAuthenticate<TAuthContext>;
    },
): ConfiguredHandlerFactory<TAuthContext, "public", false, true>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults?: HandlerFactoryDefaults<TAuthContext>,
): ConfiguredHandlerFactory<TAuthContext, "public", false, false>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults?: HandlerFactoryDefaults<TAuthContext>,
): ConfiguredHandlerFactory<TAuthContext, AccessMode, boolean, boolean> {
    function createConfiguredHandler<TContract extends AnyContract>(
        contract: TContract,
        handler:
            | AnyPublicHandlerExecutor<TContract>
            | AnyOptionalHandlerExecutor<TContract, TAuthContext>
            | AnyProtectedHandlerExecutor<TContract, TAuthContext>,
        options?: HandlerOptions<AccessMode, TAuthContext, Request>,
    ): RequestHandler {
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
