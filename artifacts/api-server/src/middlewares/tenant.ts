import { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      empresaId?: number;
    }
  }
}

export function tenantMiddleware(req: Request, _res: Response, next: NextFunction): void {
  // Tenant users (admin) always operate on their own empresa from the JWT.
  if (req.user && req.user.role !== "super_admin" && req.user.empresa_id) {
    req.empresaId = req.user.empresa_id;
    next();
    return;
  }

  // Super admin (or unauthenticated tooling) may select an empresa via header.
  const header = req.headers["x-empresa-id"];
  if (header) {
    const id = parseInt(Array.isArray(header) ? header[0] ?? "" : header, 10);
    if (!isNaN(id) && id > 0) {
      req.empresaId = id;
    }
  }
  next();
}
