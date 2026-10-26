import { createHash, randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";
import { clearPushSession } from "./push-session";

export type SessionKind = "client" | "portal";
const duration = 30 * 86400000;
const names = { client: "ea_client_session", portal: "ea_portal_session" };
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const options = (req: Request) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production" || req.secure,
  sameSite: "lax" as const,
  path: "/",
});
export function cookieValue(
  req: { headers: { cookie?: string } },
  kind: SessionKind,
) {
  const value = req.headers.cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(names[kind] + "="))
    ?.slice(names[kind].length + 1);
  try {
    return value ? decodeURIComponent(value) : null;
  } catch {
    return null;
  }
}
export async function issueSession(
  req: Request,
  res: Response,
  account: { id: number; password: string; role?: string },
  kind: SessionKind,
) {
  const token = randomBytes(32).toString("base64url");
  // Replace this browser's prior session without terminating sessions on other devices.
  const prior = cookieValue(req, kind);
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    await connection.query(
      "INSERT INTO auth_sessions (token_hash,account_id,kind,role,credential_hash,expires_at) VALUES ($1,$2,$3,$4,$5,$6)",
      [
        digest(token),
        account.id,
        kind,
        account.role || "client",
        digest(account.password),
        new Date(Date.now() + duration),
      ],
    );
    if (prior)
      await connection.query(
        "UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1",
        [digest(prior)],
      );
    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
  res.cookie(names[kind], token, { ...options(req), maxAge: duration });
  res.setHeader("Cache-Control", "no-store");
  return token;
}
export async function resolveSession(
  token: string | null,
  expected?: SessionKind,
) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const {
    rows: [session],
  } = await pool.query(
    "SELECT * FROM auth_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > now()",
    [digest(token)],
  );
  if (!session || (expected && session.kind !== expected)) return null;
  const table = session.kind === "client" ? "app_access" : "users";
  const {
    rows: [account],
  } = await pool.query(`SELECT * FROM ${table} WHERE id=$1`, [
    session.account_id,
  ]);
  if (
    !account ||
    digest(account.password) !== session.credential_hash ||
    (session.kind === "portal" &&
      (account.status !== "approved" || account.role !== session.role)) ||
    (session.kind === "client" &&
      !["approved", "pending"].includes(account.status))
  )
    return null;
  return {
    id: account.id as number,
    role: session.role as string,
    kind: session.kind as SessionKind,
    tokenHash: session.token_hash as string,
    createdAt: new Date(session.created_at).getTime(),
  };
}
export type VerifiedSession = NonNullable<
  Awaited<ReturnType<typeof resolveSession>>
>;
export function sameOrigin(req: Request) {
  const origin = req.get("origin");
  if (req.get("sec-fetch-site") === "cross-site") return false;
  if (!origin) return !req.headers.cookie; // Native bearer clients don't send browser cookies.
  try {
    return (
      new URL(origin).host === (req.get("x-forwarded-host") || req.get("host"))
    );
  } catch {
    return false;
  }
}
// All legacy route decoders are behind this boundary. Never forward caller-supplied
// base64 identities: only a verified database session can produce an internal identity.
export async function browserSession(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  res.setHeader("Cache-Control", "no-store");
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  delete req.headers.authorization;
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !sameOrigin(req)) {
    res.status(403).json({ error: "Cross-origin request denied" });
    return;
  }
  const clientMarker =
    bearer === "cookie-client" ||
    !!(
      bearer &&
      /^[1-9]\d*:client:cookie$/.test(Buffer.from(bearer, "base64").toString())
    );
  const kind: SessionKind =
    clientMarker ||
    req.path.startsWith("/app/") ||
    req.path.startsWith("/client/")
      ? "client"
      : "portal";
  const marker = bearer === "cookie-portal" || clientMarker;
  const token = bearer && !marker ? bearer : cookieValue(req, kind);
  try {
    const session = await resolveSession(token, kind);
    if (session) {
      (req as Request & { verifiedSession?: VerifiedSession }).verifiedSession =
        session;
      req.headers.authorization = `Bearer ${Buffer.from(`${session.id}:${session.role}:${session.createdAt}`).toString("base64")}`;
    }
    next();
  } catch (err) {
    next(err);
  } // Storage outages never clear the browser session.
}
export async function revokeBrowserSessions(req: Request, res: Response) {
  const tokens = [
    cookieValue(req, "client"),
    cookieValue(req, "portal"),
  ].filter((x): x is string => !!x);
  const session = (req as Request & { verifiedSession?: VerifiedSession })
    .verifiedSession;
  const hashes = tokens.map(digest);
  if (session) hashes.push(session.tokenHash);
  if (hashes.length)
    await pool.query(
      "UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=ANY($1::text[])",
      [hashes],
    );
  for (const kind of ["client", "portal"] as const)
    res.clearCookie(names[kind], options(req));
  clearPushSession(res);
  res.json({ success: true });
}
