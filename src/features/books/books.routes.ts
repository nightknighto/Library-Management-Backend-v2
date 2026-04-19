import { Router } from "express";
import { rateLimiter } from "../../shared/middlewares/rate-limiter.middleware.ts";
import { BookController } from "./books.controller.ts";

const booksRoutes = Router();

// POST /books - Create a new book
booksRoutes.post('/',
    BookController.createBook
);

// GET /books - Get all books with optional search and pagination
booksRoutes.get('/',
    BookController.getAllBooks
);

// GET /books/:isbn - Get a book by ISBN
booksRoutes.get('/:isbn',
    BookController.getBookByIsbn
);

// PUT /books/:isbn - Update a book
booksRoutes.put('/:isbn',
    rateLimiter(1000, 3),
    BookController.updateBook
);

// DELETE /books/:isbn - Delete a book
booksRoutes.delete('/:isbn',
    BookController.deleteBook
);

export default booksRoutes;