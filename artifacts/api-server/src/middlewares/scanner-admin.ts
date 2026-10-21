import type { Response, NextFunction } from "express";
import { db, usersTable, scannerAdminSessionsTable } from "@workspace/db";
import { and, eq, gt } from "drizzle-orm";
import type { AuthRequest } from "./auth";
import { approvedScannerAdmin, hashScannerSession } from "../lib/scanner-admin";

// Opaque tokens are issued only after password verification. Legacy role strings
// are never sufficient to manage paid scanner rights.
export async function requireScannerAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "no-store");
  const token = req.headers.authorization?.slice(7);
  if (!req.headers.authorization?.startsWith("Bearer ") || !token || !/^easc_[a-f0-9]{64}$/.test(token)) {
    res.status(401).json({ error: "Confirm your superadmin password to manage the scanner.", code: "SCANNER_ADMIN_SESSION_REQUIRED" }); return;
  }
  try {
    const [session] = await db.select().from(scannerAdminSessionsTable).where(and(eq(scannerAdminSessionsTable.tokenHash, hashScannerSession(token)), gt(scannerAdminSessionsTable.expiresAt, new Date()))).limit(1);
    if (!session) { res.status(401).json({ error: "Scanner admin session expired. Confirm your password again." }); return; }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId)).limit(1);
    if (!approvedScannerAdmin(user)) { res.status(403).json({ error: "Only approved superadmins can manage or test the scanner." }); return; }
    req.userId = user.id; req.userRole = user.role; next();
  } catch { res.status(503).json({ error: "Scanner administration is unavailable. Check database connectivity and the scanner-management migration." }); }
}
