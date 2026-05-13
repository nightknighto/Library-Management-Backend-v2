import { z } from 'zod';
import { createRequestSchema } from '../../src/core/create-request-schema.core';

describe('createRequestSchema (runtime)', () => {
    it('fills omitted body/query/params with empty objects', () => {
        const schema = createRequestSchema({});

        const result = schema.parse({
            body: undefined,
            query: undefined,
            params: undefined,
        });

        expect(result).toEqual({
            body: {},
            query: {},
            params: {},
        });
    });

    it('rejects unknown body keys using strict parsing', () => {
        const schema = createRequestSchema({
            body: {
                name: z.string(),
            },
        });

        expect(() =>
            schema.parse({
                body: { name: 'Nova', extra: 'nope' },
                query: {},
                params: {},
            }),
        ).toThrow();
    });

    it('strips unknown query and params keys', () => {
        const schema = createRequestSchema({
            query: {
                page: z.number(),
            },
            params: {
                id: z.string(),
            },
        });

        const result = schema.parse({
            body: {},
            query: { page: 2, extra: 'ignore' },
            params: { id: 'abc', extra: 'ignore' },
        });

        expect(result.query).toEqual({ page: 2 });
        expect(result.params).toEqual({ id: 'abc' });
    });

    it('requires body when a body schema is provided', () => {
        const schema = createRequestSchema({
            body: {
                title: z.string(),
            },
        });

        expect(() =>
            schema.parse({
                body: undefined,
                query: {},
                params: {},
            }),
        ).toThrow();
    });
});
