import { reportSessionFailure } from "./session-diagnostics";
import { EventEmitter } from "node:events";
import { createHash, randomBytes } from "node:crypto";
import { pool } from "@workspace/db";
import type { Request, Response, NextFunction } from "express";

export const browserSessionEvents = new EventEmitter();
export type SessionKind = "portal" | "client";
export const sessionCookie = (kind: SessionKind) => `ea_${kind}_session`;
const idleMs = 30 * 86400000,
  absoluteMs = 90 * 86400000;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const identityHint = (id: number, role: string) =>
  Buffer.from(`${id}:${role}:cookie`).toString("base64");
const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/api",
};
export function readSessionCookie(
  req: { headers: { cookie?: string } },
  kind: SessionKind,
) {
  const value = String(req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(sessionCookie(kind) + "="))
    ?.slice(sessionCookie(kind).length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export function trustedBrowserOrigin(req: any) {
  const origin = req.headers.origin;
  if (!origin) return req.headers["sec-fetch-site"] !== "cross-site";
  const allowed = [
    process.env.PUBLIC_WEBSITE_ORIGIN,
    ...(process.env.AUTH_ALLOWED_ORIGINS || "").split(","),
    `${req.protocol}://${req.get("host")}`,
  ].filter(Boolean);
  return allowed.some((value) => {
    try {
      return new URL(value!).origin === origin;
    } catch {
      return false;
    }
  });
}
export async function issueBrowserSession(
  req: Request,
  res: Response,
  kind: SessionKind,
  account: { id: number; role?: string; password: string },
) {
  const token = randomBytes(32).toString("hex"),
    now = Date.now();
  // Replace only the current browser's session of this kind, preventing fixation.
  const old = readSessionCookie(req, kind);
  if (old) {
    await pool.query("DELETE FROM browser_sessions WHERE token_hash=$1", [
      hash(old),
    ]);
    browserSessionEvents.emit("revoke", hash(old));
  }
  await pool.query(
    "INSERT INTO browser_sessions(token_hash,kind,account_id,credential_hash,expires_at,absolute_expires_at,last_seen_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      hash(token),
      kind,
      account.id,
      hash(account.password),
      new Date(now + idleMs),
      new Date(now + absoluteMs),
      new Date(now),
    ],
  );
  res.cookie(sessionCookie(kind), token, { ...cookieOptions, maxAge: idleMs });
  res.setHeader("Cache-Control", "no-store");
  return identityHint(account.id, kind === "client" ? "client" : account.role!);
}
export async function verifyBrowserSession(
  req: { headers: { cookie?: string } },
  kind: SessionKind,
) {
  const token = readSessionCookie(req, kind);
  if (!token) return null;
  const result = await pool.query(
    "SELECT * FROM browser_sessions WHERE token_hash=$1 AND kind=$2 AND expires_at>now() AND absolute_expires_at>now()",
    [hash(token), kind],
  );
  const session = result.rows[0];
  if (!session) return null;
  const table = kind === "client" ? "app_access" : "users";
  const { rows } = await pool.query(`SELECT * FROM ${table} WHERE id=$1`, [
    session.account_id,
  ]);
  const account = rows[0];
  if (
    !account ||
    session.credential_hash !== hash(account.password) ||
    !["pending", "approved", "active"].includes(account.status) ||
    (kind === "portal" &&
      !["mentor", "admin", "superadmin"].includes(account.role))
  ) {
    await pool.query("DELETE FROM browser_sessions WHERE token_hash=$1", [
      hash(token),
    ]);
    return null;
  }
  return {
    id: account.id,
    role: kind === "client" ? "client" : account.role,
    status: account.status,
    hash: hash(token),
    token,
    session,
    kind,
  };
}
export async function revokeBrowserSessions(req: Request, res: Response) {
  for (const kind of ["portal", "client"] as const) {
    const value = readSessionCookie(req, kind);
    if (value) {
      if (kind === "portal")
        await pool.query(
          "DELETE FROM scanner_admin_sessions WHERE user_id IN (SELECT account_id FROM browser_sessions WHERE token_hash=$1 AND kind='portal')",
          [hash(value)],
        );
      await pool.query("DELETE FROM browser_sessions WHERE token_hash=$1", [
        hash(value),
      ]);
      browserSessionEvents.emit("revoke", hash(value));
    }
    res.clearCookie(sessionCookie(kind), cookieOptions);
  }
  // Remove any independently confirmed scanner administration session too.
  const scanner = req.headers.authorization?.slice(7);
  if (scanner?.startsWith("easc_"))
    await pool.query("DELETE FROM scanner_admin_sessions WHERE token_hash=$1", [
      hash(scanner),
    ]);
  res.clearCookie("ea_push_session", {
    ...cookieOptions,
    sameSite: "strict",
    path: "/api/app/push",
  });
  res.setHeader("Cache-Control", "no-store");
}
/** The sole browser credential boundary. Legacy identity strings are never credentials.
 * Existing feature handlers receive an internal identity header ONLY after cookie verification.
 * Scanner management retains its independently verified short-lived step-up credential.
 */
export async function browserSessionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const scannerStepUp = /^\/superadmin\/scanner(?:\/|$)/.test(req.path);
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    !trustedBrowserOrigin(req)
  ) {
    res.status(403).json({ error: "Request origin is not allowed." });
    return;
  }
  if (scannerStepUp) {
    next();
    return;
  }
  delete req.headers.authorization;
  const kind = /^\/(?:app|client)(?:\/|$)/.test(req.path) ? "client" : "portal";
  try {
    const principal = await verifyBrowserSession(req, kind);
    if (principal) {
      res.setHeader("Cache-Control", "no-store");
      // Pending accounts may inspect their identity/setup, never portal resources.
      if (
        kind === "portal" &&
        principal.status === "pending" &&
        !["/auth/me", "/auth/logout", "/auth/login", "/auth/register"].includes(
          req.path,
        )
      ) {
        res.status(403).json({ error: "Account approval required." });
        return;
      }
      (req as any).browserPrincipal = principal;
      req.headers.authorization = `Bearer ${identityHint(principal.id, principal.role)}`;
      if (
        Date.now() - new Date(principal.session.last_seen_at).getTime() >
        86400000
      ) {
        const expires = Math.min(
          Date.now() + idleMs,
          new Date(principal.session.absolute_expires_at).getTime(),
        );
        await pool.query(
          "UPDATE browser_sessions SET expires_at=$2,last_seen_at=now() WHERE token_hash=$1",
          [principal.hash, new Date(expires)],
        );
        res.cookie(sessionCookie(kind), principal.token, {
          ...cookieOptions,
          maxAge: expires - Date.now(),
        });
      }
    }
    next();
  } catch (error) {
    // Unavailable verification never invalidates a persistent browser cookie.
    reportSessionFailure(req,res,error,"session");
  }
}
