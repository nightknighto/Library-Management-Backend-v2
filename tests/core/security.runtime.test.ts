import type { Request } from 'express';
import createHttpError from 'http-errors';
import { z } from 'zod';
import {
    allOf,
    anyOf,
    executeAuthenticationStage,
    executeAuthorizationStage,
    mergeHandlerSecurityDefaults,
    not,
} from '../../src/core/security.core';

describe('security (runtime)', () => {
    const req = {} as Request;

    describe('executeAuthenticationStage', () => {
        it('throws unauthorized when protected and no authenticator', async () => {
            await expect(
                executeAuthenticationStage({
                    req,
                    access: 'protected',
                    security: undefined,
                    errors: undefined,
                }),
            ).rejects.toMatchObject({ statusCode: 401 });
        });

        it('returns empty auth for optional access without authenticate', async () => {
            const result = await executeAuthenticationStage({
                req,
                access: 'optional',
                security: undefined,
                errors: undefined,
            });

            expect(result).toEqual({});
        });

        it('throws when authenticate returns null for protected access', async () => {
            await expect(
                executeAuthenticationStage({
                    req,
                    access: 'protected',
                    security: {
                        authenticate: async () => null,
                    },
                    errors: undefined,
                }),
            ).rejects.toMatchObject({ statusCode: 401 });
        });

        it('accepts null auth for optional access', async () => {
            const result = await executeAuthenticationStage({
                req,
                access: 'optional',
                security: {
                    authenticate: async () => null,
                },
                errors: undefined,
            });

            expect(result).toEqual({});
        });

        it('validates auth context against authSchema', async () => {
            await expect(
                executeAuthenticationStage({
                    req,
                    access: 'protected',
                    security: {
                        authenticate: async () => ({ email: 'nope' }),
                        authSchema: z.object({ email: z.string().email() }),
                    },
                    errors: undefined,
                }),
            ).rejects.toMatchObject({ statusCode: 401, message: 'Invalid authentication data' });
        });

        it('uses unauthenticated error mapper when provided', async () => {
            await expect(
                executeAuthenticationStage({
                    req,
                    access: 'protected',
                    security: {
                        authenticate: async () => null,
                    },
                    errors: {
                        unauthenticated: () => new createHttpError.Unauthorized('Custom auth'),
                    },
                }),
            ).rejects.toMatchObject({ statusCode: 401, message: 'Custom auth' });
        });
    });

    describe('executeAuthorizationStage', () => {
        it('throws unauthorized when protected and auth is missing', async () => {
            await expect(
                executeAuthorizationStage({
                    req,
                    access: 'protected',
                    auth: undefined,
                    authorizers: [],
                    errors: undefined,
                }),
            ).rejects.toMatchObject({ statusCode: 401 });
        });

        it('skips authorization when optional and auth is missing', async () => {
            await expect(
                executeAuthorizationStage({
                    req,
                    access: 'optional',
                    auth: undefined,
                    authorizers: [async () => false],
                    errors: undefined,
                }),
            ).resolves.toBeUndefined();
        });

        it('throws forbidden when a policy returns false', async () => {
            await expect(
                executeAuthorizationStage({
                    req,
                    access: 'protected',
                    auth: { userId: '1' },
                    authorizers: [async () => false],
                    errors: undefined,
                }),
            ).rejects.toMatchObject({ statusCode: 403 });
        });

        it('passes when all policies return true', async () => {
            await expect(
                executeAuthorizationStage({
                    req,
                    access: 'protected',
                    auth: { userId: '1' },
                    authorizers: [async () => true, async () => true],
                    errors: undefined,
                }),
            ).resolves.toBeUndefined();
        });

        it('short-circuits on the first failing policy', async () => {
            const first = vi.fn(async () => false);
            const second = vi.fn(async () => true);

            await expect(
                executeAuthorizationStage({
                    req,
                    access: 'protected',
                    auth: { userId: '1' },
                    authorizers: [first, second],
                    errors: undefined,
                }),
            ).rejects.toMatchObject({ statusCode: 403 });

            expect(first).toHaveBeenCalledTimes(1);
            expect(second).not.toHaveBeenCalled();
        });

        it('uses unauthorized error mapper when provided', async () => {
            await expect(
                executeAuthorizationStage({
                    req,
                    access: 'protected',
                    auth: { userId: '1' },
                    authorizers: [async () => false],
                    errors: {
                        unauthorized: () => new createHttpError.Forbidden('Custom deny'),
                    },
                }),
            ).rejects.toMatchObject({ statusCode: 403, message: 'Custom deny' });
        });
    });

    describe('policy combinators', () => {
        it('allOf short-circuits on failure', async () => {
            const first = vi.fn(async () => false);
            const second = vi.fn(async () => true);
            const policy = allOf([first, second]);

            const result = await policy({ req, auth: { userId: '1' } });

            expect(result).toBe(false);
            expect(first).toHaveBeenCalledTimes(1);
            expect(second).not.toHaveBeenCalled();
        });

        it('anyOf short-circuits on success', async () => {
            const first = vi.fn(async () => true);
            const second = vi.fn(async () => false);
            const policy = anyOf([first, second]);

            const result = await policy({ req, auth: { userId: '1' } });

            expect(result).toBe(true);
            expect(first).toHaveBeenCalledTimes(1);
            expect(second).not.toHaveBeenCalled();
        });

        it('not inverts policy results', async () => {
            const policy = not(async () => true);
            const result = await policy({ req, auth: { userId: '1' } });

            expect(result).toBe(false);
        });
    });

    describe('mergeHandlerSecurityDefaults', () => {
        it('shallow merges access/security/errors', () => {
            const merged = mergeHandlerSecurityDefaults(
                {
                    access: 'protected',
                    security: {
                        authenticate: async () => ({ userId: '1' }),
                    },
                    errors: {
                        unauthenticated: () => new createHttpError.Unauthorized('Auth'),
                    },
                },
                {
                    access: 'optional',
                    security: {
                        authorize: { afterValidation: [async () => true] },
                    },
                    errors: {
                        unauthorized: () => new createHttpError.Forbidden('Denied'),
                    },
                },
            );

            expect(merged.access).toBe('optional');
            expect(merged.security?.authenticate).toBeDefined();
            expect(merged.security?.authorize).toBeDefined();
            expect(merged.errors?.unauthenticated).toBeDefined();
            expect(merged.errors?.unauthorized).toBeDefined();
        });

        it('inherits a factory authorize bucket the handler omits', () => {
            const beforePolicy = async () => true;
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
            const defaultPolicy = async () => true;
            const handlerPolicy = async () => false;
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
