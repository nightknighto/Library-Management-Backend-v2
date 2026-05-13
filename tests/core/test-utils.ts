import express, { type RequestHandler, type Response } from 'express';

type MockResponse = Partial<Response> & {
    status: vi.Mock;
    json: vi.Mock;
    cookie: vi.Mock;
    clearCookie: vi.Mock;
};

export const createTestApp = (
    handler: RequestHandler,
    options?: { method?: 'get' | 'post' | 'put' | 'delete' | 'patch'; route?: string },
) => {
    const app = express();
    app.use(express.json());

    const method = options?.method ?? 'get';
    const route = options?.route ?? '/test';

    app[method](route, handler);

    return { app, route };
};

export const createMockResponse = (): MockResponse => {
    const res: MockResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        cookie: vi.fn().mockReturnThis(),
        clearCookie: vi.fn().mockReturnThis(),
    };

    return res;
};

export const isValidIsoTimestamp = (value: string) => !Number.isNaN(Date.parse(value));
