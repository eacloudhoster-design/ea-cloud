import { db, appAccessTable, scannerEntitlementsTable, scannerReportsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { evaluateScannerAccess } from "./scanner-access";
import { ScannerError } from "./scanner-gemini";

// Serialize paid scans against grants/revocations. A successful saved report costs
// exactly one credit. Failed/cancelled calls roll back and cannot consume credits.
// The row lock deliberately covers the bounded provider call; admin edits wait for
// an already running scan, then govern all subsequent requests.
export async function completeScannerReport(clientId: number, kind: "chart" | "fundamental", strategy: string | null, generate: () => Promise<unknown>, signal: AbortSignal) {
  return db.transaction(async tx => {
    const [client] = await tx.select().from(appAccessTable).where(eq(appAccessTable.id, clientId)).for("no key update");
    const [entitlement] = await tx.select().from(scannerEntitlementsTable).where(eq(scannerEntitlementsTable.clientId, clientId)).for("update");
    const decision = evaluateScannerAccess(client ?? null, entitlement ?? null);
    if (!decision.allowed) throw new ScannerError(decision.error, decision.status, decision.code, "access", false);
    if (entitlement.creditsRemaining !== null && entitlement.creditsRemaining <= 0) throw new ScannerError("Your scanner credits are exhausted. Contact support to top up.", 403, "SCANNER_CREDITS_EXHAUSTED", "access", false);
    if (signal.aborted) throw new ScannerError("Analysis cancelled. No credit was charged.");
    const report = await generate();
    if (signal.aborted) throw new ScannerError("Analysis cancelled. No credit was charged.");
    const [saved] = await tx.insert(scannerReportsTable).values({ clientId, kind, strategy, report }).returning();
    if (entitlement.creditsRemaining !== null) await tx.update(scannerEntitlementsTable).set({ creditsRemaining: sql`${scannerEntitlementsTable.creditsRemaining} - 1`, updatedAt: new Date(Math.max(Date.now(), (entitlement.updatedAt?.getTime() ?? 0) + 1)) }).where(eq(scannerEntitlementsTable.clientId, clientId));
    return saved;
  });
}
