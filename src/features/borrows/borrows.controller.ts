import type { Response } from 'express';
import * as BorrowDTOs from './borrows.dtos.ts';
import { BorrowRepository } from './borrows.repository.ts';
import { BookRepository } from '../books/books.repository.ts';
import type { ValidatedRequest } from '../../shared/middlewares/validators.middleware.ts';
import type { ControllerResponse } from '../../shared/schemas/controller-responses.schema.ts';

async function borrowBook(req: ValidatedRequest<BorrowDTOs.BorrowBookRequest>, res: ControllerResponse<BorrowDTOs.BorrowBookResponse>) {
    const { isbn } = req.params;
    const user_email = req.user!.email;

    // Check if book is available
    const book = await BookRepository.getBookByIsbn(isbn);
    if (!book || book.available_quantity! <= 0) {
        return res.status(400).json({ success: false, error: 'Book not available' });
    }

    // Check if user already has active borrow for this book
    const activeBorrow = await BorrowRepository.getActiveBorrowByUserAndBook(user_email, isbn);
    if (activeBorrow) {
        return res.status(400).json({ success: false, error: 'User already has an active borrow for this book' });
    }

    // Create borrow record with due date (e.g., 14 days from now)
    const due_date = new Date();
    due_date.setDate(due_date.getDate() + 14);

    await BorrowRepository.createBorrow(user_email, isbn, due_date);

    res.status(201).json({
        success: true,
        data: { message: 'Book borrowed successfully' },
        meta: { timestamp: new Date().toISOString() }
    });
}

async function returnBook(req: ValidatedRequest<BorrowDTOs.ReturnBookRequest>, res: ControllerResponse<BorrowDTOs.ReturnBookResponse>) {
    const { isbn } = req.params;
    const user_email = req.user!.email;

    const success = await BorrowRepository.returnBook(user_email, isbn);
    if (!success) {
        return res.status(400).json({ success: false, error: 'No active borrow record found for this user and book.' });
    }

    res.status(200).json({
        success: true,
        data: { message: 'Book returned successfully' },
        meta: { timestamp: new Date().toISOString() }
    });
}

async function getOverdueBooks(req: ValidatedRequest<BorrowDTOs.OverdueBooksRequest>, res: ControllerResponse<BorrowDTOs.OverdueBooksResponse>) {
    try {
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

        res.status(200).json({
            success: true,
            data: response,
            meta: { timestamp: new Date().toISOString() }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch overdue books' });
    }
}

export const BorrowController = {
    borrowBook,
    returnBook,
    getOverdueBooks
} as const