import { Router } from "express";
import booksRoutes from "./books.routes";
import borrowsRoutes from "./borrows.routes";
import statsRoutes from "./stats.routes";
import usersRoutes from "./users.routes";

const v1Routes = Router();

v1Routes.use('/books', booksRoutes);
v1Routes.use('/users', usersRoutes);
v1Routes.use('/borrows', borrowsRoutes);
v1Routes.use('/stats', statsRoutes);

export default v1Routes;
