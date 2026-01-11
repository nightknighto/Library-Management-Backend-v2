import { Router } from "express";
import { authenticate } from "../../shared/middlewares/auth.ts";
import { Validators } from "../../shared/middlewares/validators.middleware.ts";
import { BorrowController } from "./borrows.controller.ts";
import { BorrowDTOs } from "./borrows.dtos.ts";

const borrowsRoutes = Router();

// POST /borrows/borrow/:isbn - Borrow a book (requires authentication)
borrowsRoutes.post('/borrow/:isbn',
    authenticate,
    Validators.validateParams(BorrowDTOs.BorrowBookParamsSchema),
    BorrowController.borrowBook
);

// POST /borrows/return/:isbn - Return a book (requires authentication)
borrowsRoutes.post('/return/:isbn',
    authenticate,
    Validators.validateParams(BorrowDTOs.ReturnBookParamsSchema),
    BorrowController.returnBook
);

// GET /borrows/overdue - Get overdue books with pagination
borrowsRoutes.get('/due',
    Validators.validateQuery(BorrowDTOs.OverdueBooksQuerySchema),
    BorrowController.getOverdueBooks
);

export default borrowsRoutes;