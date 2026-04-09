import { BookRepository } from './books.repository.ts';
import * as BookDTOs from './books.schemas.ts';
import createHttpError from 'http-errors';
import { createHandler } from '../../core/create-handler.core.ts';

const createBook = createHandler(BookDTOs.CreateBookContract, async (req) => {
    const book = await BookRepository.createBook(req.body);
    if (!book) {
        throw new createHttpError.BadRequest('Book with this ISBN already exists');
    }

    return {
        statusCode: 201,
        data: 'Book created successfully',
    };
});

const getAllBooks = createHandler(BookDTOs.ListBooksContract, async (req) => {
    const { title, author, isbn, page, limit } = req.query;

    const books = await BookRepository.getAllBooks({
        title: title,
        author: author,
        isbn: isbn,
        page: page,
        limit: limit
    });

    const totalCount = await BookRepository.countBooks({ title, author, isbn })

    return {
        data: books,
        pagination: {
            totalCount,
            page,
            limit,
        },
    };
})

const getBookByIsbn = createHandler(BookDTOs.GetBookContract, async (req) => {
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

        return { data: selectedFields };
    }


    // const output = BookDTOs.GetBookResponseSchema.parse(book satisfies preprocess)
    return { data: { ...book, w: 2 } };
})

const updateBook = createHandler(BookDTOs.UpdateBookContract, async (req) => {
    const { isbn } = req.params;
    const updatedBook = await BookRepository.updateBook(isbn, req.body);
    if (!updatedBook) {
        throw new createHttpError.NotFound('Book not found');
    }

    return { data: updatedBook };
})

const deleteBook = createHandler(BookDTOs.DeleteBookContract, async (req) => {
    const { isbn } = req.params;
    const book = await BookRepository.deleteBook(isbn);
    if (!book) {
        throw new createHttpError.NotFound('Book not found');
    }

    return { data: undefined };
})

export const BookController = {
    createBook,
    getAllBooks,
    getBookByIsbn,
    updateBook,
    deleteBook
};