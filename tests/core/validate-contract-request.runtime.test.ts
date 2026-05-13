import type { Request } from 'express';
import { z } from 'zod';
import { createRequestSchema } from '../../src/core/create-request-schema.core';
import { validateContractRequest } from '../../src/core/validate-contract-request.core';

describe('validateContractRequest (runtime)', () => {
    it('mutates request with validated values and preserves reference', async () => {
        const schema = createRequestSchema({
            body: {
                count: z.coerce.number(),
            },
            query: {
                page: z.coerce.number(),
            },
            params: {
                id: z.string(),
            },
        });

        const req = {
            body: { count: '2' },
            query: { page: '3' },
            params: { id: 'abc' },
        } as Request;

        const result = await validateContractRequest(schema, req);

        expect(result).toBe(req);
        expect(req.body).toEqual({ count: 2 });
        expect(req.query).toEqual({ page: 3 });
        expect(req.params).toEqual({ id: 'abc' });
    });

    it('rewrites a read-only query property', async () => {
        const schema = createRequestSchema({
            query: {
                page: z.coerce.number(),
            },
        });

        const req = {
            body: {},
            query: { page: '5' },
            params: {},
        } as Request;

        Object.defineProperty(req, 'query', {
            value: req.query,
            writable: false,
            enumerable: true,
            configurable: true,
        });

        await validateContractRequest(schema, req);

        const descriptor = Object.getOwnPropertyDescriptor(req, 'query');
        expect(req.query).toEqual({ page: 5 });
        expect(descriptor?.writable).toBe(true);
    });
});
