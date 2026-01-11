import { Router } from "express";
import { Validators } from "../../shared/middlewares/validators.middleware.ts";
import { rateLimiter } from "../../shared/middlewares/rate-limiter.middleware.ts";
import { BookController } from "./books.controller.ts";
import * as BookDTOs from './books.dtos.ts';

const booksRoutes = Router();

// POST /books - Create a new book
booksRoutes.post('/',
    Validators.validateBody(BookDTOs.CreateBookSchema),
    BookController.createBook
);

// GET /books - Get all books with optional search and pagination
booksRoutes.get('/',
    Validators.validateQuery(BookDTOs.BookSearchQuerySchema),
    BookController.getAllBooks
);

booksRoutes.use('/:isbn', Validators.validateParams(BookDTOs.BookParamsSchema));

// GET /books/:isbn - Get a book by ISBN
booksRoutes.get('/:isbn',
    BookController.getBookByIsbn
);

// PUT /books/:isbn - Update a book
booksRoutes.put('/:isbn',
    rateLimiter,
    Validators.validateBody(BookDTOs.UpdateBookSchema),
    BookController.updateBook
);

// DELETE /books/:isbn - Delete a book
booksRoutes.delete('/:isbn',
    BookController.deleteBook
);

export default booksRoutes;