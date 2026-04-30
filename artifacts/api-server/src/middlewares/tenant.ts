import { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      empresaId?: number;
    }
  }
}

export function tenantMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers["x-empresa-id"];
  if (header) {
    const id = parseInt(Array.isArray(header) ? header[0] ?? "" : header, 10);
    if (!isNaN(id) && id > 0) {
      req.empresaId = id;
    }
  }
  next();
}
