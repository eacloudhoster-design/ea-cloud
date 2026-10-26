import { type Request, type Response, type NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface AuthRequest extends Request {
  userId?: number;
  userRole?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const principal = (req as any).browserPrincipal;
  if (!principal || principal.kind !== "portal") {
    res.status(401).json({ error: "Unauthorized" }); return;
  }
  req.userId = principal.id;
  req.userRole = principal.role;
  next();
}

export function requireRole(role: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.userRole !== role) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

export function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.userRole !== "superadmin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  });
}
