import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const scannerGrantSchema = z.object({
  status: z.enum(["active", "expired", "revoked"]),
  creditsRemaining: z.number().int().min(0).max(1_000_000).nullable(),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  reference: z.string().trim().min(1).max(300),
  // Optimistic concurrency: null means no entitlement existed when opened.
  expectedUpdatedAt: z.string().datetime({ offset: true }).nullable(),
}).strict();
export const hashScannerSession = (token: string) => createHash("sha256").update(token).digest("hex");
export const newScannerSession = () => `easc_${randomBytes(32).toString("hex")}`;
export function scannerPasswordMatches(password: string, hash: string) {
  const actual = createHash("sha256").update(password + "ea_cloud_salt_2024").digest();
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function approvedScannerAdmin(user: { role: string; status: string } | null | undefined) {
  return user?.role === "superadmin" && user.status === "approved";
}
