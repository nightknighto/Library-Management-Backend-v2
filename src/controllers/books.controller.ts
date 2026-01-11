import { Request, Response } from 'express';
import { BookModel } from '../models/books.model';
import { BookDTOs } from '../dtos/books.dtos';


export namespace BookController {

    export async function createBook(req: Request<unknown, unknown, BookDTOs.CreateBookRequest>, res: Response) {
        const book = await BookModel.createBook(req.body);
        if (!book) {
            return res.status(400).json({ error: 'Book with this ISBN already exists' });
        }
        res.status(201).json({ message: 'Book created successfully' });
    }

    export async function getAllBooks(req: Request, res: Response) {
        const { title, author, isbn, page, limit } = req.query;
        const books = await BookModel.getAllBooks({
            title: title as string | undefined,
            author: author as string | undefined,
            isbn: isbn as string | undefined,
            page: page ? parseInt(page as string) : 1,
            limit: Math.min(limit ? parseInt(limit as string) : 10, 100)
        });
        res.status(200).json(books);
    }

    export async function getBookByIsbn(req: Request<BookDTOs.BookParams>, res: Response) {

        const { isbn } = req.params;
        const book = await BookModel.getBookByIsbn(isbn);
        if (!book) {
            return res.status(404).json({ error: 'Book not found' });
        }
        res.status(200).json(book);

    }

    export async function updateBook(req: Request<BookDTOs.BookParams, unknown, BookDTOs.UpdateBookRequest>, res: Response) {
        const { isbn } = req.params;
        const updatedBook = await BookModel.updateBook(isbn, req.body);
        if (!updatedBook) {
            return res.status(404).json({ error: 'Book not found' });
        }
        res.status(200).json(updatedBook);
    }

    export async function deleteBook(req: Request<BookDTOs.BookParams>, res: Response) {
        const { isbn } = req.params;
        const book = await BookModel.deleteBook(isbn);
        if (!book) {
            return res.status(404).json({ error: 'Book not found' });
        }
        res.status(200).json({ message: 'Book deleted successfully' });
    }
}