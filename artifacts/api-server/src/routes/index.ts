import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import adminRouter from "./admin";
import funcionariosRouter from "./funcionarios";
import registrosRouter from "./registros";
import relatoriosRouter from "./relatorios";
import excelRouter from "./excel";
import empresasRouter from "./empresas";
import jornadasRouter from "./jornadas";
import manualRouter from "./manual";
import kioskRouter from "./kiosk";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// Public.
router.use(healthRouter);
router.use(authRouter);

// Super-admin-only management routes.
router.use(adminRouter);

// Kiosk: public token routes + authenticated admin sub-routes (requireAuth handled per-route inside).
router.use("/kiosk", kioskRouter);

// All remaining routes require authentication.
router.use(requireAuth);
router.use(empresasRouter);
router.use(funcionariosRouter);
router.use(registrosRouter);
router.use(relatoriosRouter);
router.use(excelRouter);
router.use(jornadasRouter);
router.use(manualRouter);

export default router;
