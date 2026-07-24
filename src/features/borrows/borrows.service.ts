import { HttpError } from '../../core/http-error.core.ts';
import { BookService } from '../books/books.service.ts';
import { BorrowRepository } from './borrows.repository.ts';

async function borrowBook(isbn: string, user_email: string) {
    // Check if book is available
    const book = await BookService.getBookByISBN(isbn, []); // This will throw if book doesn't exist

    if (book.available_quantity! <= 0) {
        throw new HttpError.BadRequest('Book not available');
    }

    // Check if user already has active borrow for this book
    const activeBorrow = await BorrowRepository.getActiveBorrowByUserAndBook(user_email, isbn);
    if (activeBorrow) {
        throw new HttpError.BadRequest('User already has an active borrow for this book');
    }

    // Create borrow record with due date (e.g., 14 days from now)
    const due_date = new Date();
    due_date.setDate(due_date.getDate() + 14);

    const borrow = await BorrowRepository.createBorrow(user_email, isbn, due_date);

    return borrow;
}

async function returnBook(isbn: string, user_email: string) {
    const success = await BorrowRepository.returnBook(user_email, isbn);
    if (!success) {
        throw new HttpError.BadRequest(
            'No active borrow record found for this user and book.',
        );
    }
}

async function getOverdueBooks(page: number, limit: number) {
    const overdueBorrows = await BorrowRepository.getOverdueBorrows({
        page,
        limit,
    });

    return overdueBorrows;
}

export const BorrowsService = {
    borrowBook,
    returnBook,
    getOverdueBooks,
} as const;
