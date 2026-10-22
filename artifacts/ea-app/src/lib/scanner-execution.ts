import { scannerExecutionReceiptSchema } from "../../../../lib/api-zod/src/scanner-execution";
import { scannerRequest } from "./scanner";
import type { ScannerTradeSettings } from "./scanner-trade-settings";

// UI idempotency guard only. A future sender still needs durable server-side
// request-ID/account/quantity binding and reconciliation before it may send.
export function createScannerSubmission(send = scannerRequest, makeId = () => crypto.randomUUID()) {
  let pending = false;
  let unresolved = false;
  let terminalMessage: string | null = null;
  let id: string | null = null, binding = "";
  return {
    async submit(scanId: string, token: string | null | undefined, settings: ScannerTradeSettings, signal: AbortSignal): Promise<string | null> {
      if (pending) return null;
      if (!token) return "Sign in to execute this trade.";
      if (unresolved) return terminalMessage ?? "Execution status could not be confirmed. Check your account before retrying.";
      if (!Number.isInteger(settings.lotUnits) || settings.lotUnits < 1 || settings.lotUnits > 5000 || !Number.isInteger(settings.positions) || settings.positions < 1 || settings.positions > 20)
        return "Choose a valid lot size and number of trades.";
      const key = `${scanId}:${settings.lotUnits}:${settings.positions}`;
      if (key !== binding) { id = makeId(); binding = key; }
      pending = true;
      try {
        const raw = await send("execute", token, signal, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scanId, requestId: id, confirmed: true, lotSize: settings.lotUnits / 100, positions: settings.positions }) });
        const receipt = scannerExecutionReceiptSchema.safeParse(raw);
        if (!receipt.success || receipt.data.scanId !== scanId || receipt.data.requestId !== id || receipt.data.requestedPositions !== settings.positions) {
          unresolved = true;
          return "Execution status could not be confirmed. Check your account before retrying.";
        }
        const accepted = receipt.data.outcomes.filter(outcome => outcome.status === "accepted").length;
        const rejected = receipt.data.outcomes.length - accepted;
        // A verified receipt is terminal for this explicit confirmation. Opening
        // the panel again must not resubmit an already accepted batch.
        unresolved = true;
        terminalMessage = `${accepted} ${accepted === 1 ? "trade" : "trades"} accepted; ${rejected} rejected.`;
        return terminalMessage;
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (!code || code === "SCANNER_UNAVAILABLE") unresolved = true;
        return unresolved ? "Execution status could not be confirmed. Check your account before retrying." : (error as Error).message;
      } finally { pending = false; }
    },
  };
}
