import type { Request, RequestHandler } from "express";
import type { Query } from "express-serve-static-core";
import type { infer as Infer, ZodType, ZodTypeAny } from "zod";
import type { Contract } from "./create-contract.core.ts";
import type { ValidatedRequest } from "../shared/middlewares/validators.middleware.ts";
import { sanitizeResponse } from "../shared/schemas/sanitize-response.ts";
import { validateContractRequest } from "./validate-contract-request.core.ts";
import { handleError } from "./error-handler.core.ts";
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

export type HandlerRequest<TContract extends AnyContract> =
    ValidatedRequest<ContractRequestPayload<TContract>>;

type AuthorizerBaseRequest = Request<Record<string, string>, any, unknown, Query>;

export type AfterAuthorizationRequest<TContract extends AnyContract> =
    AuthorizerBaseRequest & HandlerRequest<TContract>;

type PublicHandlerExecutor<TContract extends AnyContract> = (
    req: HandlerRequest<TContract>,
) => Promise<ContractHandlerSuccessResult<TContract>>;

type ProtectedHandlerExecutor<TContract extends AnyContract, TAuthContext> = (
    req: HandlerRequest<TContract>,
    auth: TAuthContext,
) => Promise<ContractHandlerSuccessResult<TContract>>;

type OptionalHandlerExecutor<TContract extends AnyContract, TAuthContext> = (
    req: HandlerRequest<TContract>,
    auth?: TAuthContext,
) => Promise<ContractHandlerSuccessResult<TContract>>;

type HandlerFactoryDefaults<TAuthContext> = {
    access?: AccessMode;
    security?: SecurityOptions<TAuthContext, Request>;
    errors?: HandlerErrorMappers<Request>;
};

