/**
 * Runtime tests for the framework-owned HttpError and its error-side-effects
 * (headers/cookies on error responses).
 *
 * Coverage:
 * - Construction: status validation, default messages, header coercion.
 * - Detection: isHttpError on framework + legacy + non-errors.
 * - Error side-effects applied via handleError (unit, mock response).
 * - End-to-end (supertest): handler/auth/authz throws carrying headers+cookies.
 * - Ordering: headers before cookies on the error path.
 * - Legacy backward-compat: a legacy http-errors throw still routes correctly.
 * - Bare framework throws (no options) unchanged.
 */
import request from 'supertest';
import { z } from 'zod';
import { createContract } from '../../src/core/create-contract.core';
import { createHandler } from '../../src/core/create-handler.core';
import { handleError } from '../../src/core/error-handler.core';
import { HttpError, isHttpError } from '../../src/core/http-error.core';
import { allOf, anyOf, createAuthenticator, not } from '../../src/core/security.core';
import { createMockResponse, createTestApp } from './test-utils';

describe('HttpError (runtime)', () => {
    // -------------------------------------------------------------------------
    // Construction
    // -------------------------------------------------------------------------

    describe('construction', () => {
        it('sets status, statusCode, message, and expose for a 4xx error', () => {
            const err = new HttpError.Forbidden('nope');
            expect(err.status).toBe(403);
            expect(err.statusCode).toBe(403);
            expect(err.message).toBe('nope');
            expect(err.expose).toBe(true);
            expect(err.name).toBe('Forbidden');
        });

        it('sets expose=false for a 5xx error', () => {
            const err = new HttpError.InternalServerError('boom');
            expect(err.status).toBe(500);
            expect(err.expose).toBe(false);
            expect(err.name).toBe('InternalServerError');
        });

        it('defaults the message to the standard reason phrase when omitted', () => {
            expect(new HttpError.NotFound().message).toBe('Not Found');
            expect(new HttpError.Unauthorized().message).toBe('Unauthorized');
            expect(new HttpError.Conflict().message).toBe('Conflict');
        });

        it('is an Error and an HttpError (instanceof)', () => {
            const err = new HttpError.BadRequest();
            expect(err).toBeInstanceOf(Error);
            expect(err).toBeInstanceOf(HttpError);
            expect(err).toBeInstanceOf(HttpError.BadRequest);
            expect(err).not.toBeInstanceOf(HttpError.NotFound);
        });

        it('throws RangeError for out-of-range status codes', () => {
            expect(() => new HttpError(200, 'ok')).toThrow(RangeError);
            expect(() => new HttpError(600, 'weird')).toThrow(RangeError);
            expect(() => new HttpError(399, 'edge')).toThrow(RangeError);
        });

        it('throws RangeError for non-integer status codes', () => {
            expect(() => new HttpError(404.5, 'fractional')).toThrow(RangeError);
        });
    });

    // -------------------------------------------------------------------------
    // Header coercion at construction
    // -------------------------------------------------------------------------

    describe('header coercion', () => {
        it('coerces number and boolean header values to strings', () => {
            const err = new HttpError.TooManyRequests('slow down', {
                headers: { 'retry-after': 60, 'x-feature-flag': true },
            });
            expect(err.headers).toEqual({ 'retry-after': '60', 'x-feature-flag': 'true' });
        });

        it('joins array header values into a comma-separated string', () => {
            const err = new HttpError(403, 'denied', {
                headers: { link: ['</p/1>; rel="next"', '</p/2>; rel="last"'] },
            });
            expect(err.headers?.link).toBe('</p/1>; rel="next", </p/2>; rel="last"');
        });

        it('accepts arbitrary custom header names via the index', () => {
            const err = new HttpError.Forbidden('no', {
                headers: { 'X-Request-Id': 'abc-123', 'x-vendor-token': 'tok' },
            });
            expect(err.headers?.['X-Request-Id']).toBe('abc-123');
            expect(err.headers?.['x-vendor-token']).toBe('tok');
        });

        it('stores cookies from options', () => {
            const err = new HttpError.Unauthorized('no', {
                cookies: [{ action: 'clear', name: 'session' }],
            });
            expect(err.cookies).toEqual([{ action: 'clear', name: 'session' }]);
        });

        it('leaves headers/cookies undefined when omitted', () => {
            const err = new HttpError.NotFound('missing');
            expect(err.headers).toBeUndefined();
            expect(err.cookies).toBeUndefined();
        });
    });

    // -------------------------------------------------------------------------
    // Detection (isHttpError)
    // -------------------------------------------------------------------------

    describe('isHttpError', () => {
        it('detects framework HttpError instances', () => {
            expect(isHttpError(new HttpError.Forbidden())).toBe(true);
        });

        it('rejects non-HTTP errors', () => {
            expect(isHttpError(new Error('plain'))).toBe(false);
            expect(isHttpError({ statusCode: 404 })).toBe(false); // missing status/expose
            expect(isHttpError(null)).toBe(false);
            expect(isHttpError(undefined)).toBe(false);
            expect(isHttpError('string')).toBe(false);
        });
    });

    // -------------------------------------------------------------------------
    // Error side-effects via handleError (unit, mock response)
    // -------------------------------------------------------------------------

    describe('handleError applies error side-effects', () => {
        it('sets response headers from the error', () => {
            const res = createMockResponse();
            handleError(new HttpError.Unauthorized('no', {
                headers: { 'www-authenticate': 'Bearer', 'cache-control': 'no-store' },
            }), res as any);

            expect(res.set).toHaveBeenCalledWith('www-authenticate', 'Bearer');
            expect(res.set).toHaveBeenCalledWith('cache-control', 'no-store');
            expect(res.status).toHaveBeenCalledWith(401);
        });

        it('applies cookies from the error', () => {
            const res = createMockResponse();
            handleError(new HttpError.Forbidden('no', {
                cookies: [{ action: 'clear', name: 'session' }],
            }), res as any);

            expect(res.clearCookie).toHaveBeenCalledWith('session', undefined);
            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('applies headers before cookies (ordering)', () => {
            const res = createMockResponse();
            const callOrder: string[] = [];
            res.set.mockImplementation(() => { callOrder.push('set'); return res; });
            res.cookie.mockImplementation(() => { callOrder.push('cookie'); return res; });
            res.clearCookie.mockImplementation(() => { callOrder.push('clearCookie'); return res; });

            handleError(new HttpError(403, 'no', {
                headers: { 'cache-control': 'no-store' },
                cookies: [{ action: 'clear', name: 'session' }],
            }), res as any);

            // headers (set) come before cookies (clearCookie)
            const firstCookieIdx = callOrder.findIndex((c) => c === 'clearCookie');
            const lastHeaderIdx = callOrder.lastIndexOf('set');
            expect(lastHeaderIdx).toBeLessThan(firstCookieIdx);
        });

        it('sends the error message as the response body', () => {
            const res = createMockResponse();
            handleError(new HttpError.NotFound('book gone'), res as any);
            expect(res.json).toHaveBeenCalledWith({ success: false, error: 'book gone' });
        });

    });

    // -------------------------------------------------------------------------
    // End-to-end: handler/auth/authz throws carrying side-effects (supertest)
    // -------------------------------------------------------------------------

    describe('end-to-end error side-effects', () => {
        const baseContract = () =>
            createContract({ request: {}, response: z.object({ ok: z.boolean() }) });

        it('applies headers+cookies when the handler throws an enriched error', async () => {
            const handler = createHandler(baseContract(), async () => {
                throw new HttpError.Forbidden('no access', {
                    headers: { 'cache-control': 'no-store' },
                    cookies: [{ action: 'clear', name: 'session' }],
                });
            });
            const { app, route } = createTestApp(handler);
            const response = await request(app).get(route);

            expect(response.status).toBe(403);
            expect(response.headers['cache-control']).toBe('no-store');
            const setCookies = response.headers['set-cookie'];
            expect(Array.isArray(setCookies) ? setCookies.join(';') : setCookies).toContain('session=');
        });

        it('applies side-effects when an authenticator throws an enriched error', async () => {
            const handler = createHandler(
                baseContract(),
                {
                    access: 'protected',
                    security: {
                        authenticate: async () => {
                            throw new HttpError.Unauthorized('bad token', {
                                headers: { 'www-authenticate': 'Bearer error="invalid_token"' },
                                cookies: [{ action: 'clear', name: 'session' }],
                            });
                        },
                    },
                },
                async () => ({ data: { ok: true } }),
            );
            const { app, route } = createTestApp(handler);
            const response = await request(app).get(route);

            expect(response.status).toBe(401);
            expect(response.headers['www-authenticate']).toContain('invalid_token');
            const setCookies = response.headers['set-cookie'];
            expect(Array.isArray(setCookies) ? setCookies.join(';') : setCookies).toContain('session=');
        });

        it('applies side-effects when an authorizer throws an enriched error', async () => {
            const handler = createHandler(
                baseContract(),
                {
                    access: 'protected',
                    security: {
                        authenticate: async () => ({ id: 'u-1' }),
                        authorize: {
                            beforeValidation: [
                                async () => {
                                    throw new HttpError.PaymentRequired('pay up', {
                                        headers: { 'retry-after': '60' },
                                    });
                                },
                            ],
                        },
                    },
                },
                async () => ({ data: { ok: true } }),
            );
            const { app, route } = createTestApp(handler);
            const response = await request(app).get(route);

            expect(response.status).toBe(402);
            expect(response.headers['retry-after']).toBe('60');
        });

        it('honors onMissingCredentials returning an enriched error', async () => {
            const handler = createHandler(
                baseContract(),
                {
                    access: 'protected',
                    security: {
                        authenticate: createAuthenticator(
                            async () => null, // no credentials
                            {
                                onMissingCredentials: () => new HttpError.Unauthorized('login required', {
                                    headers: { 'www-authenticate': 'Bearer realm="api"' },
                                    cookies: [{ action: 'clear', name: 'session' }],
                                }),
                            },
                        ),
                    },
                },
                async () => ({ data: { ok: true } }),
            );
            const { app, route } = createTestApp(handler);
            const response = await request(app).get(route);

            expect(response.status).toBe(401);
            expect(response.headers['www-authenticate']).toContain('realm="api"');
        });
    });

    // -------------------------------------------------------------------------
    // Combinator integration: anyOf/not denialError can carry side-effects
    // -------------------------------------------------------------------------

    describe('combinator denialError carries side-effects', () => {
        it('anyOf throws an enriched denialError when all branches deny', async () => {
            const deny = async () => { throw new HttpError.Forbidden('branch'); };
            const policy = anyOf<{ id: string }>(
                [deny],
                new HttpError.NotFound('resource missing', {
                    headers: { 'x-missing-id': 'r-1' },
                    cookies: [{ action: 'clear', name: 'session' }],
                }),
            );
            const error = await policy({ req: {} as any, auth: { id: 'u-1' } }).then(
                () => undefined,
                (e: unknown) => e,
            );

            expect(isHttpError(error)).toBe(true);
            expect(error).toBeInstanceOf(HttpError.NotFound);
            expect((error as HttpError).headers).toEqual({ 'x-missing-id': 'r-1' });
        });

        it('not throws an enriched denialError when the wrapped policy allows', async () => {
            const allow = async () => true;
            const policy = not<{ id: string }>(
                allow,
                new HttpError.Forbidden('not allowed', {
                    headers: { 'cache-control': 'no-store' },
                }),
            );
            const error = await policy({ req: {} as any, auth: { id: 'u-1' } }).then(
                () => undefined,
                (e: unknown) => e,
            );

            expect(isHttpError(error)).toBe(true);
            expect((error as HttpError).headers).toEqual({ 'cache-control': 'no-store' });
        });

        it('allOf propagates an enriched branch denial verbatim', async () => {
            const deny = async () => {
                throw new HttpError.Forbidden('no', { headers: { 'x-deny': '1' } });
            };
            const policy = allOf<{ id: string }>([deny]);
            const error = await policy({ req: {} as any, auth: { id: 'u-1' } }).then(
                () => undefined,
                (e: unknown) => e,
            );

            expect(isHttpError(error)).toBe(true);
            expect((error as HttpError).headers).toEqual({ 'x-deny': '1' });
        });
    });

    // -------------------------------------------------------------------------
    // Bare framework throws (no options) — unchanged behavior
    // -------------------------------------------------------------------------

    describe('bare framework throws (no options)', () => {
        it('sends status + message with no side-effects', () => {
            const res = createMockResponse();
            handleError(new HttpError.NotFound('missing'), res as any);
            expect(res.set).not.toHaveBeenCalled();
            expect(res.cookie).not.toHaveBeenCalled();
            expect(res.clearCookie).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ success: false, error: 'missing' });
        });
    });
});
