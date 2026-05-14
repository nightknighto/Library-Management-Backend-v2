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
});
