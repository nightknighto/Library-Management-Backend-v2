import type { Request, Response } from 'express';
import { BookRepository } from './books.repository.ts';
import * as BookDTOs from './books.dtos.ts';


async function createBook(req: Request<unknown, unknown, BookDTOs.CreateBookRequest>, res: Response) {
    const book = await BookRepository.createBook(req.body);
    if (!book) {
        return res.status(400).json({ error: 'Book with this ISBN already exists' });
    }
    res.status(201).json({ message: 'Book created successfully' });
}

async function getAllBooks(req: Request, res: Response) {
    const { title, author, isbn, page, limit } = req.query;

    const books = await BookRepository.getAllBooks({
        title: title as string | undefined,
        author: author as string | undefined,
        isbn: isbn as string | undefined,
        page: page ? parseInt(page as string) : 1,
        limit: Math.min(limit ? parseInt(limit as string) : 10, 100)
    });

    res.status(200).json(books);
}

async function getBookByIsbn(req: Request<BookDTOs.BookParams>, res: Response) {

    const { isbn } = req.params;
    const book = await BookRepository.getBookByIsbn(isbn);
    if (!book) {
        return res.status(404).json({ error: 'Book not found' });
    }
    res.status(200).json(book);

}

async function updateBook(req: Request<BookDTOs.BookParams, unknown, BookDTOs.UpdateBookRequest>, res: Response) {
    const { isbn } = req.params;
    const updatedBook = await BookRepository.updateBook(isbn, req.body);
    if (!updatedBook) {
        return res.status(404).json({ error: 'Book not found' });
    }
    res.status(200).json(updatedBook);
}

async function deleteBook(req: Request<BookDTOs.BookParams>, res: Response) {
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