interface Client { id: number; status: string }
interface Entitlement { status: string; expiresAt: Date | null }
export type ScannerAccessDecision =
  | { allowed: true; source: "scanner" }
  | { allowed: false; status: 401 | 403; code: string; error: string; category: "access"; retryable: false };
const denied = (code: string, error: string, status: 401 | 403 = 403): ScannerAccessDecision => ({ allowed: false, status, code, error, category: "access", retryable: false });

// Scanner subscriptions/admin grants are independent of EA-hosting licences and client-supplied plans.
export function evaluateScannerAccess(client: Client | null, entitlement: Entitlement | null, now = Date.now()): ScannerAccessDecision {
  if (!client) return denied("SCANNER_SESSION_INVALID", "Your session is no longer valid. Please sign in again.", 401);
  if (client.status !== "approved") return denied("SCANNER_ACCOUNT_NOT_APPROVED", "Your account is not approved for scanner access. Contact support.");
  if (!entitlement) return denied("SCANNER_ACCESS_REQUIRED", "No scanner subscription or admin grant is linked to your account. Contact support to check scanner access.");
  if (entitlement.status === "revoked") return denied("SCANNER_ACCESS_REVOKED", "Scanner access has been revoked for this account. Contact support.");
  if (entitlement.status === "expired" || (entitlement.expiresAt !== null && (!Number.isFinite(entitlement.expiresAt.getTime()) || entitlement.expiresAt.getTime() <= now)))
    return denied("SCANNER_SUBSCRIPTION_EXPIRED", "Your scanner subscription has expired. Renew scanner access or contact support.");
  if (entitlement.status !== "active") return denied("SCANNER_ACCESS_INACTIVE", "Your scanner subscription or admin grant is inactive. Contact support.");
  return { allowed: true, source: "scanner" };
}
