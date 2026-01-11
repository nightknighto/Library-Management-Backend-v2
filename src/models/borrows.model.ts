import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";


export namespace BorrowModel {

    /**
     * Retrieves an active borrow record for a specific user and book combination.
     * An active borrow is defined as one where the return_date is null, indicating
     * the book has not yet been returned.
     * 
     * @param user_email - The email address of the user who borrowed the book
     * @param book_isbn - The ISBN of the borrowed book
     * @returns A Promise that resolves to the active borrow record if found, or null if no active borrow exists
     */
    export async function getActiveBorrowByUserAndBook(user_email: string, book_isbn: string) {
        const borrow = await prisma.borrow.findFirst({
            where: {
                user_email,
                book_isbn,
                return_date: null,
            },
        });
        return borrow;
    }

    export async function createBorrow(
        user_email: string,
        book_isbn: string,
        due_date: Date
    ) {
        const borrow = await prisma.borrow.create({
            data: {
                user_email,
                book_isbn,
                due_date,
            },
        });
        return borrow;
    }

    export async function returnBook(user_email: string, book_isbn: string) {
        const updatedBorrow = await prisma.borrow.updateMany({
            where: {
                user_email,
                book_isbn,
                return_date: null,
            },
            data: {
                return_date: new Date(),
            },
        });
        if (updatedBorrow.count === 0) {
            return false
        }
        return true;
    }

    /**
     * Retrieves a paginated list of overdue book borrows from the database.
     * 
     * An overdue borrow is defined as a borrow record where:
     * - The due date has passed (is less than the current date)
     * - The book has not been returned yet (return_date is null)
     */
    export async function getOverdueBorrows({ page, limit }: { page: number; limit: number; }) {
        const now = new Date();
        const skip = page && limit ? (page - 1) * limit : undefined;
        const take = limit || undefined;

        try {
            const overdueBorrows = await prisma.borrow.findMany({
                where: {
                    due_date: { lt: now },
                    return_date: null,
                },
                select: {
                    user_email: true,
                    book_isbn: true,
                    book: {
                        select: {
                            title: true,
                        }
                    },
                    due_date: true,
                },
                skip,
                take,
            });
            return overdueBorrows;
        } catch (error) {
            throw error;
        }
    }
}