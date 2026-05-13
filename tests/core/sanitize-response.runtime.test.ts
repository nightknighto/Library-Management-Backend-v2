import { z } from 'zod';
import { sanitizeResponse } from '../../src/core/sanitize-response.core';

describe('sanitizeResponse (runtime)', () => {
    it('returns parsed data when the payload is valid', () => {
        const schema = z.object({ count: z.number() });

        const result = sanitizeResponse(schema, { count: 3 });

        expect(result).toEqual({ count: 3 });
    });

    it('throws when the payload is invalid', () => {
        const schema = z.object({ count: z.number() });

        expect(() => sanitizeResponse(schema, { count: 'oops' })).toThrow();
    });
});
