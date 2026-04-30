import { Router, type IRouter } from "express";
import healthRouter from "./health";
import funcionariosRouter from "./funcionarios";
import registrosRouter from "./registros";
import relatoriosRouter from "./relatorios";
import excelRouter from "./excel";
import empresasRouter from "./empresas";
import jornadasRouter from "./jornadas";

const router: IRouter = Router();

router.use(healthRouter);
router.use(empresasRouter);
router.use(funcionariosRouter);
router.use(registrosRouter);
router.use(relatoriosRouter);
router.use(excelRouter);
router.use(jornadasRouter);

export default router;
