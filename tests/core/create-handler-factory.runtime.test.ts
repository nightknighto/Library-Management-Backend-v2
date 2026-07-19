import createHttpError from 'http-errors';
import request from 'supertest';
import { z } from 'zod';
import { createContract } from '../../src/core/create-contract.core';
import { createHandlerFactory } from '../../src/core/create-handler.core';
import { createAuthenticator } from '../../src/core/security.core';
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

    it("inherits the factory authenticator's onMissingCredentials default", async () => {
        const contract = createContract({
            request: {},
            response: z.object({ ok: z.boolean() }),
        });

        const authenticate = createAuthenticator(async () => null, {
            onMissingCredentials: () => new createHttpError.Unauthorized('Missing Bearer token'),
        });

        const factory = createHandlerFactory({
            access: 'protected',
            security: { authenticate },
        });

        const handler = factory(contract, async () => ({ data: { ok: true } }));

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ success: false, error: 'Missing Bearer token' });
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

        const authorize = vi.fn(async ({ req }): Promise<true> => {
            if (typeof req.query.page !== 'number') throw new createHttpError.Forbidden('denied');
            return true;
        });

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

    it('handler authorize bucket concatenates with the factory default bucket (additive semantics)', async () => {
        const contract = createContract({
            request: {
                query: {
                    page: z.coerce.number(),
                },
            },
            response: z.object({ ok: z.boolean() }),
        });

        const denyPolicy = vi.fn(async () => {
            throw new createHttpError.Forbidden('factory-deny');
        });
        const allowPolicy = vi.fn(async (): Promise<true> => true);

        const factory = createHandlerFactory({
            access: 'protected',
            security: {
                authenticate: async () => ({ userId: '1' }),
                authorize: { afterValidation: [denyPolicy] },
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

        // factory's denyPolicy is NO LONGER erased by the instance's allowPolicy:
        // buckets concatenate (factory-first), so denyPolicy runs and short-circuits to 403.
        expect(response.status).toBe(403);
        expect(response.body).toEqual({ success: false, error: 'factory-deny' });
        expect(denyPolicy).toHaveBeenCalledTimes(1);
        expect(allowPolicy).not.toHaveBeenCalled();
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

        const beforePolicy = vi.fn(async (): Promise<true> => true);
        const afterPolicy = vi.fn(async ({ req }): Promise<true> => {
            if (typeof req.query.page !== 'number') throw new createHttpError.Forbidden('denied');
            return true;
        });

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

    it('concatenates factory and instance authorizers across buckets with no dedup', async () => {
        const contract = createContract({
            request: {
                query: {
                    page: z.coerce.number(),
                },
            },
            response: z.object({ ok: z.boolean() }),
        });

        const sharedPolicy = vi.fn(async (): Promise<true> => true);
        const instanceAfterPolicy = vi.fn(async ({ req }): Promise<true> => {
            if (typeof req.query.page !== 'number') throw new createHttpError.Forbidden('denied');
            return true;
        });

        const factory = createHandlerFactory({
            access: 'protected',
            security: {
                authenticate: async () => ({ userId: '1' }),
                authorize: { beforeValidation: [sharedPolicy] },
            },
        });

        const handler = factory(
            contract,
            {
                security: {
                    // sharedPolicy is re-declared here in a different bucket. Because buckets
                    // concatenate and there is no dedup, this is a different bucket entirely,
                    // so it runs once here too — total twice across the request.
                    authorize: {
                        afterValidation: [sharedPolicy, instanceAfterPolicy],
                    },
                },
            },
            async () => ({ data: { ok: true } }),
        );

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route).query({ page: '2' });

        expect(response.status).toBe(200);
        // Cross-bucket coexistence: factory beforeValidation + instance afterValidation both run.
        // No dedup: the same sharedPolicy reference runs once per bucket it appears in (twice total).
        expect(sharedPolicy).toHaveBeenCalledTimes(2);
        expect(instanceAfterPolicy).toHaveBeenCalledTimes(1);
    });

    // -------------------------------------------------------------------------
    // .extend() — factory-extends-factory
    // -------------------------------------------------------------------------

    it('.extend layers child authorizers additively on top of the parent factory', async () => {
        const contract = createContract({
            request: {},
            response: z.object({ ok: z.boolean() }),
        });

        const parentPolicy = vi.fn(async (): Promise<true> => true);
        const childPolicy = vi.fn(async (): Promise<true> => true);

        const parent = createHandlerFactory({
            access: 'protected',
            security: {
                authenticate: async () => ({ userId: '1' }),
                authorize: { afterValidation: [parentPolicy] },
            },
        });

        const child = parent.extend({
            security: { authorize: { afterValidation: [childPolicy] } },
        });

        const handler = child(contract, async () => ({ data: { ok: true } }));

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route);

        expect(response.status).toBe(200);
        expect(parentPolicy).toHaveBeenCalledTimes(1);
        expect(childPolicy).toHaveBeenCalledTimes(1);
    });

    it('.extend strips a child authenticate (transitive lock) and keeps the parent authenticator', async () => {
        const contract = createContract({
            request: {},
            response: z.object({ ok: z.boolean() }),
        });

        const parentAuthenticate = vi.fn(async () => ({ userId: 'parent' }));
        // Simulate a caller bypassing types to inject a rogue authenticator.
        const rogueAuthenticate = vi.fn(async () => ({ userId: 'rogue' }));
        // Records which authenticator produced the auth context that the pipeline sees.
        const seenUserId = vi.fn();

        const parent = createHandlerFactory({
            access: 'protected',
            security: { authenticate: parentAuthenticate },
        });

        const child = parent.extend({
            security: {
                authenticate: rogueAuthenticate as any,
                authorize: { afterValidation: [async ({ auth }): Promise<true> => (seenUserId(auth.userId), true)] },
            } as any,
        });

        const handler = child(contract, async () => ({ data: { ok: true } }));

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route);

        expect(response.status).toBe(200);
        // The pipeline ran the PARENT authenticator (first-setter-wins lock).
        expect(parentAuthenticate).toHaveBeenCalledTimes(1);
        expect(rogueAuthenticate).not.toHaveBeenCalled();
        // The authorizer saw the parent's auth context, not the rogue's.
        expect(seenUserId).toHaveBeenCalledWith('parent');
    });

    it('.extend on a public factory upgrades to protected', async () => {
        const contract = createContract({
            request: {},
            response: z.object({ ok: z.boolean() }),
        });

        const publicFactory = createHandlerFactory({ access: 'public' });

        const secured = publicFactory.extend({
            access: 'protected',
            security: { authenticate: async () => null },
        });

        const handler = secured(contract, async () => ({ data: { ok: true } }));

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route);

        // Upgraded factory now rejects unauthenticated requests.
        expect(response.status).toBe(401);
        expect(response.body).toEqual({ success: false, error: 'Unauthenticated' });
    });

    it('chained .extend accumulates authorizers across three layers', async () => {
        const contract = createContract({
            request: {},
            response: z.object({ ok: z.boolean() }),
        });

        const layer1 = vi.fn(async (): Promise<true> => true);
        const layer2 = vi.fn(async (): Promise<true> => true);
        const layer3 = vi.fn(async (): Promise<true> => true);

        const base = createHandlerFactory({
            access: 'protected',
            security: {
                authenticate: async () => ({ userId: '1' }),
                authorize: { afterValidation: [layer1] },
            },
        });

        const derived = base
            .extend({ security: { authorize: { afterValidation: [layer2] } } })
            .extend({ security: { authorize: { afterValidation: [layer3] } } });

        const handler = derived(contract, async () => ({ data: { ok: true } }));

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route);

        expect(response.status).toBe(200);
        expect(layer1).toHaveBeenCalledTimes(1);
        expect(layer2).toHaveBeenCalledTimes(1);
        expect(layer3).toHaveBeenCalledTimes(1);
    });

    it('.extend with no access inherits the parent access', async () => {
        const contract = createContract({
            request: {},
            response: z.object({ ok: z.boolean() }),
        });

        const parent = createHandlerFactory({
            access: 'protected',
            security: { authenticate: async () => ({ userId: '1' }) },
        });

        const child = parent.extend({
            security: { authorize: { afterValidation: [async () => true] } },
        });

        // No access override → protected. Missing creds still 401.
        const childWithNoAuth = createHandlerFactory({
            access: 'protected',
            security: { authenticate: async () => null },
        }).extend({});

        const handler = childWithNoAuth(contract, async () => ({ data: { ok: true } }));

        const { app, route } = createTestApp(handler);
        const response = await request(app).get(route);

        expect(response.status).toBe(401);
        // child (with valid auth) still works — sanity that inheritance keeps the pipeline.
        const okHandler = child(contract, async () => ({ data: { ok: true } }));
        const okApp = createTestApp(okHandler);
        const okResponse = await request(okApp.app).get(okApp.route);
        expect(okResponse.status).toBe(200);
    });

    it('.extend runs a shape-bound child authorizer against the validated request at runtime', async () => {
        // A child authorizer that depends on contract-validated request data
        // (params.isbn). Runtime guard: the type-level requirement that the
        // contract provides params.isbn must be matched by runtime behavior —
        // the authorizer actually receives the validated param.
        const contract = createContract({
            request: { params: { isbn: z.string() } },
            response: z.object({ ok: z.boolean() }),
        });

        const seenIsbn = vi.fn((_: string) => {});

        const parent = createHandlerFactory({
            access: 'protected',
            security: { authenticate: async () => ({ userId: '1' }) },
        });

        const child = parent.extend({
            security: {
                authorize: {
                    afterValidation: [
                        async ({ req }): Promise<true> => {
                            seenIsbn(req.params.isbn);
                            return true;
                        },
                    ],
                },
            },
        });

        const handler = child(contract, async () => ({ data: { ok: true } }));

        const { app } = createTestApp(handler, { route: '/books/:isbn' });
        const response = await request(app).get('/books/9780000000001');

        expect(response.status).toBe(200);
        expect(seenIsbn).toHaveBeenCalledTimes(1);
        expect(seenIsbn).toHaveBeenCalledWith('9780000000001');
    });
});
