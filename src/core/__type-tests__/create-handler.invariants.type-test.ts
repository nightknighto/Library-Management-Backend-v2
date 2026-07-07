import { z } from 'zod';
import {
    type AfterAuthorizationRequest,
    type Authenticator,
    createContract,
    createHandler,
    type HandlerOptions,
    type HandlerRequest,
} from '../index.ts';
import type { Equal, Expect, ExpectFalse, Extends, IsAny } from './type-test.utils.ts';

/**
 * HUMAN GUIDE - Invariant lane
 *
 * Put tests here when:
 * - The assertion represents a baseline framework contract that should stay stable long-term.
 * - Breaking one of these tests should be treated as a potential breaking change.
 *
 * Do not put tests here when:
 * - The test is tied to a specific old bug report (use the regression lane file).
 * - The test is a temporary or experimental scenario (use capability or interaction lanes).
 *
 * Fast decision rule:
 * - If changing this assertion would require migration notes for consumers, it belongs here.
 *
 * This file is compile-only and validated by `pnpm check`.
 */

type AuthContext = {
    userId: string;
};

const UpdateBookContract = createContract({
    request: {
        body: {
            title: z.string(),
        },
        params: {
            isbn: z.string(),
        },
        query: {
            dryRun: z.coerce.boolean().default(false),
        },
    },
    response: z.object({
        updated: z.boolean(),
    }),
});

type UpdateBookHandlerRequest = HandlerRequest<typeof UpdateBookContract>;
type UpdateBookAfterAuthorizationRequest = AfterAuthorizationRequest<typeof UpdateBookContract>;

type _handlerReqBodyNotAny = ExpectFalse<IsAny<UpdateBookHandlerRequest['body']>>;
type _handlerReqBodyExact = Expect<Equal<UpdateBookHandlerRequest['body'], { title: string }>>;
type _handlerReqParamsExact = Expect<Equal<UpdateBookHandlerRequest['params'], { isbn: string }>>;
type _handlerReqQueryExact = Expect<Equal<UpdateBookHandlerRequest['query'], { dryRun: boolean }>>;

type _afterAuthReqBodyExact = Expect<
    Equal<UpdateBookAfterAuthorizationRequest['body'], { title: string }>
>;

type _afterAuthReqParamsExact = Expect<
    Extends<UpdateBookAfterAuthorizationRequest['params'], { isbn: string }>
>;

type _afterAuthReqQueryExact = Expect<
    Extends<UpdateBookAfterAuthorizationRequest['query'], { dryRun: boolean }>
>;

createHandler(
    UpdateBookContract,
    {
        access: 'optional',
        security: {
            authenticate: async () => ({ userId: 'user-optional' }),
        },
    },
    async ({ req, auth }) => {
        type _optionalHasUndefined = Expect<Extends<undefined, typeof auth>>;
        type _optionalAuthShape = Expect<Extends<Exclude<typeof auth, undefined>, AuthContext>>;
        return { data: { updated: true } };
    },
);

createHandler(
    UpdateBookContract,
    {
        access: 'protected',
        security: {
            authenticate: async () => ({ userId: 'user-protected' }),
        },
    },
    async ({ req, auth }) => {
        type _protectedAuth = Expect<Extends<typeof auth, AuthContext>>;
        // @ts-expect-error protected auth is never undefined
        const mustBeUndefined: undefined = auth;
        void mustBeUndefined;

        return { data: { updated: true } };
    },
);

/**
 * Invariant: the shared `errors` surface is gone.
 *
 * Both security primitives now own their own errors — authorizers throw denials,
 * authenticators declare an `onMissingCredentials` default. `HandlerErrorMappers`
 * / `AuthErrorMapper` and the `errors` option no longer exist; re-introducing an
 * `errors` key on handler options must be treated as a breaking change.
 */
type _errorsGoneFromHandlerOptions = Expect<
    Equal<'errors' extends keyof HandlerOptions<'protected', AuthContext> ? true : false, false>
>;

/**
 * Invariant: the Authenticator is a callable carrying an optional
 * `onMissingCredentials` default (authenticator-dictated, single source).
 */
type _authenticatorHasOnMissingCredentials = Expect<
    Extends<'onMissingCredentials', keyof Authenticator<AuthContext>>
>;

/**
 * Backward-compat: a plain function is still assignable to Authenticator.
 *
 * Inline `authenticate` callbacks remain valid without `createAuthenticator`;
 * `createAuthenticator` is the recommended inference-stable authoring path and
 * the only way to attach `onMissingCredentials`.
 */
const _plainAuthenticatorAssignable: Authenticator<AuthContext> = async () => ({ userId: 'u-1' });
