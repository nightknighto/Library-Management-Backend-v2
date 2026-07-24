import { HttpError } from '../../src/core/http-error.core';
import { z, ZodError } from 'zod';
import {
    formatErrorForLog,
    handleError,
    handleRequestValidationError,
    handleResponseValidationError,
    isZodError,
} from '../../src/core/error-handler.core';
import { createMockResponse } from './test-utils';

describe('error-handler (runtime)', () => {
    it('detects Zod errors', () => {
        const error = new ZodError([]);
        expect(isZodError(error)).toBe(true);
        expect(isZodError({ name: 'ZodError' })).toBe(true);
        expect(isZodError(new Error('nope'))).toBe(false);
    });

    it('formats errors safely for logs', () => {
        expect(formatErrorForLog(new Error('boom'))).toContain('boom');
        expect(formatErrorForLog({ foo: 'bar' })).toBe('{"foo":"bar"}');
        expect(formatErrorForLog('plain')).toBe('"plain"');
    });

    it('handles request validation errors with 400', () => {
        const schema = z.object({ name: z.string() });
        let error: ZodError | null = null;

        try {
            schema.parse({ name: 123 });
        } catch (err) {
            error = err as ZodError;
        }

        expect(error).not.toBeNull();

        const res = createMockResponse();
        handleRequestValidationError(error as ZodError, res as any);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                error: expect.objectContaining({
                    message: 'Request validation failed',
                }),
            }),
        );
    });

    it('handles response validation errors with 500', () => {
        const res = createMockResponse();
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const error = new ZodError([]);
        handleResponseValidationError(error, res as any);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            success: false,
            error: 'Internal Server Error',
        });

        spy.mockRestore();
    });

    it('handles HttpError instances with mapped status', () => {
        const res = createMockResponse();
        const error = new HttpError.NotFound('Missing');

        handleError(error, res as any);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Missing' });
    });

    it('handles generic errors with 500', () => {
        const res = createMockResponse();
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        handleError(new Error('boom'), res as any);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            success: false,
            error: 'Internal Server Error',
        });

        spy.mockRestore();
    });
});
