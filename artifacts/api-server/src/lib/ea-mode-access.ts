import { db, licensesTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
type Client = { status: string; mentorId: number | null; licenseKey: string | null; email: string };
export type ModeAccess = { mentorId: number } | { code: string; error: string };
const denied = (code: string, error: string): ModeAccess => ({ code, error });
const email = (value: string | null | undefined) => value?.trim().toLowerCase() || "";
/** Read-only: validate persisted entitlements, never grant, renew or reassign them. */
export async function resolveEaModeAccess(client: Client | undefined, now = Date.now()): Promise<ModeAccess> {
  if (!client) return denied("ACCOUNT_NOT_FOUND", "Your account was not found. Sign in again.");
  if (client.status !== "approved") return denied("ACCOUNT_NOT_APPROVED", "Your account is not approved. Contact support.");
  const key = client.licenseKey?.trim();
  // An explicit key remains authoritative. Never replace a revoked/expired key
  // with an unrelated active email licence to evade its restriction.
  const rows = key
    ? await db.select().from(licensesTable).where(eq(licensesTable.key, key)).limit(1)
    : client.mentorId && email(client.email)
      ? await db.select().from(licensesTable).where(and(eq(licensesTable.mentorId, client.mentorId), sql`lower(trim(${licensesTable.clientEmail})) = ${email(client.email)}`))
      : [];
  if (!rows.length) return denied(key ? "LICENCE_NOT_FOUND" : "LICENCE_NOT_LINKED", key ? "Your linked EA licence was not found. Ask support to check the licence association." : "No EA licence is linked to this account. Activate your licence or ask support to check the association.");
  const owned = rows.filter(row => (!client.mentorId || row.mentorId === client.mentorId) &&
    (email(row.clientEmail) ? email(row.clientEmail) === email(client.email) : !!key && !!client.mentorId));
  if (!owned.length) return denied("LICENCE_ASSOCIATION_MISMATCH", "Your licence does not match this account and mentor. Ask support to correct the association.");
  const active = owned.filter(row => row.status === "active");
  if (!active.length && owned.some(row => row.status === "expired")) return denied("LICENCE_EXPIRED", "Your linked EA licence has expired. Contact your mentor.");
  if (!active.length) return denied("LICENCE_INACTIVE", "Your linked EA licence is inactive or revoked. Contact your mentor.");
  const valid = active.filter(row => row.expiresAt == null || (Number.isFinite(new Date(row.expiresAt).getTime()) && new Date(row.expiresAt).getTime() > now));
  if (!valid.length) return denied("LICENCE_EXPIRED", "Your linked EA licence has expired or has an invalid expiry date. Contact your mentor.");
  const mentorId = valid[0].mentorId;
  if (!Number.isSafeInteger(mentorId) || mentorId < 1) return denied("MENTOR_NOT_LINKED", "Your licence has no valid mentor association. Contact support.");
  return { mentorId };
}
