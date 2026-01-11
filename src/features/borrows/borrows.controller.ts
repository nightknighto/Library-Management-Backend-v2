import type { Request, Response } from 'express';
import type { BorrowDTOs } from './borrows.dtos.ts';
import { BookModel } from '../books/books.model.ts';
import { BorrowModel } from './borrows.model.ts';


export namespace BorrowController {
    export async function borrowBook(req: Request<BorrowDTOs.BorrowBookParams>, res: Response) {
        const { isbn } = req.params;
        const user_email = req.user!.email;

        // Check if book is available
        const book = await BookModel.getBookByIsbn(isbn);
        if (!book || book.available_quantity! <= 0) {
            return res.status(400).json({ error: 'Book not available' });
        }

        // Check if user already has active borrow for this book
        const activeBorrow = await BorrowModel.getActiveBorrowByUserAndBook(user_email, isbn);
        if (activeBorrow) {
            return res.status(400).json({ error: 'User already has an active borrow for this book' });
        }

        // Create borrow record with due date (e.g., 14 days from now)
        const due_date = new Date();
        due_date.setDate(due_date.getDate() + 14);

        await BorrowModel.createBorrow(user_email, isbn, due_date);

        res.status(201).json({ message: 'Book borrowed successfully' });
    }

    export async function returnBook(req: Request<BorrowDTOs.ReturnBookParams>, res: Response) {
        const { isbn } = req.params;
        const user_email = req.user!.email;

        const success = await BorrowModel.returnBook(user_email, isbn);
        if (!success) {
            return res.status(400).json({ error: 'No active borrow record found for this user and book.' });
        }

        res.status(200).json({ message: 'Book returned successfully' });
    }

    export async function getOverdueBooks(req: Request, res: Response) {
        try {
            const { page, limit } = req.query;
            const overdueBorrows = await BorrowModel.getOverdueBorrows({
                page: page ? parseInt(page as string) : 1,
                limit: Math.min(limit ? parseInt(limit as string) : 10, 100)
            });

            const response = overdueBorrows.map(borrow => ({
                userEmail: borrow.user_email,
                bookTitle: borrow.book.title,
                due_date: borrow.due_date,
                bookIsbn: borrow.book_isbn
            }));

            res.status(200).json(response);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch overdue books' });
        }
    }
}