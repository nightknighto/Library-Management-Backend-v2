import { Router } from "express";
import booksRoutes from "./features/books/books.routes.ts";
import usersRoutes from "./features/users/users.routes.ts";
import borrowsRoutes from "./features/borrows/borrows.routes.ts";
import statsRoutes from "./features/stats/stats.routes.ts";

const rootRouter = Router();

rootRouter.use('/books', booksRoutes);
rootRouter.use('/users', usersRoutes);
rootRouter.use('/borrows', borrowsRoutes);
rootRouter.use('/stats', statsRoutes);

export default rootRouter;