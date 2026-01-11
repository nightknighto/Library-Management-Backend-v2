import { Router } from "express";
import booksRoutes from "./books.routes.ts";
import borrowsRoutes from "./borrows.routes.ts";
import statsRoutes from "./stats.routes.ts";
import usersRoutes from "./users.routes.ts";

const v1Routes = Router();

v1Routes.use('/books', booksRoutes);
v1Routes.use('/users', usersRoutes);
v1Routes.use('/borrows', borrowsRoutes);
v1Routes.use('/stats', statsRoutes);

export default v1Routes;
