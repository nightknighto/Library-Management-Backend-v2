import type { Prisma } from "@prisma/client";
import { BookRepository } from "./books.repository.ts";
import createHttpError from "http-errors";
import type { GetBookRequest, UpdateBookRequest } from "./books.schemas.ts";


async function createBook(email: string, bookData: Omit<Prisma.BookCreateInput, "created_at" | "Borrow" | 'Author'>) {
    const book = await BookRepository.createBook(email, bookData);
    if (!book) {
        throw new createHttpError.BadRequest('Book with this ISBN already exists');
    }
}

async function getAllBooks(filters: {
    title?: string;
    author?: string;
    isbn?: string;
    page: number;
    limit: number;
}) {
    const books = await BookRepository.getAllBooks(filters);
    const totalCount = await BookRepository.countBooks(filters);

    return {
        books,
        totalCount
    }
}

async function getBookByISBN(isbn: string, fields: GetBookRequest['query']['fields']) {
    const book = await BookRepository.getBookByIsbn(isbn);
    if (!book) {
        throw new createHttpError.NotFound('Book not found');
    }

    if (fields.length > 0) {
        const selectedFields = fields.reduce((acc, field) => {
            acc[field] = book[field];
            return acc;
        }, {} as Record<keyof typeof book, any>);

        return selectedFields;
    }

    return book;
}

async function updateBook(isbn: string, email: string, updateData: UpdateBookRequest['body']) {

    const updatedBook = await BookRepository.updateBook(isbn, email, updateData);
    if (!updatedBook) {
        throw new createHttpError.NotFound('Book not found');
    }
    return updatedBook;
}

async function deleteBook(isbn: string, email: string) {
    const deleted = await BookRepository.deleteBook(isbn, email);
    if (!deleted) {
        throw new createHttpError.NotFound('Book not found');
    }
}

export const BookService = {
    createBook,
    getAllBooks,
    getBookByISBN,
    updateBook,
    deleteBook
} as const