import * as BorrowDTOs from './borrows.schemas.ts';
import { BorrowRepository } from './borrows.repository.ts';
import { BookRepository } from '../books/books.repository.ts';
import { createHandler } from '../../core/create-handler.core.ts';
import createHttpError from 'http-errors';

const borrowBook = createHandler(BorrowDTOs.BorrowBookContract, async (req) => {
    const { isbn } = req.params
    const user_email = req.user!.email;

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
})

const returnBook = createHandler(BorrowDTOs.ReturnBookContract, async (req) => {
    const { isbn } = req.params
    const user_email = req.user!.email;

    const success = await BorrowRepository.returnBook(user_email, isbn);
    if (!success) {
        throw new createHttpError.BadRequest('No active borrow record found for this user and book.')
    }

    return {
        data: 'Book returned successfully'
    }
})


const getOverdueBooks = createHandler(BorrowDTOs.OverdueBooksContract, async (req) => {
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