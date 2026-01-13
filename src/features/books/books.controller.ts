import type { Request, Response } from 'express';
import { BookRepository } from './books.repository.ts';
import * as BookDTOs from './books.dtos.ts';
import type { ValidatedRequest } from '../../shared/middlewares/validators.middleware.ts';


async function createBook(req: ValidatedRequest<BookDTOs.CreateBookRequest>, res: Response) {
    const book = await BookRepository.createBook(req.body);
    if (!book) {
        return res.status(400).json({ error: 'Book with this ISBN already exists' });
    }
    res.status(201).json({ message: 'Book created successfully' });
}

async function getAllBooks(req: ValidatedRequest<BookDTOs.ListBooksRequest>, res: Response) {
    const { title, author, isbn, page, limit } = req.query;

    const books = await BookRepository.getAllBooks({
        title: title,
        author: author,
        isbn: isbn,
        page: page,
        limit: limit
    });

    res.status(200).json(books);
}

async function getBookByIsbn(req: ValidatedRequest<BookDTOs.GetBookRequest>, res: Response) {

    const { isbn } = req.params;
    const { fields } = req.query;
    const book = await BookRepository.getBookByIsbn(isbn);
    if (!book) {
        return res.status(404).json({ error: 'Book not found' });
    }

    if (fields.length > 0) {
        const selectedFields = fields.reduce((acc, field) => {
            acc[field] = book[field];
            return acc;
        }, {} as Record<string, any>);
        return res.status(200).json(selectedFields);
    }
    return res.status(200).json(book);
}

async function updateBook(req: ValidatedRequest<BookDTOs.UpdateBookRequest>, res: Response) {
    const { isbn } = req.params;
    const updatedBook = await BookRepository.updateBook(isbn, req.body);
    if (!updatedBook) {
        return res.status(404).json({ error: 'Book not found' });
    }
    res.status(200).json(updatedBook);
}

async function deleteBook(req: ValidatedRequest<BookDTOs.DeleteBookRequest>, res: Response) {
    const { isbn } = req.params;
    const book = await BookRepository.deleteBook(isbn);
    if (!book) {
        return res.status(404).json({ error: 'Book not found' });
    }
    res.status(200).json({ message: 'Book deleted successfully' });
}

export const BookController = {
    createBook,
    getAllBooks,
    getBookByIsbn,
    updateBook,
    deleteBook
};