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

    it('throws when protected factory handler has no authenticate', () => {
        const contract = createContract({
            request: {},
            response: z.object({ ok: z.boolean() }),
        });

        const factory = createHandlerFactory({ access: 'protected' });

        expect(() =>
            factory(contract, async ({ req }) => ({ data: { ok: true } })),
        ).toThrow('require an authenticate function');
    });

    it('throws when optional factory handler has no authenticate', () => {
        const contract = createContract({
            request: {},
            response: z.object({ ok: z.boolean() }),
        });

        const factory = createHandlerFactory({ access: 'optional' });

        expect(() =>
            factory(contract, async ({ req }) => ({ data: { ok: true } })),
        ).toThrow('require an authenticate function');
    });

    it('throws when factory has authSchema but no authenticate and handler omits it', () => {
        const contract = createContract({
            request: {},
            response: z.object({ ok: z.boolean() }),
        });

        const factory = createHandlerFactory({
            access: 'protected',
            security: { authSchema: z.object({ userId: z.string() }) },
        });

        expect(() =>
            factory(contract, async ({ req }) => ({ data: { ok: true } })),
        ).toThrow('require an authenticate function');
    });

    it('succeeds when factory omits authenticate but handler provides it', async () => {
        const contract = createContract({
            request: {},
            response: z.object({ ok: z.boolean() }),
        });

        const factory = createHandlerFactory({ access: 'protected' });

        const handler = factory(
            contract,
            {
                security: { authenticate: async () => ({ userId: 'u-1' }) },
            },
            async ({ req, auth }) => ({ data: { ok: true } }),
        );

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route);

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ ok: true });
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

    it('inherits authorize bucket defaults from the factory', async () => {
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
                authorize: { afterValidation: [authorize] },
            },
        });

        const handler = factory(contract, async () => ({ data: { ok: true } }));

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route).query({ page: '2' });

        expect(response.status).toBe(200);
        expect(authorize).toHaveBeenCalledTimes(1);
    });

    it('handler authorize bucket replaces the factory default bucket (replace semantics)', async () => {
        const contract = createContract({
            request: {
                query: {
                    page: z.coerce.number(),
                },
            },
            response: z.object({ ok: z.boolean() }),
        });

        const denyPolicy = vi.fn(async () => false);
        const allowPolicy = vi.fn(async () => true);

        const factory = createHandlerFactory({
            access: 'protected',
            security: {
                authenticate: async () => ({ userId: '1' }),
                authorize: { afterValidation: [denyPolicy] },
            },
            errors: {
                unauthorized: () => new createHttpError.Forbidden('Denied'),
            },
        });

        const handler = factory(
            contract,
            {
                security: {
                    authorize: { afterValidation: [allowPolicy] },
                },
            },
            async () => ({ data: { ok: true } }),
        );

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route).query({ page: '2' });

        // handler's allowPolicy replaced factory's denyPolicy (not concatenated)
        expect(response.status).toBe(200);
        expect(denyPolicy).not.toHaveBeenCalled();
        expect(allowPolicy).toHaveBeenCalledTimes(1);
    });

    it('inherits the factory beforeValidation bucket while the handler adds an afterValidation bucket', async () => {
        const contract = createContract({
            request: {
                query: {
                    page: z.coerce.number(),
                },
            },
            response: z.object({ ok: z.boolean() }),
        });

        const beforePolicy = vi.fn(async () => true);
        const afterPolicy = vi.fn(async ({ req }) => typeof req.query.page === 'number');

        const factory = createHandlerFactory({
            access: 'protected',
            security: {
                authenticate: async () => ({ userId: '1' }),
                authorize: { beforeValidation: [beforePolicy] },
            },
        });

        const handler = factory(
            contract,
            {
                security: {
                    authorize: { afterValidation: [afterPolicy] },
                },
            },
            async () => ({ data: { ok: true } }),
        );

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route).query({ page: '2' });

        expect(response.status).toBe(200);
        expect(beforePolicy).toHaveBeenCalledTimes(1);
        expect(afterPolicy).toHaveBeenCalledTimes(1);
    });
});
