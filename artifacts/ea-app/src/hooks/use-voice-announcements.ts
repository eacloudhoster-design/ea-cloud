import {commonNaturalAnnouncements} from "../../../../lib/api-zod/src/voice-announcements";
import { useEffect, useRef } from "react";
import type { VisualModes } from "./use-visual-modes";
import { VoiceAnnouncementService } from "@/lib/voice-announcement-service";
import { cleanText, modeNames } from "@/lib/assistant-text";
import { scannerAnnouncement, tradeAnnouncement, mt5AttemptAnnouncement, mt5ResultAnnouncement } from "@/lib/voice-announcement-text";
import type { AssistantEvent } from "@/lib/assistant-events";
/** Automatic announcements; bundled Kokoro clips and private on-device synthesis only. */
export function useVoiceAnnouncements(token: string | null, ready: boolean, botName: string, modes: VisualModes, preloadReady = ready) {
  const context = useRef({ ready, botName });
  context.current = { ready, botName };
  const service = useRef<VoiceAnnouncementService | null>(null);
  const welcome = useRef(false);
  const greetNow = useRef<() => void>(() => {});
  const lastMode = useRef<string | null>(null);
  useEffect(() => {
    if (!preloadReady || !token) return;
    const voice = new VoiceAnnouncementService(token);
    service.current = voice;
    welcome.current = false;
    lastMode.current = null;
    const greet = () => {
      if (welcome.current || !context.current.ready) return;
      welcome.current = true;
      voice.announce(`Welcome to ${(cleanText(context.current.botName, 120) || "EA Cloud Pro")}.`, "welcome", 1);
    };
    greetNow.current = greet;
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
      if (detail.type === "bot-saved" && !detail.enabled)voice.announce("Robot stopped.",`stop-${Date.now()}`,3,"bot");
      if(detail.type === "bot-progress"){
        const key=`bot-${detail.phase}-${Date.now()}`;
        if(detail.phase==='activated'){
          voice.announce("Robot started.",key,3,"bot");
          voice.announce("Connecting to EA Cloud service.",key+'-connecting',3,"bot",true);
        }else voice.announce(detail.phase==='connected'?"Connected to trade server.":"Ready to trade.",key,3,"bot",true);
      }
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
      if (detail.type === "symbol-saved") voice.announce("Symbol configured.", `symbol-${detail.saveId ?? crypto.randomUUID()}`, 1, "symbol", true);
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
    const online=()=>{if(!document.hidden)voice.foreground();};
    window.addEventListener("online",online);
    greet();
    voice.preload([
      ...commonNaturalAnnouncements,
      `Welcome to ${(cleanText(context.current.botName,120) || "EA Cloud Pro")}.`,
      ...modeNames.map(mode => `${mode} mode activated.`),
      `${(cleanText(context.current.botName,120) || "EA Cloud Pro")} activated.`,
      `${(cleanText(context.current.botName,120) || "EA Cloud Pro")} deactivated.`,
      "Robot started.", "Robot stopped.", "Connecting to EA Cloud service.", "Connected to trade server.", "Ready to trade.",
      "No trades currently open.", "Chart analysis started.", "Fundamental analysis started.",
    ]);
    return () => {
      greetNow.current = () => {};
      voice.dispose();
      if (service.current === voice) service.current = null;
      window.removeEventListener("ea:assistant", handler);
      window.removeEventListener("pointerdown", gesture, true);
      window.removeEventListener("touchend", gesture, true);
      window.removeEventListener("keydown", gesture, true);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", show);
      window.removeEventListener("online",online);
    };
  }, [token, preloadReady]);
  useEffect(() => { if (ready) greetNow.current(); }, [ready, token]);
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
