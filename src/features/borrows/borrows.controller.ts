import * as BorrowDTOs from './borrows.schemas.ts';
import { BorrowRepository } from './borrows.repository.ts';
import { BookRepository } from '../books/books.repository.ts';
import type { Request } from 'express';
import { createHandler, createHandlerFactory } from '../../core/create-handler.core.ts';
import createHttpError from 'http-errors';
import z from 'zod';
import { authenticateJwt } from '../auth-stuff.ts';

const borrowBook = createHandler(BorrowDTOs.BorrowBookContract, async (req, auth) => {
    const { isbn } = req.params
    const user_email = auth.email;

    // Check if book is available
    const book = await BookRepository.getBookByIsbn(isbn);
    if (!book || book.available_quantity! <= 0) {
        throw new createHttpError.BadRequest('Book not available')
    }

    // Check if user already has active borrow for this book
    const activeBorrow = await BorrowRepository.getActiveBorrowByUserAndBook(user_email, isbn);
    if (activeBorrow) {
        throw new createHttpError.BadRequest('User already has an active borrow for this book')
    }

    // Create borrow record with due date (e.g., 14 days from now)
    const due_date = new Date();
    due_date.setDate(due_date.getDate() + 14);

    await BorrowRepository.createBorrow(user_email, isbn, due_date);

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

    const success = await BorrowRepository.returnBook(user_email, isbn);
    if (!success) {
        throw new createHttpError.BadRequest('No active borrow record found for this user and book.')
    }

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
    const overdueBorrows = await BorrowRepository.getOverdueBorrows({
        page,
        limit
    });

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