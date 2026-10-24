/** Only a real authentication adapter may emit verified connected/failure outcomes. */
export type Mt5ConnectionOutcome =
  | { status: "connected"; verified: true }
  | { status: "backend-unreachable" | "authentication-failed" | "unverified" };
export type AssistantEvent =
  | { type: "bot-request"; enabled: boolean }
  | { type: "bot-saved"; enabled: boolean }
  | { type: "bot-failed"; enabled: boolean }
  | { type: "mt5-start"; broker: string; server: string }
  | { type: "mt5-unverified" }
  | { type: "mt5-result"; outcome: Mt5ConnectionOutcome }
  | { type: "scan-start"; kind?: "chart" | "fundamental" }
  | { type: "scan-complete"; record: unknown }
  | { type: "scan-failed" }
  | { type: "symbol-saved"; symbol: string }
  | { type: "trade-execution"; execution: unknown }
  | { type: "trading-error"; id: string };
export function assistantEvent(event: AssistantEvent) {
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("ea:assistant", { detail: event }));
}
