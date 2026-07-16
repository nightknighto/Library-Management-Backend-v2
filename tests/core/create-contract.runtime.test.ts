import { z } from 'zod';
import { createContract } from '../../src/core/create-contract.core';

describe('createContract (runtime)', () => {
    it('builds non-paginated success and error response schemas', () => {
        const contract = createContract({
            request: {},
            response: z.object({ message: z.string() }),
        });

        const success = contract.response.parse({
            success: true,
            data: { message: 'ok' },
            meta: { timestamp: new Date().toISOString() },
        });

        expect(success.success).toBe(true);
        expect(success.data).toEqual({ message: 'ok' });
        expect('pagination' in success.meta).toBe(false);

        const error = contract.response.parse({
            success: false,
            error: 'Bad request',
        });

        expect(error).toEqual({ success: false, error: 'Bad request' });
        const errorWithoutPayload = contract.response.parse({
            success: false,
        });
        expect(errorWithoutPayload).toEqual({ success: false, error: undefined });

        expect((contract as { pagination?: unknown }).pagination).toBeUndefined();
    });

    it('requires pagination metadata when pagination.response is true', () => {
        const contract = createContract({
            request: {},
            response: z.object({ id: z.string() }),
            pagination: { response: true },
        });

        expect(() =>
            contract.response.parse({
                success: true,
                data: { id: '1' },
                meta: { timestamp: new Date().toISOString() },
            }),
        ).toThrow();

        const success = contract.response.parse({
            success: true,
            data: { id: '1' },
            meta: {
                timestamp: new Date().toISOString(),
                pagination: {
                    totalCount: 10,
                    limit: 5,
                    offset: 0,
                    hasNextPage: true,
                },
            },
        });

        expect(success.success).toBe(true);
        expect(contract.pagination?.response).toBe(true);
    });

    it('strips pagination metadata for non-paginated contracts', () => {
        const contract = createContract({
            request: {},
            response: z.string(),
        });

        const timestamp = new Date().toISOString();
        const result = contract.response.parse({
            success: true,
            data: 'ok',
            meta: {
                timestamp,
                pagination: {
                    totalCount: 1,
                    limit: 1,
                    offset: 0,
                    hasNextPage: false,
                },
            },
        });

        expect(result.meta).toEqual({ timestamp });
    });

    it('injects pagination request defaults when pagination.request is enabled', () => {
        const contract = createContract({
            request: {
                query: {
                    q: z.string().optional(),
                },
            },
            response: z.array(z.string()),
            pagination: {
                request: {
                    defaults: { page: 2, limit: 5 },
                    maxLimit: 10,
                },
            },
        });

        const parsed = contract.request.parse({
            body: undefined,
            query: { q: 'test' },
            params: undefined,
        });

        expect(parsed.query.page).toBe(2);
        expect(parsed.query.limit).toBe(5);

        const coerced = contract.request.parse({
            body: undefined,
            query: { page: '3', limit: '7' },
            params: undefined,
        });

        expect(coerced.query.page).toBe(3);
        expect(coerced.query.limit).toBe(7);

        expect(() =>
            contract.request.parse({
                body: undefined,
                query: { limit: 50 },
                params: undefined,
            }),
        ).toThrow();
    });

    it('keeps user-defined page/limit when pagination.request is enabled', () => {
        const contract = createContract({
            request: {
                query: {
                    page: z.coerce.number().default(9),
                    limit: z.coerce.number().default(77),
                },
            },
            response: z.array(z.string()),
            pagination: {
                request: {
                    defaults: { page: 1, limit: 10 },
                    maxLimit: 100,
                },
            },
        });

        const parsed = contract.request.parse({
            body: undefined,
            query: {},
            params: undefined,
        });

        expect(parsed.query.page).toBe(9);
        expect(parsed.query.limit).toBe(77);
    });

    it('accepts z.object for body and validates correctly', () => {
        const contract = createContract({
            request: {
                body: z.object({
                    name: z.string().min(1),
                    age: z.number().int().positive(),
                }),
            },
            response: z.object({ id: z.string() }),
        });

        const valid = contract.request.parse({
            body: { name: 'Alice', age: 30 },
            query: undefined,
            params: undefined,
        });
        expect(valid.body).toEqual({ name: 'Alice', age: 30 });

        expect(() =>
            contract.request.parse({
                body: { name: '', age: -1 },
                query: undefined,
                params: undefined,
            }),
        ).toThrow();
    });

    it('respects z.strictObject mode when provided as body', () => {
        const contract = createContract({
            request: {
                body: z.strictObject({
                    name: z.string(),
                }),
            },
            response: z.string(),
        });

        expect(() =>
            contract.request.parse({
                body: { name: 'Alice', extra: 'not allowed' },
                query: undefined,
                params: undefined,
            }),
        ).toThrow();
    });

    it('respects z.object passthrough mode when provided as body', () => {
        const contract = createContract({
            request: {
                body: z.object({ name: z.string() }).passthrough(),
            },
            response: z.string(),
        });

        const result = contract.request.parse({
            body: { name: 'Alice', extra: 'allowed' },
            query: undefined,
            params: undefined,
        });
        expect(result.body).toEqual({ name: 'Alice', extra: 'allowed' });
    });

    it('accepts z.object for params and validates correctly', () => {
        const contract = createContract({
            request: {
                params: z.object({
                    id: z.string().uuid(),
                    slug: z.string(),
                }),
            },
            response: z.string(),
        });

        const valid = contract.request.parse({
            body: undefined,
            query: undefined,
            params: { id: '123e4567-e89b-12d3-a456-426614174000', slug: 'my-post' },
        });
        expect(valid.params).toEqual({
            id: '123e4567-e89b-12d3-a456-426614174000',
            slug: 'my-post',
        });

        expect(() =>
            contract.request.parse({
                body: undefined,
                query: undefined,
                params: { id: 'not-a-uuid', slug: 'my-post' },
            }),
        ).toThrow();
    });

    it('accepts discriminated union for body and validates both variants', () => {
        const contract = createContract({
            request: {
                body: z.discriminatedUnion('type', [
                    z.object({
                        type: z.literal('book'),
                        title: z.string().min(1),
                        isbn: z.string(),
                    }),
                    z.object({
                        type: z.literal('magazine'),
                        title: z.string().min(1),
                        issue: z.number().int().positive(),
                    }),
                ]),
            },
            response: z.object({ id: z.string() }),
        });

        const book = contract.request.parse({
            body: { type: 'book', title: 'TS Guide', isbn: '978-0' },
            query: undefined,
            params: undefined,
        });
        expect(book.body).toEqual({ type: 'book', title: 'TS Guide', isbn: '978-0' });

        const magazine = contract.request.parse({
            body: { type: 'magazine', title: 'Code Monthly', issue: 42 },
            query: undefined,
            params: undefined,
        });
        expect(magazine.body).toEqual({
            type: 'magazine',
            title: 'Code Monthly',
            issue: 42,
        });

        expect(() =>
            contract.request.parse({
                body: { type: 'book', title: '', isbn: '978-0' },
                query: undefined,
                params: undefined,
            }),
        ).toThrow();

        expect(() =>
            contract.request.parse({
                body: { type: 'unknown', title: 'Test' },
                query: undefined,
                params: undefined,
            }),
        ).toThrow();
    });

    it('accepts z.union for body', () => {
        const contract = createContract({
            request: {
                body: z.union([
                    z.object({ name: z.string() }),
                    z.object({ id: z.number() }),
                ]),
            },
            response: z.string(),
        });

        const byName = contract.request.parse({
            body: { name: 'Alice' },
            query: undefined,
            params: undefined,
        });
        expect(byName.body).toEqual({ name: 'Alice' });

        const byId = contract.request.parse({
            body: { id: 42 },
            query: undefined,
            params: undefined,
        });
        expect(byId.body).toEqual({ id: 42 });

        expect(() =>
            contract.request.parse({
                body: { foo: 'bar' },
                query: undefined,
                params: undefined,
            }),
        ).toThrow();
    });

    it('accepts z.object with .refine() for body', () => {
        const contract = createContract({
            request: {
                body: z
                    .object({
                        password: z.string(),
                        confirm: z.string(),
                    })
                    .refine((data) => data.password === data.confirm, {
                        message: 'Passwords must match',
                        path: ['confirm'],
                    }),
            },
            response: z.string(),
        });

        const valid = contract.request.parse({
            body: { password: 'secret', confirm: 'secret' },
            query: undefined,
            params: undefined,
        });
        expect(valid.body).toEqual({ password: 'secret', confirm: 'secret' });

        expect(() =>
            contract.request.parse({
                body: { password: 'secret', confirm: 'different' },
                query: undefined,
                params: undefined,
            }),
        ).toThrow();
    });

    it('accepts z.object with .transform() for body', () => {
        const contract = createContract({
            request: {
                body: z
                    .object({ ids: z.string() })
                    .transform((data) => ({ ids: data.ids.split(',') })),
            },
            response: z.number(),
        });

        const result = contract.request.parse({
            body: { ids: 'a,b,c' },
            query: undefined,
            params: undefined,
        });
        expect(result.body).toEqual({ ids: ['a', 'b', 'c'] });
    });

    it('accepts mixed z.object body/params with plain query', () => {
        const contract = createContract({
            request: {
                body: z.object({ name: z.string(), email: z.string().email() }),
                params: z.object({ userId: z.string().uuid() }),
                query: { verbose: z.coerce.boolean().default(false) },
            },
            response: z.boolean(),
        });

        const valid = contract.request.parse({
            body: { name: 'Alice', email: 'alice@test.com' },
            params: { userId: '123e4567-e89b-12d3-a456-426614174000' },
            query: {},
        });
        expect(valid.body).toEqual({ name: 'Alice', email: 'alice@test.com' });
        expect(valid.params).toEqual({
            userId: '123e4567-e89b-12d3-a456-426614174000',
        });
        expect(valid.query).toEqual({ verbose: false });
    });

    // ------------------------------------------------------------------
    // Fragment accessors: .bodySchema / .paramsSchema / .responseDataSchema
    // ------------------------------------------------------------------
    describe('fragment accessors', () => {
        it('exposes body/params/responseData schemas that parse the same as the request field', () => {
            const contract = createContract({
                request: {
                    body: { name: z.string(), age: z.number().int() },
                    params: { id: z.string().uuid() },
                },
                response: z.object({ ok: z.boolean() }),
            });

            // bodySchema parses the same as the body field the request validates
            expect(contract.bodySchema.parse({ name: 'Alice', age: 30 })).toEqual({
                name: 'Alice',
                age: 30,
            });
            // age must be an integer, so a non-integer is invalid
            expect(() => contract.bodySchema.parse({ name: 'Alice', age: 1.5 })).toThrow();

            // paramsSchema parses the same as the params field
            expect(
                contract.paramsSchema.parse({ id: '123e4567-e89b-12d3-a456-426614174000' }),
            ).toEqual({ id: '123e4567-e89b-12d3-a456-426614174000' });
            expect(() => contract.paramsSchema.parse({ id: 'nope' })).toThrow();

            // responseDataSchema parses the data, not the envelope
            expect(contract.responseDataSchema.parse({ ok: true })).toEqual({ ok: true });
        });

        it('responseDataSchema is the data schema, not the success/error envelope', () => {
            const contract = createContract({
                request: {},
                response: z.object({ id: z.string() }),
            });

            const envelope = {
                success: true as const,
                data: { id: '1' },
                meta: { timestamp: new Date().toISOString() },
            };

            // the full envelope validates against .response
            expect(contract.response.parse(envelope).success).toBe(true);

            // the envelope is NOT data, so it must fail against responseDataSchema
            expect(() => contract.responseDataSchema.parse(envelope)).toThrow();
            // ...but the data value alone parses
            expect(contract.responseDataSchema.parse({ id: '1' })).toEqual({ id: '1' });
        });

        it('a contract built from another contract accessors produces an identical response envelope', () => {
            const source = createContract({
                request: {
                    body: { title: z.string() },
                    params: { isbn: z.string() },
                },
                response: z.object({ id: z.string(), title: z.string() }),
            });

            const reused = createContract({
                request: {
                    body: source.bodySchema.partial(),
                    params: source.paramsSchema,
                },
                response: source.responseDataSchema,
            });

            const envelope = {
                success: true as const,
                data: { id: '1', title: 'Reused' },
                meta: { timestamp: new Date().toISOString() },
            };

            // both contracts accept the same response envelope
            const sourceParsed = source.response.parse(envelope);
            const reusedParsed = reused.response.parse(envelope);
            expect(sourceParsed).toEqual(reusedParsed);

            // and both reject a mismatched data shape
            expect(() =>
                source.response.parse({ ...envelope, data: { id: '1' /* missing title */ } }),
            ).toThrow();
            expect(() =>
                reused.response.parse({ ...envelope, data: { id: '1' /* missing title */ } }),
            ).toThrow();
        });

        it('exposes accessors for a paginated contract (authored query excluded from the accessors by design)', () => {
            const contract = createContract({
                request: {
                    body: { q: z.string() },
                },
                response: z.array(z.object({ isbn: z.string() })),
                pagination: { response: true },
            });

            // bodySchema parses the authored body
            expect(contract.bodySchema.parse({ q: 'test' })).toEqual({ q: 'test' });
            // responseDataSchema is the data array, not the envelope
            expect(contract.responseDataSchema.parse([{ isbn: '978-0' }])).toEqual([
                { isbn: '978-0' },
            ]);
            expect(contract.pagination?.response).toBe(true);
        });
    });
});
