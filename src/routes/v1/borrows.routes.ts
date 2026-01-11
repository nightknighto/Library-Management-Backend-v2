import { Router } from "express";
import { BorrowController } from "../../controllers";
import { authenticate } from "../../middleware";
import { Validators } from "../../middleware/validators.middleware";
import { BorrowDTOs } from "../../dtos/borrows.dtos";

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