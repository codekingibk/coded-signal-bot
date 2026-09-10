import { Router, type IRouter } from "express";
import healthRouter from "./health";
import codedSignalRouter from "./coded-signal";

const router: IRouter = Router();

router.use(healthRouter);
router.use(codedSignalRouter);

export default router;
