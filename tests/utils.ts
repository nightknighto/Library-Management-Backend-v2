import type { Request, Response } from 'express';

export interface MockRequest extends Partial<Request> {
    body?: any;
    params?: any;
    query?: any;
    user?: any;
}

export interface MockResponse extends Partial<Response> {
    status: any;
    json: any;
    send: any;
}

export const createMockRequest = (overrides: MockRequest = {}): MockRequest => {
    return {
        body: {},
        params: {},
        query: {},
        user: undefined,
        ...overrides,
    };
};

export const createMockResponse = (): MockResponse => {
    const res: MockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
    };
    return res;
};

export const mockUserData = {
    validUser: {
        email: 'test@example.com',
        name: 'Test User',
        registered_at: new Date('2025-01-01'),
    },
    updatedUser: {
        email: 'test@example.com',
        name: 'Updated User',
        registered_at: new Date('2025-01-01'),
    },
    userWithBorrows: {
        email: 'test@example.com',
        name: 'Test User',
        registered_at: new Date('2025-01-01'),
        Borrow: [
            {
                book: { title: 'Test Book 1' },
                due_date: new Date('2025-10-01'),
            },
            {
                book: { title: 'Test Book 2' },
                due_date: new Date('2025-08-01'), // Overdue
            },
        ],
    },
};

export const mockErrorMessages = {
    userNotFound: 'User not found',
    failedToRegister: 'Failed to register user',
    failedToLogin: 'Failed to login',
    failedToFetch: 'Failed to fetch users',
    failedToUpdate: 'Failed to update user',
    failedToDelete: 'Failed to delete user',
    failedToFetchBorrows: 'Failed to fetch user borrows',
};