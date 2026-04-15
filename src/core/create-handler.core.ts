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
    Omit<SecurityOptions<TAuthContext, Request>, "authorizationBeforeValidation"> & {
        authorizationBeforeValidation?: true | undefined;
    };

type AfterSecurityOptions<
    TAuthContext,
    TContract extends AnyContract,
> = Omit<
    SecurityOptions<TAuthContext, Request>,
    "authorize" | "authorizationBeforeValidation"
> & {
    authorizationBeforeValidation: false;
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

type AfterHandlerOptions<
    TAccess extends AccessMode,
    TAuthContext,
    TContract extends AnyContract,
> = Omit<HandlerOptions<TAccess, TAuthContext, Request>, "security"> & {
    security: AfterSecurityOptions<TAuthContext, TContract>;
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

type HandlerFactoryOptionsArg<
    TDefaultAccess extends AccessMode,
    TAccess extends AccessMode,
    TAuthContext,
    TContract extends AnyContract,
> = [TDefaultAccess] extends [TAccess]
    ? [options?: HandlerOptionsByAuthorizationMode<TAccess, TAuthContext, TContract>]
    : [
        options: WithRequiredAccess<
            HandlerOptionsByAuthorizationMode<TAccess, TAuthContext, TContract>,
            TAccess
        >
    ];

type ConfiguredHandlerFactory<
    TAuthContext,
    TDefaultAccess extends AccessMode,
> = {
    <TContract extends AnyContract>(
        contract: TContract,
        handler: PublicHandlerExecutor<TContract>,
        ...args: HandlerFactoryOptionsArg<TDefaultAccess, "public", TAuthContext, TContract>
    ): RequestHandler;
    <TContract extends AnyContract>(
        contract: TContract,
        handler: OptionalHandlerExecutor<TContract, TAuthContext>,
        ...args: HandlerFactoryOptionsArg<TDefaultAccess, "optional", TAuthContext, TContract>
    ): RequestHandler;
    <TContract extends AnyContract>(
        contract: TContract,
        handler: ProtectedHandlerExecutor<TContract, TAuthContext>,
        ...args: HandlerFactoryOptionsArg<TDefaultAccess, "protected", TAuthContext, TContract>
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

            if (security?.authorizationBeforeValidation !== false) {
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

            if (security?.authorizationBeforeValidation === false) {
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
    defaults: HandlerFactoryDefaults<TAuthContext> & { access: "public" },
): ConfiguredHandlerFactory<TAuthContext, "public">;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & { access: "optional" },
): ConfiguredHandlerFactory<TAuthContext, "optional">;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & { access: "protected" },
): ConfiguredHandlerFactory<TAuthContext, "protected">;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults: HandlerFactoryDefaults<TAuthContext> & { access: AccessMode },
): ConfiguredHandlerFactory<TAuthContext, AccessMode>;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults?: HandlerFactoryDefaults<TAuthContext>,
): ConfiguredHandlerFactory<TAuthContext, "public">;
export function createHandlerFactory<
    TAuthContext,
>(
    defaults?: HandlerFactoryDefaults<TAuthContext>,
): ConfiguredHandlerFactory<TAuthContext, AccessMode> {
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

    return createConfiguredHandler as ConfiguredHandlerFactory<TAuthContext, AccessMode>;
}
