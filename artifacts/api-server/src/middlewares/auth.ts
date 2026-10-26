import { type Request, type Response, type NextFunction } from "express";
import type { VerifiedSession } from "../lib/browser-session";

export interface AuthRequest extends Request {
  verifiedSession?: VerifiedSession;
  userId?: number;
  userRole?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const session = req.verifiedSession;
  if (!session || session.kind !== "portal") {
    res.status(401).json({ error: "Unauthorized" }); return;
  }
  req.userId = session.id;
  req.userRole = session.role;
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
