import { type Request, type Response, type NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface AuthRequest extends Request {
  userId?: number;
  userRole?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const [userId, role] = Buffer.from(token, "base64").toString().split(":");
    if (!userId || !role) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
    req.userId = parseInt(userId);
    req.userRole = role;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
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
