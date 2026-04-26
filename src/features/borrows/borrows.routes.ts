import { Router } from "express";
import { BorrowController } from "./borrows.controller.ts";

const borrowsRoutes = Router();

// POST /borrows/borrow/:isbn - Borrow a book (requires authentication)
borrowsRoutes.post('/borrow/:isbn',
    BorrowController.borrowBook
);

// POST /borrows/return/:isbn - Return a book (requires authentication)
borrowsRoutes.post('/return/:isbn',
    BorrowController.returnBook
);

// GET /borrows/overdue - Get overdue books with pagination
borrowsRoutes.get('/due',
    BorrowController.getOverdueBooks as any
);

export default borrowsRoutes;