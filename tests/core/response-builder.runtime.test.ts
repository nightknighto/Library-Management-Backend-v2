import { buildPaginationMeta, buildSuccessResponsePayload } from '../../src/core/response-builder.core';

describe('response-builder (runtime)', () => {
    it('computes offset and hasNextPage when missing', () => {
        const meta = buildPaginationMeta({
            totalCount: 15,
            page: 2,
            limit: 10,
        });

        expect(meta).toEqual({
            totalCount: 15,
            limit: 10,
            offset: 10,
            hasNextPage: false,
        });
    });

    it('respects explicit offset and hasNextPage values', () => {
        const meta = buildPaginationMeta({
            totalCount: 100,
            page: 1,
            limit: 10,
            offset: 5,
            hasNextPage: true,
        });

        expect(meta).toEqual({
            totalCount: 100,
            limit: 10,
            offset: 5,
            hasNextPage: true,
        });
    });

    it('builds a success payload without pagination when omitted', () => {
        const payload = buildSuccessResponsePayload({
            data: { message: 'ok' },
            timestamp: '2026-05-12T00:00:00.000Z',
        });

        expect(payload).toEqual({
            success: true,
            data: { message: 'ok' },
            meta: {
                timestamp: '2026-05-12T00:00:00.000Z',
                pagination: undefined,
            },
        });
    });
});
