/** Only persisted backend facts enter these formatters. Never use scanner/chart prices as fills. */
export type PushContent = { title: string; body: string; url: string };
export const robotNotification = (
  kind: "started" | "stopped",
): PushContent => ({
  title: "EA Cloud",
  body:
    kind === "started"
      ? "Robot started successfully."
      : "Robot stopped successfully.",
  url: "/ea-app/?tab=home&activity=1",
});
const symbolPattern = /^[A-Za-z0-9_.#-]{1,40}$/;
function fillPrice(value: unknown) {
  const text =
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : typeof value === "string"
        ? value
        : "";
  if (!/^\d{1,16}(?:\.\d{1,12})?$/.test(text) || Number(text) <= 0) return null;
  const [whole, fraction = ""] = text.split(".");
  return whole + "." + fraction.padEnd(2, "0");
}
export function executionNotification(row: {
  clientId?: number;
  id: number;
  signalId: number;
  status: string;
  signalKind: string;
  symbol: string;
  action?: string | null;
  ticket?: string | null;
  retcode?: number | null;
  retryable?: number;
  errorMessage?: string | null;
  vpsResponse?: string | null;
}): {
  kind: "trade_alert" | "trade_executed" | "trade_failed";
  sourceKey: string;
  content: PushContent;
} | null {
  if (
    !Number.isSafeInteger(row.id) ||
    !Number.isSafeInteger(row.signalId) ||
    !symbolPattern.test(row.symbol) ||
    row.signalKind !== "OPEN" ||
    !["BUY", "SELL"].includes(row.action || "")
  )
    return null;
  const label = `${row.symbol} ${row.action}`,
    url = "/ea-app/?tab=metatrader&activity=1";
  if (row.status === "pending")
    return {
      kind: "trade_alert",
      sourceKey: `signal:${row.signalId}:alert`,
      content: {
        title: "EA Cloud — Trade Alert",
        body: `${label} signal received.`,
        url,
      },
    };
  if (
    row.status === "success" &&
    row.ticket &&
    [10009, 10010].includes(row.retcode ?? 0)
  ) {
    let receipt;
    try {
      receipt = JSON.parse(row.vpsResponse || "null");
    } catch {
      return null;
    }
    const price = fillPrice(receipt?.price);
    if (!price) return null;
    return {
      kind: "trade_executed",
      sourceKey: `execution:${row.id}:executed`,
      content: {
        title: "EA Cloud — Trade Executed",
        body: `${label} executed at ${price}.`,
        url,
      },
    };
  }
  if (
    (row.status === "failed" && row.retryable !== 1) ||
    row.status === "skipped"
  ) {
    const reasons: Record<number, string> = {
      10019: "Insufficient margin.",
      10014: "Invalid lot size.",
      10017: "Trading disabled.",
      10006: "Broker rejected order.",
      10018: "Market closed.",
    };
    let reason = reasons[row.retcode ?? 0];
    // Match actual known backend reasons, never expose raw messages/URLs/credentials.
    if (!reason) {
      const text = (row.errorMessage || "").trim().toLowerCase();
      if (
        /^(copying disabled|copy trading disabled|robot inactive|copy trading is disabled|bot disabled \(copying paused\))$/.test(
          text,
        )
      )
        reason = "Robot is not active.";
      else if (
        /^(mt5 not connected|mt5 account not connected|mt5 disconnected|mt5 account disconnected)$/.test(
          text,
        )
      )
        reason = "MT5 account disconnected.";
    }
    return {
      kind: "trade_failed",
      sourceKey: `execution:${row.id}:failed`,
      content: {
        title: "EA Cloud — Trade Failed",
        body: `${label} failed. ${reason || "See execution details in EA Cloud."}`,
        url,
      },
    };
  }
  return null;
}

/** A confirmed saved broker variation, never a guessed canonical symbol. */
export function symbolConfiguredNotification(
  symbol: string,
): PushContent | null {
  if (!symbol || symbol.length > 200 || /[\u0000-\u001f\u007f]/.test(symbol))
    return null;
  return {
    title: "Symbol Configured",
    body: `${symbol} configured successfully.`,
    url: "/ea-app/?tab=home&activity=1",
  };
}
