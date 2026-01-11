import { Router } from "express";
import v1Routes from "./v1/index.routes";

const mainRouter = Router();

mainRouter.use('/v1', v1Routes);

export default mainRouter;