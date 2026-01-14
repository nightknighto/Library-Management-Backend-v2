import type { Request, Response } from 'express';
import { BookRepository } from './books.repository.ts';
import * as BookDTOs from './books.dtos.ts';
import type { ValidatedRequest } from '../../shared/middlewares/validators.middleware.ts';
import type z from 'zod';
import createHttpError from 'http-errors';

type ControllerResponse<T> = Response<{
    success: boolean;
    data: T;
    meta: {
        timestamp: string;
    };
} | {
    success: false;
    error: any
}>;

type PaginatedControllerResponse<T> = Response<{
    success: boolean;
    data: T;
    meta: {
        timestamp: string;
        pagination: {
            totalCount: number;
            limit: number;
            offset: number;
            hasNextPage: boolean;
        }
    }
} | {
    success: false;
    error: any
}>;

export function sanitizeResponse<S extends z.ZodTypeAny, D extends z.input<S>>(
    schema: S,
    data: D
): z.output<S> {
    try {
        return schema.parse(data);
    } catch (error: any) {
        // Rethrow as an output validation error
        error.isOutputValidationError = true;
        throw error;
    }
}

async function createBook(req: ValidatedRequest<BookDTOs.CreateBookRequest>, res: ControllerResponse<BookDTOs.CreateBookResponse>) {
    const book = await BookRepository.createBook(req.body);
    if (!book) {
        return res.status(400).json({ success: false, error: 'Book with this ISBN already exists' });
    }

    const output = sanitizeResponse(BookDTOs.CreateBookResponseSchema, {
        message: 'Book created successfully',
        gg: 2,
    })

    res.status(201).json({
        success: true,
        data: output,
        meta: {
            timestamp: new Date().toISOString(),
        }
    });
}

async function getAllBooks(req: ValidatedRequest<BookDTOs.ListBooksRequest>, res: PaginatedControllerResponse<BookDTOs.ListBooksResponse>) {
    const { title, author, isbn, page, limit } = req.query;

    const books = await BookRepository.getAllBooks({
        title: title,
        author: author,
        isbn: isbn,
        page: page,
        limit: limit
    });

    const output = sanitizeResponse(BookDTOs.ListBooksResponseSchema, books)

    res.status(200).json({
        success: true,
        data: output,
        meta: {
            timestamp: new Date().toISOString(),
            pagination: {
                totalCount: 150,
                limit: 20,
                offset: 0,
                hasNextPage: true
            }
        }
    });
}

async function getBookByIsbn(req: ValidatedRequest<BookDTOs.GetBookRequest>, res: ControllerResponse<BookDTOs.GetBookResponse>) {

    const { isbn } = req.params;
    const { fields } = req.query;
    const book = await BookRepository.getBookByIsbn(isbn);
    if (!book) {
        // return res.status(404).json({ success: false, error: 'Book not found' });
        throw new createHttpError.NotFound('Book not found');
    }

    if (fields.length > 0) {
        const selectedFields = fields.reduce((acc, field) => {
            acc[field] = book[field];
            return acc;
        }, {} as Record<keyof typeof book, any>);

        const output = sanitizeResponse(BookDTOs.GetBookResponseSchema, selectedFields)
        return res.status(200).json({
            success: true,
            data: output,
            meta: {
                timestamp: new Date().toISOString(),
            }
        });
    }


    // const output = BookDTOs.GetBookResponseSchema.parse(book satisfies preprocess)
    const output = sanitizeResponse(BookDTOs.GetBookResponseSchema, { ...book, w: 2 })
    return res.status(200).json({
        success: true,
        data: output,
        meta: {
            timestamp: new Date().toISOString(),
        }
    });
}

async function updateBook(req: ValidatedRequest<BookDTOs.UpdateBookRequest>, res: ControllerResponse<BookDTOs.UpdateBookResponse>) {
    const { isbn } = req.params;
    const updatedBook = await BookRepository.updateBook(isbn, req.body);
    if (!updatedBook) {
        return res.status(404).json({ success: false, error: 'Book not found' });
    }

    const output = sanitizeResponse(BookDTOs.UpdateBookResponseSchema, updatedBook)
    res.status(200).json({
        success: true,
        data: output,
        meta: {
            timestamp: new Date().toISOString(),
        }
    });
}

async function deleteBook(req: ValidatedRequest<BookDTOs.DeleteBookRequest>, res: ControllerResponse<BookDTOs.DeleteBookResponse>) {
    const { isbn } = req.params;
    const book = await BookRepository.deleteBook(isbn);
    if (!book) {
        return res.status(404).json({ success: false, error: 'Book not found' });
    }
    res.sendStatus(204)
}

export const BookController = {
    createBook,
    getAllBooks,
    getBookByIsbn,
    updateBook,
    deleteBook
};