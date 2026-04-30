import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthPayload {
  user_id: number;
  empresa_id: number | null;
  role: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

const DEFAULT_DEV_SECRET = "dev-only-insecure-secret-change-me";

export function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (secret && secret.length > 0) return secret;
  if (process.env["NODE_ENV"] === "production") {
    throw new Error("JWT_SECRET must be set in production");
  }
  return DEFAULT_DEV_SECRET;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AuthPayload;
    return decoded;
  } catch {
    return null;
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers["authorization"];
  if (header && typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  return null;
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  if (req.user.role !== "super_admin") {
    res.status(403).json({ error: "Acesso restrito ao super administrador" });
    return;
  }
  next();
}
