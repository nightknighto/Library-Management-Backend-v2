import { Router } from "express";
import { rateLimiter } from "../../shared/middlewares/rate-limiter.middleware.ts";
import { BookController } from "./books.controller.ts";
import * as BookDTOs from './books.dtos.ts';
import { validateRequest } from "../../shared/middlewares/validators.middleware.ts";

const booksRoutes = Router();

// POST /books - Create a new book
booksRoutes.post('/',
    validateRequest(BookDTOs.CreateBookRequestSchema),
    BookController.createBook
);

// GET /books - Get all books with optional search and pagination
booksRoutes.get('/',
    validateRequest(BookDTOs.ListBooksRequestSchema),
    // @ts-expect-error
    BookController.getAllBooks
);

// GET /books/:isbn - Get a book by ISBN
booksRoutes.get('/:isbn',
    validateRequest(BookDTOs.GetBookRequestSchema),
    BookController.getBookByIsbn
);

// PUT /books/:isbn - Update a book
booksRoutes.put('/:isbn',
    rateLimiter,
    validateRequest(BookDTOs.UpdateBookRequestSchema),
    BookController.updateBook
);

// DELETE /books/:isbn - Delete a book
booksRoutes.delete('/:isbn',
    validateRequest(BookDTOs.DeleteBookRequestSchema),
    BookController.deleteBook
);

export default booksRoutes;