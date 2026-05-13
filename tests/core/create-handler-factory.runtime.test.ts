import createHttpError from 'http-errors';
import request from 'supertest';
import { z } from 'zod';
import { createContract } from '../../src/core/create-contract.core';
import { createHandlerFactory } from '../../src/core/create-handler.core';
import { createTestApp } from './test-utils';

describe('createHandlerFactory (runtime)', () => {
    it('throws when public defaults include security', () => {
        expect(() =>
            createHandlerFactory({
                access: 'public',
                security: {
                    authenticate: async () => null,
                },
            } as any),
        ).toThrow('createHandlerFactory: public access cannot define security defaults');
    });

    it('applies default access when options omit access', async () => {
        const contract = createContract({
            request: {},
            response: z.object({ ok: z.boolean() }),
        });

        const factory = createHandlerFactory({
            access: 'protected',
            security: {
                authenticate: async () => null,
            },
        });

        const handler = factory(contract, async () => ({ data: { ok: true } }));

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ success: false, error: 'Unauthenticated' });
    });

    it('allows overriding access to optional per handler', async () => {
        const contract = createContract({
            request: {},
            response: z.object({ ok: z.boolean() }),
        });

        const factory = createHandlerFactory({
            access: 'protected',
            security: {
                authenticate: async () => null,
            },
        });

        const handler = factory(
            contract,
            { access: 'optional' },
            async () => ({ data: { ok: true } }),
        );

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route);

        expect(response.status).toBe(200);
    });

    it('inherits validateBeforeAuthorization defaults', async () => {
        const contract = createContract({
            request: {
                query: {
                    page: z.coerce.number(),
                },
            },
            response: z.object({ ok: z.boolean() }),
        });

        const authorize = vi.fn(async ({ req }) => typeof req.query.page === 'number');

        const factory = createHandlerFactory({
            access: 'protected',
            security: {
                authenticate: async () => ({ userId: '1' }),
                authorize,
                validateBeforeAuthorization: true,
            },
        });

        const handler = factory(contract, async () => ({ data: { ok: true } }));

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route).query({ page: '2' });

        expect(response.status).toBe(200);
        expect(authorize).toHaveBeenCalledTimes(1);
    });

    it('allows overriding validateBeforeAuthorization per handler', async () => {
        const contract = createContract({
            request: {
                query: {
                    page: z.coerce.number(),
                },
            },
            response: z.object({ ok: z.boolean() }),
        });

        const authorize = vi.fn(async ({ req }) => typeof req.query.page === 'number');

        const factory = createHandlerFactory({
            access: 'protected',
            security: {
                authenticate: async () => ({ userId: '1' }),
                authorize,
                validateBeforeAuthorization: true,
            },
            errors: {
                unauthorized: () => new createHttpError.Forbidden('Denied'),
            },
        });

        const handler = factory(
            contract,
            {
                security: {
                    validateBeforeAuthorization: false,
                },
            },
            async () => ({ data: { ok: true } }),
        );

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route).query({ page: '2' });

        expect(response.status).toBe(403);
        expect(response.body).toEqual({ success: false, error: 'Denied' });
    });
});
