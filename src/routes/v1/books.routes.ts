import { Router } from "express";
import { BookController } from '../../controllers/books.controller';
import { rateLimiter } from "../../middleware";
import { Validators } from "../../middleware/validators.middleware";
import { BookDTOs } from "../../dtos/books.dtos";

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