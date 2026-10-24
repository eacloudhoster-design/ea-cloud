import { useEffect, useRef } from "react";
import type { VisualModes } from "./use-visual-modes";
import { VoiceAnnouncementService } from "@/lib/voice-announcement-service";
import { cleanText, modeNames, speakSymbol } from "@/lib/assistant-text";
import { scannerAnnouncement, tradeAnnouncement, mt5AttemptAnnouncement, mt5ResultAnnouncement } from "@/lib/voice-announcement-text";
import type { AssistantEvent } from "@/lib/assistant-events";
/** Automatic, non-conversational announcements. Never reads an API to generate speech. */
export function useVoiceAnnouncements(token: string | null, ready: boolean, botName: string, modes: VisualModes) {
  const context = useRef({ ready, botName });
  context.current = { ready, botName };
  const service = useRef<VoiceAnnouncementService | null>(null);
  const welcome = useRef(false);
  const lastMode = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !token) return;
    const voice = new VoiceAnnouncementService();
    service.current = voice;
    welcome.current = false;
    lastMode.current = null;
    const greet = () => {
      if (welcome.current || !context.current.ready) return;
      welcome.current = true;
      voice.announce(`Welcome to ${(cleanText(context.current.botName, 120) || "EA Cloud Pro")}.`, "welcome", 1);
    };
    const gesture = () => { greet(); voice.unlock(); };
    const visibility = () => { if (document.hidden) voice.suspend(); else voice.foreground(); };
    const leave = () => voice.suspend();
    const show = (event: PageTransitionEvent) => {
      voice.foreground();
      if (event.persisted) greet();
    };
    let mt5Attempt = 0;
    const handler = (event: Event) => {
      if (!context.current.ready || document.hidden) return;
      const detail = (event as CustomEvent<AssistantEvent>).detail;
      if (!detail) return;
      if (detail.type === "bot-request") voice.discard("bot");
      if (detail.type === "bot-saved") voice.announce(`${(cleanText(context.current.botName,120) || "EA Cloud Pro")} ${detail.enabled ? "activated" : "deactivated"}.`, `bot-${detail.enabled}-${Date.now()}`, 3, "bot");
      if (detail.type === "bot-failed") voice.announce(`Bot ${detail.enabled ? "activation" : "deactivation"} failed.`, `bot-failed-${detail.enabled}-${Date.now()}`, 3, "bot");
      if (detail.type === "mt5-start") {
        mt5Attempt++;
        voice.announce(mt5AttemptAnnouncement(detail.broker, detail.server), `mt5-start-${mt5Attempt}`, 2, "mt5");
      }
      if (detail.type === "mt5-unverified" || detail.type === "mt5-result") {
        const outcome = detail.type === "mt5-unverified" ? {status:"unverified" as const} : detail.outcome;
        const text = mt5ResultAnnouncement(outcome);
        if (text) voice.announce(text, `mt5-result-${mt5Attempt}-${outcome.status}`, outcome.status === "unverified" ? 2 : 3, "mt5");
      }
      if (detail.type === "symbol-saved") voice.announce(`${speakSymbol(detail.symbol)} configured.`, `symbol-${detail.symbol}-${Date.now()}`, 2, "symbol");
      if (detail.type === "scan-start") voice.announce(detail.kind === "fundamental" ? "Fundamental analysis started." : "Chart analysis started.", `scan-start-${Date.now()}`, 2, "scan");
      if (detail.type === "scan-complete") {
        const text = scannerAnnouncement(detail.record);
        if (text) voice.announce(text, `scan-${(detail.record as any)?.id}`, 2, "scan");
      }
      if (detail.type === "scan-failed") voice.announce("Chart analysis failed. Check the scanner message.", `scan-failed-${Date.now()}`, 2, "scan");
      if (detail.type === "trade-execution") {
        const row = detail.execution as any;
        const age = Date.now() - new Date(row?.updatedAt).getTime();
        const text = tradeAnnouncement(row);
        if (text && age >= -5000 && age < 60000) voice.announce(text, `execution-${row.id}-${row.status}-${row.retcode}-${row.ticket}`, 3);
      }
      if (detail.type === "trading-error") voice.announce("A trading error occurred. Check the trading activity monitor.", `activity-${detail.id}`, 3);
    };
    window.addEventListener("ea:assistant", handler);
    window.addEventListener("pointerdown", gesture, { passive: true, capture: true });
    window.addEventListener("touchend", gesture, { passive: true, capture: true });
    window.addEventListener("keydown", gesture, true);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", show);
    greet();
    return () => {
      voice.dispose();
      if (service.current === voice) service.current = null;
      window.removeEventListener("ea:assistant", handler);
      window.removeEventListener("pointerdown", gesture, true);
      window.removeEventListener("touchend", gesture, true);
      window.removeEventListener("keydown", gesture, true);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", show);
    };
  }, [token, ready]);
  const activeMode = modes.imageReady ? modes.activeMode : null;
  useEffect(() => {
    if (!ready || activeMode === null) return;
    const identity = `${modes.ea?.id}:${activeMode}`;
    if (lastMode.current === null) { lastMode.current = identity; return; }
    if (lastMode.current === identity) return;
    // Coalesce only rapid image commits; no artificial cloud or long speech delay.
    const timer = setTimeout(() => {
      lastMode.current = identity;
      service.current?.announce(`${modeNames[activeMode]} mode activated.`, `mode-${identity}-${Date.now()}`, 2, "mode");
    }, 100);
    return () => clearTimeout(timer);
  }, [ready, activeMode, modes.ea?.id]);
}
