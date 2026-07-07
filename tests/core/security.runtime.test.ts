import type { Request } from 'express';
import createHttpError from 'http-errors';
import { z } from 'zod';
import {
    allOf,
    anyOf,
    createAuthenticator,
    executeAuthenticationStage,
    executeAuthorizationStage,
    mergeHandlerSecurityDefaults,
    not,
} from '../../src/core/security.core';

describe('security (runtime)', () => {
    const req = {} as Request;

    describe('executeAuthenticationStage', () => {
        const req = {} as Request;

        // --- no authenticator configured ---
        it('throws the framework default 401 when protected and no authenticator', async () => {
            await expect(
                executeAuthenticationStage({ req, access: 'protected', security: undefined }),
            ).rejects.toMatchObject({ statusCode: 401, message: 'Unauthenticated' });
        });

        it('returns empty auth for optional access without authenticator', async () => {
            await expect(
                executeAuthenticationStage({ req, access: 'optional', security: undefined }),
            ).resolves.toEqual({});
        });

        // --- absence (null) ---
        it('throws the framework default 401 when authenticator returns null for protected', async () => {
            await expect(
                executeAuthenticationStage({
                    req,
                    access: 'protected',
                    security: { authenticate: async () => null },
                }),
            ).rejects.toMatchObject({ statusCode: 401, message: 'Unauthenticated' });
        });

        it('uses the authenticator onMissingCredentials default when it returns null for protected', async () => {
            const auth = createAuthenticator(async () => null, {
                onMissingCredentials: () => new createHttpError.Unauthorized('Missing Bearer token'),
            });
            await expect(
                executeAuthenticationStage({ req, access: 'protected', security: { authenticate: auth } }),
            ).rejects.toMatchObject({ statusCode: 401, message: 'Missing Bearer token' });
        });

        it('falls back to the framework default when authenticator has no onMissingCredentials', async () => {
            const auth = createAuthenticator(async () => null);
            await expect(
                executeAuthenticationStage({ req, access: 'protected', security: { authenticate: auth } }),
            ).rejects.toMatchObject({ statusCode: 401, message: 'Unauthenticated' });
        });

        it('accepts null auth for optional access (anonymous)', async () => {
            await expect(
                executeAuthenticationStage({
                    req,
                    access: 'optional',
                    security: { authenticate: async () => null },
                }),
            ).resolves.toEqual({});
        });

        // --- success ---
        it('flows the auth context for protected access', async () => {
            await expect(
                executeAuthenticationStage({
                    req,
                    access: 'protected',
                    security: { authenticate: async () => ({ userId: 'u-1' }) },
                }),
            ).resolves.toEqual({ auth: { userId: 'u-1' } });
        });

        it('flows the auth context for optional access', async () => {
            await expect(
                executeAuthenticationStage({
                    req,
                    access: 'optional',
                    security: { authenticate: async () => ({ userId: 'u-1' }) },
                }),
            ).resolves.toEqual({ auth: { userId: 'u-1' } });
        });

        // --- failure (throw) — fail-closed in BOTH access modes ---
        it('propagates an authenticator failure for protected access', async () => {
            const failing = async () => {
                throw new createHttpError.Unauthorized('Invalid or expired token');
            };
            await expect(
                executeAuthenticationStage({ req, access: 'protected', security: { authenticate: failing } }),
            ).rejects.toMatchObject({ statusCode: 401, message: 'Invalid or expired token' });
        });

        it('propagates an authenticator failure for OPTIONAL access (fail-closed, not swallowed)', async () => {
            const failing = async () => {
                throw new createHttpError.Unauthorized('Invalid or expired token');
            };
            await expect(
                executeAuthenticationStage({ req, access: 'optional', security: { authenticate: failing } }),
            ).rejects.toMatchObject({ statusCode: 401, message: 'Invalid or expired token' });
        });

        it('propagates a non-HttpError authenticator throw unchanged', async () => {
            const failing = async () => {
                throw new Error('boom');
            };
            await expect(
                executeAuthenticationStage({ req, access: 'optional', security: { authenticate: failing } }),
            ).rejects.toThrow('boom');
        });

        // --- authSchema (out of scope; fixed default) ---
        it('throws the fixed default when authSchema parse fails', async () => {
            await expect(
                executeAuthenticationStage({
                    req,
                    access: 'protected',
                    security: {
                        authenticate: async () => ({ email: 'nope' }),
                        authSchema: z.object({ email: z.string().email() }),
                    },
                }),
            ).rejects.toMatchObject({ statusCode: 401, message: 'Invalid authentication data' });
        });
    });

    describe('createAuthenticator', () => {
        const req = { headers: {} } as Request;

        it('returns a callable authenticator that runs the callback', async () => {
            const auth = createAuthenticator(async () => ({ userId: 'u-1' }));
            expect(typeof auth).toBe('function');
            await expect(auth(req)).resolves.toEqual({ userId: 'u-1' });
        });

        it('attaches onMissingCredentials when provided', () => {
            const onMissing = () => new createHttpError.Unauthorized('Missing Bearer token');
            const auth = createAuthenticator(async () => null, { onMissingCredentials: onMissing });
            expect(auth.onMissingCredentials).toBe(onMissing);
        });

        it('omits onMissingCredentials when not provided', () => {
            const auth = createAuthenticator(async () => null);
            expect(auth.onMissingCredentials).toBeUndefined();
        });

        it('preserves absence vs failure semantics through the factory', async () => {
            const auth = createAuthenticator(async (r: Request) => {
                if (!r.headers.authorization) return null; // absence
                throw new createHttpError.Unauthorized('bad token'); // failure
            });
            await expect(auth(req)).resolves.toBeNull(); // absence → null
            const reqWithHeader = { ...req, headers: { authorization: 'Bearer x' } } as Request;
            await expect(auth(reqWithHeader)).rejects.toMatchObject({ statusCode: 401 }); // failure → throw
        });
    });

    describe('executeAuthorizationStage', () => {
        it('skips authorization when auth is missing (optional access path)', async () => {
            const authorizer = vi.fn(async (): Promise<true> => true);
            await expect(
                executeAuthorizationStage({
                    req,
                    auth: undefined,
                    authorizers: [authorizer],
                }),
            ).resolves.toBeUndefined();
            expect(authorizer).not.toHaveBeenCalled();
        });

        it('resolves when every authorizer allows', async () => {
            await expect(
                executeAuthorizationStage({
                    req,
                    auth: { userId: '1' },
                    authorizers: [async () => true, async () => true],
                }),
            ).resolves.toBeUndefined();
        });

        it('resolves with an empty authorizer list when auth is present', async () => {
            await expect(
                executeAuthorizationStage({
                    req,
                    auth: { userId: '1' },
                    authorizers: [],
                }),
            ).resolves.toBeUndefined();
        });

        it('propagates the HttpError thrown by a denying authorizer', async () => {
            await expect(
                executeAuthorizationStage({
                    req,
                    auth: { userId: '1' },
                    authorizers: [
                        async () => {
                            throw new createHttpError.Forbidden('not allowed');
                        },
                    ],
                }),
            ).rejects.toMatchObject({ statusCode: 403, message: 'not allowed' });
        });

        it('preserves the specific status code and message of a thrown denial', async () => {
            await expect(
                executeAuthorizationStage({
                    req,
                    auth: { userId: '1' },
                    authorizers: [
                        async () => {
                            throw new createHttpError.NotFound('resource missing');
                        },
                    ],
                }),
            ).rejects.toMatchObject({ statusCode: 404, message: 'resource missing' });
        });

        it('short-circuits: a denying authorizer skips the remaining ones', async () => {
            const first = vi.fn(async () => {
                throw new createHttpError.Forbidden('nope');
            });
            const second = vi.fn(async (): Promise<true> => true);

            await expect(
                executeAuthorizationStage({
                    req,
                    auth: { userId: '1' },
                    authorizers: [first, second],
                }),
            ).rejects.toMatchObject({ statusCode: 403 });

            expect(first).toHaveBeenCalledTimes(1);
            expect(second).not.toHaveBeenCalled();
        });

        it('propagates a non-HttpError unchanged (unexpected error, not mapped to 403)', async () => {
            await expect(
                executeAuthorizationStage({
                    req,
                    auth: { userId: '1' },
                    authorizers: [
                        async () => {
                            throw new Error('boom');
                        },
                    ],
                }),
            ).rejects.toThrow('boom');
        });
    });

    describe('policy combinators', () => {
        type Ctx = { userId: string };
        const ctx = { userId: '1' };

        const allow = vi.fn(async (): Promise<true> => true);
        const denyForbidden = vi.fn(async () => {
            throw new createHttpError.Forbidden('branch-deny');
        });
        const denyNotFound = vi.fn(async () => {
            throw new createHttpError.NotFound('branch-missing');
        });
        const boom = vi.fn(async () => {
            throw new Error('unexpected');
        });

        afterEach(() => {
            [allow, denyForbidden, denyNotFound, boom].forEach((fn) => fn.mockClear());
        });

        describe('allOf (AND, no denialError)', () => {
            it('resolves when every policy allows', async () => {
                const policy = allOf<Ctx>([async () => true, async () => true]);
                await expect(policy({ req, auth: ctx })).resolves.toBe(true);
            });

            it('resolves for an empty policy list (vacuous truth)', async () => {
                const policy = allOf<Ctx>([]);
                await expect(policy({ req, auth: ctx })).resolves.toBe(true);
            });

            it('propagates the thrown HttpError and short-circuits remaining policies', async () => {
                const second = vi.fn(async (): Promise<true> => true);
                const policy = allOf<Ctx>([denyForbidden, second]);

                await expect(policy({ req, auth: ctx })).rejects.toMatchObject({
                    statusCode: 403,
                    message: 'branch-deny',
                });
                expect(second).not.toHaveBeenCalled();
            });

            it('propagates the exact HttpError of a failing policy', async () => {
                const policy = allOf<Ctx>([denyNotFound]);
                await expect(policy({ req, auth: ctx })).rejects.toMatchObject({
                    statusCode: 404,
                    message: 'branch-missing',
                });
            });

            it('propagates a non-HttpError unchanged', async () => {
                const policy = allOf<Ctx>([boom]);
                await expect(policy({ req, auth: ctx })).rejects.toThrow('unexpected');
            });
        });

        describe('anyOf (OR, optional denialError)', () => {
            it('resolves when the first policy allows (short-circuit)', async () => {
                const second = vi.fn(async (): Promise<true> => true);
                const policy = anyOf<Ctx>([allow, second]);

                await expect(policy({ req, auth: ctx })).resolves.toBe(true);
                expect(second).not.toHaveBeenCalled();
            });

            it('resolves when a later policy allows after earlier ones deny', async () => {
                const policy = anyOf<Ctx>([denyForbidden, denyNotFound, async () => true]);
                await expect(policy({ req, auth: ctx })).resolves.toBe(true);
            });

            it('throws the default Forbidden when every policy denies', async () => {
                const policy = anyOf<Ctx>([denyForbidden, denyNotFound]);
                await expect(policy({ req, auth: ctx })).rejects.toMatchObject({
                    statusCode: 403,
                    message: 'Forbidden',
                });
            });

            it('swallows branch denial errors when all branches deny', async () => {
                // branch throws 404 NotFound; combinator must surface its own 403, not the 404
                const policy = anyOf<Ctx>([denyNotFound]);
                const error = await policy({ req, auth: ctx }).then(
                    () => undefined,
                    (e: unknown) => e,
                );
                expect(error).toBeInstanceOf(createHttpError.Forbidden);
                expect(error).not.toBeInstanceOf(createHttpError.NotFound);
            });

            it('throws the provided custom denialError when every policy denies', async () => {
                const denial = new createHttpError.PaymentRequired('pay up');
                const policy = anyOf<Ctx>([denyForbidden], denial);
                await expect(policy({ req, auth: ctx })).rejects.toMatchObject({
                    statusCode: 402,
                    message: 'pay up',
                });
            });

            it('throws exactly the provided denialError instance', async () => {
                const denial = new createHttpError.Forbidden('custom');
                const policy = anyOf<Ctx>([denyForbidden], denial);
                await expect(policy({ req, auth: ctx })).rejects.toBe(denial);
            });

            it('propagates a non-HttpError unchanged (not treated as a denial)', async () => {
                const second = vi.fn(async (): Promise<true> => true);
                const policy = anyOf<Ctx>([boom, second]);

                await expect(policy({ req, auth: ctx })).rejects.toThrow('unexpected');
                expect(second).not.toHaveBeenCalled();
            });

            it('throws the default Forbidden for an empty policy list', async () => {
                const policy = anyOf<Ctx>([]);
                await expect(policy({ req, auth: ctx })).rejects.toMatchObject({
                    statusCode: 403,
                    message: 'Forbidden',
                });
            });
        });

        describe('not (negation, optional denialError)', () => {
            it('resolves when the wrapped policy denies', async () => {
                const policy = not<Ctx>(denyForbidden);
                await expect(policy({ req, auth: ctx })).resolves.toBe(true);
            });

            it('throws the default Forbidden when the wrapped policy allows', async () => {
                const policy = not<Ctx>(async () => true);
                await expect(policy({ req, auth: ctx })).rejects.toMatchObject({
                    statusCode: 403,
                    message: 'Forbidden',
                });
            });

            it('throws the provided custom denialError when the wrapped policy allows', async () => {
                const denial = new createHttpError.PaymentRequired('pay up');
                const policy = not<Ctx>(async () => true, denial);
                await expect(policy({ req, auth: ctx })).rejects.toMatchObject({
                    statusCode: 402,
                    message: 'pay up',
                });
            });

            it('throws exactly the provided denialError instance', async () => {
                const denial = new createHttpError.Forbidden('custom');
                const policy = not<Ctx>(async () => true, denial);
                await expect(policy({ req, auth: ctx })).rejects.toBe(denial);
            });

            it('propagates a non-HttpError unchanged (does not silently allow)', async () => {
                const policy = not<Ctx>(boom);
                await expect(policy({ req, auth: ctx })).rejects.toThrow('unexpected');
            });
        });

        describe('composition', () => {
            it('allOf inside anyOf: an allOf denial falls through to the next branch', async () => {
                const policy = anyOf<Ctx>([
                    allOf<Ctx>([denyForbidden, async () => true]),
                    async () => true,
                ]);
                await expect(policy({ req, auth: ctx })).resolves.toBe(true);
            });

            it('not inside anyOf: a denied negation allows the OR', async () => {
                const policy = anyOf<Ctx>([not<Ctx>(denyForbidden), async () => true]);
                await expect(policy({ req, auth: ctx })).resolves.toBe(true);
            });

            it('anyOf inside allOf: the OR is one AND branch', async () => {
                const policy = allOf<Ctx>([
                    anyOf<Ctx>([denyForbidden, async () => true]),
                    async () => true,
                ]);
                await expect(policy({ req, auth: ctx })).resolves.toBe(true);
            });

            it('anyOf denialError wraps the whole OR when every branch denies', async () => {
                const denial = new createHttpError.Forbidden('or-denied');
                const policy = anyOf<Ctx>(
                    [allOf<Ctx>([denyNotFound]), not<Ctx>(async () => true)],
                    denial,
                );
                await expect(policy({ req, auth: ctx })).rejects.toBe(denial);
            });
        });
    });

    describe('mergeHandlerSecurityDefaults', () => {
        it('shallow merges access/security', () => {
            const merged = mergeHandlerSecurityDefaults(
                {
                    access: 'protected',
                    security: {
                        authenticate: async () => ({ userId: '1' }),
                    },
                },
                {
                    access: 'optional',
                    security: {
                        authorize: { afterValidation: [async () => true] },
                    },
                },
            );

            expect(merged.access).toBe('optional');
            expect(merged.security?.authenticate).toBeDefined();
            expect(merged.security?.authorize).toBeDefined();
        });

        it('inherits a factory authorize bucket the handler omits', () => {
            const beforePolicy = async (): Promise<true> => true;
            const merged = mergeHandlerSecurityDefaults(
                {
                    security: {
                        authorize: { beforeValidation: [beforePolicy] },
                    },
                },
                {
                    security: {
                        authorize: { afterValidation: [async () => true] },
                    },
                },
            );

            expect(merged.security?.authorize?.beforeValidation).toEqual([beforePolicy]);
            expect(merged.security?.authorize?.afterValidation).toHaveLength(1);
        });

        it('replaces a factory authorize bucket when the handler specifies the same bucket', () => {
            const defaultPolicy = async (): Promise<true> => true;
            const handlerPolicy = async (): Promise<true> => true;
            const merged = mergeHandlerSecurityDefaults(
                {
                    security: {
                        authorize: { beforeValidation: [defaultPolicy] },
                    },
                },
                {
                    security: {
                        authorize: { beforeValidation: [handlerPolicy] },
                    },
                },
            );

            // replace semantics, not concatenation
            expect(merged.security?.authorize?.beforeValidation).toEqual([handlerPolicy]);
        });
    });
});
