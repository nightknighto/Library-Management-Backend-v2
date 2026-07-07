import createHttpError from 'http-errors';
import request from 'supertest';
import { z } from 'zod';
import { createContract } from '../../src/core/create-contract.core';
import { createHandler } from '../../src/core/create-handler.core';
import { createAuthenticator } from '../../src/core/security.core';
import { createTestApp, isValidIsoTimestamp } from './test-utils';

describe('createHandler (runtime)', () => {
    it('returns a success envelope for public handlers', async () => {
        const contract = createContract({
            request: {},
            response: z.object({ message: z.string() }),
        });

        const handler = createHandler(contract, async () => ({
            data: { message: 'ok' },
        }));

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual({ message: 'ok' });
        expect(isValidIsoTimestamp(response.body.meta.timestamp)).toBe(true);
    });

    it('respects statusCode overrides', async () => {
        const contract = createContract({
            request: {},
            response: z.object({ message: z.string() }),
        });

        const handler = createHandler(contract, async () => ({
            statusCode: 201,
            data: { message: 'created' },
        }));

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route);

        expect(response.status).toBe(201);
    });

    it('throws at creation time when protected and no authenticator is provided', () => {
        const contract = createContract({
            request: {},
            response: z.object({ ok: z.boolean() }),
        });

        expect(() =>
            createHandler(
                contract,
                { access: 'protected' },
                async () => ({ data: { ok: true } }),
            ),
        ).toThrow('require an authenticate function');
    });

    it('allows optional access when authentication returns null', async () => {
        const contract = createContract({
            request: {},
            response: z.object({ ok: z.boolean() }),
        });

        let seenAuth: unknown = 'unset';

        const handler = createHandler(
            contract,
            {
                access: 'optional',
                security: {
                    authenticate: async () => null,
                },
            },
            async ({ req, auth }) => {
                seenAuth = auth;
                return { data: { ok: true } };
            },
        );

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route);

        expect(response.status).toBe(200);
        expect(seenAuth).toBeUndefined();
    });

    it('rejects invalid auth payloads using authSchema', async () => {
        const contract = createContract({
            request: {},
            response: z.object({ ok: z.boolean() }),
        });

        const handler = createHandler(
            contract,
            {
                access: 'protected',
                security: {
                    authenticate: async () => ({ email: 'nope' }),
                    authSchema: z.object({ email: z.string().email() }),
                },
            },
            async () => ({ data: { ok: true } }),
        );

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            success: false,
            error: 'Invalid authentication data',
        });
    });

    it('fails closed: an authenticator failure renders 401 even for optional access', async () => {
        const contract = createContract({
            request: {},
            response: z.object({ ok: z.boolean() }),
        });

        const handler = createHandler(
            contract,
            {
                access: 'optional',
                security: {
                    authenticate: async () => {
                        throw new createHttpError.Unauthorized('Invalid or expired token');
                    },
                },
            },
            async () => ({ data: { ok: true } }),
        );

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            success: false,
            error: 'Invalid or expired token',
        });
    });

    it("uses the authenticator's onMissingCredentials default for protected no-credentials", async () => {
        const contract = createContract({
            request: {},
            response: z.object({ ok: z.boolean() }),
        });

        const authenticate = createAuthenticator(async () => null, {
            onMissingCredentials: () => new createHttpError.Unauthorized('Missing Bearer token'),
        });

        const handler = createHandler(
            contract,
            { access: 'protected', security: { authenticate } },
            async () => ({ data: { ok: true } }),
        );

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ success: false, error: 'Missing Bearer token' });
    });

    it('runs the beforeValidation bucket on the raw request (fail-fast)', async () => {
        const contract = createContract({
            request: {
                query: {
                    page: z.coerce.number(),
                },
            },
            response: z.object({ ok: z.boolean() }),
        });

        // raw req.query.page is the string '2' before coercion
        const authorize = vi.fn(async ({ req }): Promise<true> => {
            if (typeof req.query.page !== 'number') throw new createHttpError.Forbidden('denied');
            return true;
        });
        const handlerFn = vi.fn(async () => ({ data: { ok: true } }));

        const handler = createHandler(
            contract,
            {
                access: 'protected',
                security: {
                    authenticate: async () => ({ userId: '1' }),
                    authorize: { beforeValidation: [authorize] },
                },
            },
            handlerFn,
        );

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route).query({ page: '2' });

        expect(response.status).toBe(403);
        expect(authorize).toHaveBeenCalledTimes(1);
        expect(handlerFn).not.toHaveBeenCalled();
    });

    it('runs the afterValidation bucket on the validated request', async () => {
        const contract = createContract({
            request: {
                query: {
                    page: z.coerce.number(),
                },
            },
            response: z.object({ ok: z.boolean() }),
        });

        // validated req.query.page is the number 2 after coercion
        const authorize = vi.fn(async ({ req }): Promise<true> => {
            if (typeof req.query.page !== 'number') throw new createHttpError.Forbidden('denied');
            return true;
        });

        const handler = createHandler(
            contract,
            {
                access: 'protected',
                security: {
                    authenticate: async () => ({ userId: '1' }),
                    authorize: { afterValidation: [authorize] },
                },
            },
            async () => ({ data: { ok: true } }),
        );

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route).query({ page: '2' });

        expect(response.status).toBe(200);
        expect(authorize).toHaveBeenCalledTimes(1);
    });

    it('runs both buckets; a beforeValidation denial skips validation and afterValidation', async () => {
        const contract = createContract({
            request: {
                query: {
                    page: z.coerce.number(),
                },
            },
            response: z.object({ ok: z.boolean() }),
        });

        const beforePolicy = vi.fn(async () => {
            throw new createHttpError.Forbidden('before-deny');
        });
        const afterPolicy = vi.fn(async (): Promise<true> => true);
        const handlerFn = vi.fn(async () => ({ data: { ok: true } }));

        const handler = createHandler(
            contract,
            {
                access: 'protected',
                security: {
                    authenticate: async () => ({ userId: '1' }),
                    authorize: {
                        beforeValidation: [beforePolicy],
                        afterValidation: [afterPolicy],
                    },
                },
            },
            handlerFn,
        );

        const { app, route } = createTestApp(handler);
        // request WITHOUT page -> would be a 400 if validation ran
        const response = await request(app).get(route);

        // 403 from beforeValidation proves validation was skipped (fail-fast)
        expect(response.status).toBe(403);
        expect(beforePolicy).toHaveBeenCalledTimes(1);
        expect(afterPolicy).not.toHaveBeenCalled();
        expect(handlerFn).not.toHaveBeenCalled();
    });

    it('runs both buckets; afterValidation receives the validated request', async () => {
        const contract = createContract({
            request: {
                query: {
                    page: z.coerce.number(),
                },
            },
            response: z.object({ ok: z.boolean() }),
        });

        const beforePolicy = vi.fn(async (): Promise<true> => true);
        // validated req.query.page is the number 2
        const afterPolicy = vi.fn(async ({ req }): Promise<true> => {
            if (typeof req.query.page !== 'number') throw new createHttpError.Forbidden('denied');
            return true;
        });

        const handler = createHandler(
            contract,
            {
                access: 'protected',
                security: {
                    authenticate: async () => ({ userId: '1' }),
                    authorize: {
                        beforeValidation: [beforePolicy],
                        afterValidation: [afterPolicy],
                    },
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

    it('returns 400 when request validation fails', async () => {
        const contract = createContract({
            request: {
                body: {
                    title: z.string(),
                },
            },
            response: z.object({ ok: z.boolean() }),
        });

        const handler = createHandler(contract, async () => ({ data: { ok: true } }));

        const { app, route } = createTestApp(handler, { method: 'post' });
        const response = await request(app).post(route).send({});

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error?.message).toBe('Request validation failed');
    });

    it('returns 500 when response validation fails and skips cookies', async () => {
        const contract = createContract({
            request: {},
            response: z.object({ count: z.number() }),
        });

        const handler = createHandler(contract, async () => ({
            data: { count: 'nope' },
            cookies: [
                { action: 'set', name: 'session', value: 'token' },
                { action: 'clear', name: 'legacy' },
            ],
        }));

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route);

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ success: false, error: 'Internal Server Error' });
        expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('sets and clears cookies on success', async () => {
        const contract = createContract({
            request: {},
            response: z.object({ ok: z.boolean() }),
        });

        const handler = createHandler(contract, async () => ({
            data: { ok: true },
            cookies: [
                { action: 'set', name: 'session', value: 'token' },
                { action: 'clear', name: 'legacy' },
            ],
        }));

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route);

        const cookies = response.headers['set-cookie'] as string[] | undefined;
        expect(cookies).toEqual(
            expect.arrayContaining([
                expect.stringContaining('session=token'),
                expect.stringContaining('legacy='),
            ]),
        );
    });

    it('requires pagination data for paginated contracts', async () => {
        const contract = createContract({
            request: {},
            response: z.array(z.number()),
            pagination: { response: true },
        });

        const handler = createHandler(contract, async () => ({
            data: [1, 2, 3],
        }));

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route);

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ success: false, error: 'Internal Server Error' });
    });

    it('computes pagination metadata for paginated contracts', async () => {
        const contract = createContract({
            request: {},
            response: z.array(z.number()),
            pagination: { response: true },
        });

        const handler = createHandler(contract, async () => ({
            data: [1, 2, 3],
            pagination: {
                totalCount: 5,
                page: 1,
                limit: 3,
            },
        }));

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route);

        expect(response.status).toBe(200);
        expect(response.body.meta.pagination).toEqual({
            totalCount: 5,
            limit: 3,
            offset: 0,
            hasNextPage: true,
        });
    });

    it('strips pagination data for non-paginated contracts', async () => {
        const contract = createContract({
            request: {},
            response: z.object({ ok: z.boolean() }),
        });

        const handler = createHandler(contract, async () => ({
            data: { ok: true },
            pagination: {
                totalCount: 5,
                page: 1,
                limit: 3,
            },
        }));

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route);

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ ok: true });
        expect(response.body.meta.pagination).toBeUndefined();
    });

    it('returns mapped HttpError responses from handlers', async () => {
        const contract = createContract({
            request: {},
            response: z.object({ ok: z.boolean() }),
        });

        const handler = createHandler(contract, async () => {
            throw new createHttpError.BadRequest('Bad input');
        });

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route);

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ success: false, error: 'Bad input' });
    });
});
