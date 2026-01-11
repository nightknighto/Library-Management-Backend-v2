import { Router } from "express";
import v1Routes from "./v1/index.routes.ts";

const mainRouter = Router();

mainRouter.use('/v1', v1Routes);

export default mainRouter;