type BeforeSecurityOptions<TAuthContext> =
    Omit<SecurityOptions<TAuthContext, Request>, "validateBeforeAuthorization"> & {
        validateBeforeAuthorization?: false | undefined;
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

type BeforeHandlerOptions<
    TAccess extends AccessMode,
    TAuthContext,
> = Omit<HandlerOptions<TAccess, TAuthContext, Request>, "security"> & {
    security?: BeforeSecurityOptions<TAuthContext>;
};

type FactoryBeforeSecurityOptions<TAuthContext> =
    Omit<
        SecurityOptions<TAuthContext, Request>,
        "validateBeforeAuthorization"
    > & {
        validateBeforeAuthorization?: false | undefined;
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

type FactoryBeforeSecurityOptionsWithExplicitFalse<TAuthContext> =
    Omit<FactoryBeforeSecurityOptions<TAuthContext>, "validateBeforeAuthorization"> & {
        validateBeforeAuthorization: false;
    };

type FactoryBeforeHandlerOptionsWithExplicitFalse<
    TAccess extends AccessMode,
    TAuthContext,
> = Omit<HandlerOptions<TAccess, TAuthContext, Request>, "security"> & {
    security: FactoryBeforeSecurityOptionsWithExplicitFalse<TAuthContext>;
};

type AfterHandlerOptions<
    TAccess extends AccessMode,
    TAuthContext,
    TContract extends AnyContract,
> = Omit<HandlerOptions<TAccess, TAuthContext, Request>, "security"> & {
    security: AfterSecurityOptions<TAuthContext, TContract>;
};

type FactoryAfterSecurityOptionsWithImplicitTrue<
    TAuthContext,
    TContract extends AnyContract,
> = Omit<AfterSecurityOptions<TAuthContext, TContract>, "validateBeforeAuthorization"> & {
    validateBeforeAuthorization?: true | undefined;
};

type FactoryAfterHandlerOptionsWithImplicitTrue<
    TAccess extends AccessMode,
    TAuthContext,
    TContract extends AnyContract,
> = Omit<HandlerOptions<TAccess, TAuthContext, Request>, "security"> & {
    security?: FactoryAfterSecurityOptionsWithImplicitTrue<TAuthContext, TContract>;
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

type HandlerFactoryBeforeOptionsArg<
    TDefaultAccess extends AccessMode,
    TDefaultValidateBeforeAuthorization extends boolean,
    TAccess extends AccessMode,
    TAuthContext,
> = [TDefaultAccess] extends [TAccess]
    ? [TDefaultValidateBeforeAuthorization] extends [true]
    ? [options: FactoryBeforeHandlerOptionsWithExplicitFalse<TAccess, TAuthContext>]
    : [options?: FactoryBeforeHandlerOptions<TAccess, TAuthContext>]
    : [
        options: WithRequiredAccess<
            [TDefaultValidateBeforeAuthorization] extends [true]
            ? FactoryBeforeHandlerOptionsWithExplicitFalse<TAccess, TAuthContext>
            : FactoryBeforeHandlerOptions<TAccess, TAuthContext>,
            TAccess
        >
    ];

type HandlerFactoryAfterOptionsArg<
    TDefaultAccess extends AccessMode,
    TDefaultValidateBeforeAuthorization extends boolean,
    TAccess extends AccessMode,
    TAuthContext,
    TContract extends AnyContract,
> = [TDefaultAccess] extends [TAccess]
    ? [TDefaultValidateBeforeAuthorization] extends [true]
    ? [options?: FactoryAfterHandlerOptionsWithImplicitTrue<TAccess, TAuthContext, TContract>]
    : [options: AfterHandlerOptions<TAccess, TAuthContext, TContract>]
    : [
        options: WithRequiredAccess<
            [TDefaultValidateBeforeAuthorization] extends [true]
            ? FactoryAfterHandlerOptionsWithImplicitTrue<TAccess, TAuthContext, TContract>
            : AfterHandlerOptions<TAccess, TAuthContext, TContract>,
            TAccess
        >
    ];

type ConfiguredHandlerFactory<
    TAuthContext,
    TDefaultAccess extends AccessMode,
    TDefaultValidateBeforeAuthorization extends boolean,
> = {
    <TContract extends AnyContract>(
        contract: TContract,
        handler: PublicHandlerExecutor<TContract>,
        ...args: HandlerFactoryBeforeOptionsArg<
            TDefaultAccess,
            TDefaultValidateBeforeAuthorization,
            "public",
            TAuthContext
        >
    ): RequestHandler;
    <TContract extends AnyContract>(
        contract: TContract,
        handler: PublicHandlerExecutor<TContract>,
        ...args: HandlerFactoryAfterOptionsArg<
            TDefaultAccess,
            TDefaultValidateBeforeAuthorization,
            "public",
            TAuthContext,
            TContract
        >
    ): RequestHandler;
    <TContract extends AnyContract>(
        contract: TContract,
        handler: OptionalHandlerExecutor<TContract, TAuthContext>,
        ...args: HandlerFactoryBeforeOptionsArg<
            TDefaultAccess,
            TDefaultValidateBeforeAuthorization,
            "optional",
            TAuthContext
        >
    ): RequestHandler;
    <TContract extends AnyContract>(
        contract: TContract,
        handler: OptionalHandlerExecutor<TContract, TAuthContext>,
        ...args: HandlerFactoryAfterOptionsArg<
            TDefaultAccess,
            TDefaultValidateBeforeAuthorization,
            "optional",
            TAuthContext,
            TContract
        >
    ): RequestHandler;
    <TContract extends AnyContract>(
        contract: TContract,
        handler: ProtectedHandlerExecutor<TContract, TAuthContext>,
        ...args: HandlerFactoryBeforeOptionsArg<
            TDefaultAccess,
            TDefaultValidateBeforeAuthorization,
            "protected",
            TAuthContext
        >
    ): RequestHandler;
    <TContract extends AnyContract>(
        contract: TContract,
        handler: ProtectedHandlerExecutor<TContract, TAuthContext>,
        ...args: HandlerFactoryAfterOptionsArg<
            TDefaultAccess,
            TDefaultValidateBeforeAuthorization,
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
        | PublicHandlerExecutor<TContract>
        | OptionalHandlerExecutor<TContract, TAuthContext>
        | ProtectedHandlerExecutor<TContract, TAuthContext>,
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

            const validatedReq = await validateContractRequest<TContract["request"]>(
                contract.request,
                req,
            );

            const typedReq = validatedReq as HandlerRequest<TContract>;

            if (security?.validateBeforeAuthorization === true) {
                await executeAuthorizationStage({
                    req: typedReq as AfterAuthorizationRequest<TContract>,
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
                result = await (handler as ProtectedHandlerExecutor<TContract, TAuthContext>)(
                    typedReq,
                    (authenticationResult as { auth: TAuthContext }).auth,
                );
            } else if (access === "optional") {
                result = await (handler as OptionalHandlerExecutor<TContract, TAuthContext>)(
                    typedReq,
                    (authenticationResult as { auth?: TAuthContext }).auth,
                );
            } else {
                result = await (handler as PublicHandlerExecutor<TContract>)(typedReq);
            }

            const statusCode = result.statusCode ?? 200;
            const successPayload = buildSuccessResponsePayload({
                data: result.data,
                timestamp: new Date().toISOString(),
                pagination: result.pagination
                    ? buildPaginationMeta(result.pagination)
                    : undefined,
            });

            const output = sanitizeResponse(contract.response, successPayload);
            res.status(statusCode).json(output);
        } catch (error) {
            handleError(error, contract.response, res);
        }
    };
}

export function createHandler<
    TContract extends AnyContract,
    TAuthContext = never,
>(
    contract: TContract,
    handler: PublicHandlerExecutor<TContract>,
    options?: BeforeHandlerOptions<"public", TAuthContext>,
): RequestHandler;
export function createHandler<
    TContract extends AnyContract,
    TAuthContext = never,
>(
    contract: TContract,
    handler: PublicHandlerExecutor<TContract>,
    options: AfterHandlerOptions<"public", TAuthContext, TContract>,
): RequestHandler;
export function createHandler<
    TContract extends AnyContract,
    TAuthContext,
>(
    contract: TContract,
    handler: OptionalHandlerExecutor<TContract, TAuthContext>,
    options: BeforeHandlerOptions<"optional", TAuthContext>,
): RequestHandler;
export function createHandler<
    TContract extends AnyContract,
    TAuthContext,
>(
    contract: TContract,
    handler: OptionalHandlerExecutor<TContract, TAuthContext>,
    options: AfterHandlerOptions<"optional", TAuthContext, TContract>,
): RequestHandler;
export function createHandler<
    TContract extends AnyContract,
    TAuthContext,
>(
    contract: TContract,
    handler: ProtectedHandlerExecutor<TContract, TAuthContext>,
    options: BeforeHandlerOptions<"protected", TAuthContext>,
): RequestHandler;
export function createHandler<
    TContract extends AnyContract,
    TAuthContext,
>(
    contract: TContract,
    handler: ProtectedHandlerExecutor<TContract, TAuthContext>,
    options: AfterHandlerOptions<"protected", TAuthContext, TContract>,
): RequestHandler;
export function createHandler<
    TContract extends AnyContract,
    TAuthContext,
>(
    contract: TContract,
    handler:
        | PublicHandlerExecutor<TContract>
        | OptionalHandlerExecutor<TContract, TAuthContext>
        | ProtectedHandlerExecutor<TContract, TAuthContext>,
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
        | PublicHandlerExecutor<TContract>
        | OptionalHandlerExecutor<TContract, TAuthContext>
        | ProtectedHandlerExecutor<TContract, TAuthContext>,
    options?: HandlerOptions<AccessMode, TAuthContext, Request>,
): RequestHandler {
    return createHandlerRuntime<TContract, TAuthContext>(
        contract,
        handler,
        options as HandlerOptionsByAuthorizationMode<AccessMode, TAuthContext, TContract>,
    );
}

export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & {
        access: "public";
        security: SecurityOptions<TAuthContext, Request> & {
            validateBeforeAuthorization: true;
        };
    },
): ConfiguredHandlerFactory<TAuthContext, "public", true>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & {
        access: "optional";
        security: SecurityOptions<TAuthContext, Request> & {
            validateBeforeAuthorization: true;
        };
    },
): ConfiguredHandlerFactory<TAuthContext, "optional", true>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & {
        access: "protected";
        security: SecurityOptions<TAuthContext, Request> & {
            validateBeforeAuthorization: true;
        };
    },
): ConfiguredHandlerFactory<TAuthContext, "protected", true>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & {
        access: AccessMode;
        security: SecurityOptions<TAuthContext, Request> & {
            validateBeforeAuthorization: true;
        };
    },
): ConfiguredHandlerFactory<TAuthContext, AccessMode, true>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & { access: "public" },
): ConfiguredHandlerFactory<TAuthContext, "public", false>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & { access: "optional" },
): ConfiguredHandlerFactory<TAuthContext, "optional", false>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & { access: "protected" },
): ConfiguredHandlerFactory<TAuthContext, "protected", false>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & { access: AccessMode },
): ConfiguredHandlerFactory<TAuthContext, AccessMode, false>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults?: HandlerFactoryDefaults<TAuthContext>,
): ConfiguredHandlerFactory<TAuthContext, "public", false>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults?: HandlerFactoryDefaults<TAuthContext>,
): ConfiguredHandlerFactory<TAuthContext, AccessMode, boolean> {
    function createConfiguredHandler<TContract extends AnyContract>(
        contract: TContract,
        handler:
            | PublicHandlerExecutor<TContract>
            | OptionalHandlerExecutor<TContract, TAuthContext>
            | ProtectedHandlerExecutor<TContract, TAuthContext>,
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
        boolean
    >;
}
