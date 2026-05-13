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

        expect((contract as { paginated?: boolean }).paginated).toBeUndefined();
    });

    it('requires pagination metadata when paginated is true', () => {
        const contract = createContract({
            request: {},
            response: z.object({ id: z.string() }),
            paginated: true,
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
        expect((contract as { paginated?: boolean }).paginated).toBe(true);
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
});
