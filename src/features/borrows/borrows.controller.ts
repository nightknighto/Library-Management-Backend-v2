import * as BorrowDTOs from './borrows.schemas.ts';
import type { Request } from 'express';
import { createHandler, createHandlerFactory } from '../../core/create-handler.core.ts';
import createHttpError from 'http-errors';
import z from 'zod';
import { authenticateJwt } from '../auth-stuff.ts';
import { BorrowsService } from './borrows.service.ts';
import { BorrowRepository } from './borrows.repository.ts';

const borrowBook = createHandler(BorrowDTOs.BorrowBookContract, async (req, auth) => {
    const { isbn } = req.params
    const user_email = auth.email;

    await BorrowsService.borrowBook(isbn, user_email);

    return {
        statusCode: 201,
        data: 'Book borrowed successfully'
    }
},
    {
        access: 'protected', // This handler requires authentication
        security: {
            authenticate: async (req: Request) => {
                // This is a placeholder. In a real implementation, you'd verify a JWT or session.
                const authHeader = req.headers.authorization;
                console.log(authHeader);
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    return null;
                }
                const token = authHeader.split(' ')[1];
                // For testing purposes, we'll just return a dummy user based on the token.
                return { email: token! } as const;
            },
            authorize: async ({ auth }) => {
                // For this example, we'll allow any authenticated user to borrow books.
                // In a real implementation, you might check user roles or permissions here.
                return Boolean(auth?.email);
            },
            authSchema: z.object({
                email: z.string().email(),
            }),
        }
    })

const createProtectedHandler = createHandlerFactory({
    access: 'protected',
    security: {
        authenticate: authenticateJwt,
        validateBeforeAuthorization: true
    }
})

const returnBook = createProtectedHandler(BorrowDTOs.ReturnBookContract, async (req, auth) => {
    const { isbn } = req.params
    const user_email = auth.email;

    await BorrowsService.returnBook(isbn, user_email);

    return {
        data: 'Book returned successfully'
    }
},
    {
        security: {
            authorize: async ({ req, auth }) => {
                const existingBorrow = await BorrowRepository.getActiveBorrowByUserAndBook(auth.email, req.params.isbn);

                if (!existingBorrow) {
                    throw new createHttpError.Forbidden('No active borrow record found for this user and book.');
                }

                return true;
            }
        }
    })


const getOverdueBooks = createProtectedHandler(BorrowDTOs.OverdueBooksContract, async (req) => {
    const { page, limit } = req.query;

    const overdueBorrows = await BorrowsService.getOverdueBooks(page, limit);

    const response = overdueBorrows.map(borrow => ({
        userEmail: borrow.user_email,
        bookTitle: borrow.book.title,
        dueDate: borrow.due_date,
        bookIsbn: borrow.book_isbn
    }));

    return {
        data: response,
        pagination: {
            page,
            limit,
            totalCount: 23, // This is a placeholder. 
        }
    }
})

export const BorrowController = {
    borrowBook,
    returnBook,
    getOverdueBooks
} as const