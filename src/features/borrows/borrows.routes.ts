import { Router } from "express";
import { authenticate } from "../../shared/middlewares/auth.ts";
import { BorrowController } from "./borrows.controller.ts";
import * as BorrowDTOs from "./borrows.schemas.ts";
import { validateRequest } from "../../shared/middlewares/validators.middleware.ts";

const borrowsRoutes = Router();

// POST /borrows/borrow/:isbn - Borrow a book (requires authentication)
borrowsRoutes.post('/borrow/:isbn',
    authenticate,
    validateRequest(BorrowDTOs.BorrowBookRequestSchema),
    BorrowController.borrowBook
);

// POST /borrows/return/:isbn - Return a book (requires authentication)
borrowsRoutes.post('/return/:isbn',
    authenticate,
    validateRequest(BorrowDTOs.ReturnBookRequestSchema),
    BorrowController.returnBook
);

// GET /borrows/overdue - Get overdue books with pagination
borrowsRoutes.get('/due',
    validateRequest(BorrowDTOs.OverdueBooksRequestSchema),
    BorrowController.getOverdueBooks as any
);

export default borrowsRoutes;