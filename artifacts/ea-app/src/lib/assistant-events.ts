export type AssistantEvent =
  | { type: "bot-request"; enabled: boolean }
  | { type: "bot-saved"; enabled: boolean }
  | { type: "bot-failed"; enabled: boolean }
  | { type: "mt5-start"; broker: string; server: string }
  | { type: "mt5-unverified" }
  | { type: "scan-start"; kind?: "chart" | "fundamental" }
  | { type: "scan-complete"; record: unknown }
  | { type: "scan-failed" };
export function assistantEvent(event: AssistantEvent) {
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("ea:assistant", { detail: event }));
}
