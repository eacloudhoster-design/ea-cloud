import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { VisualModes } from "./use-visual-modes";
import {
  VoiceQueue,
  normalizeVoicePreferences,
  defaultVoicePreferences,
  type VoicePreferences,
  type SpeechCategory,
} from "@/lib/voice-queue";
import {
  activeBot,
  answerIntent,
  cleanText,
  executionSpeech,
  freshFacts,
  modeNames,
  narrateAnalysis,
  money,
} from "@/lib/assistant-text";
import type { AssistantEvent } from "@/lib/assistant-events";
export function useVoiceAssistant(
  token: string | null,
  ready: boolean,
  botName: string,
  modes: VisualModes,
) {
  let account = "";
  try {
    account = atob(token || "").split(":")[0];
  } catch {}
  const key = `ea-cloud:client:${account}:voice`;
  const initial = useMemo(() => {
    try {
      return normalizeVoicePreferences(
        JSON.parse(localStorage.getItem(key) || "null"),
      );
    } catch {
      return { ...defaultVoicePreferences };
    }
  }, [key]);
  const [saved, setSaved] = useState({ key, value: initial });
  const prefs = saved.key === key ? saved.value : initial;
  const [view, setView] = useState({
    token,
    speaking: false,
    blocked: false,
    error: "",
    text: "",
    answer: "",
    listening: "",
  });
  const activeToken = useRef(token);
  activeToken.current = token;
  const engine = useMemo(
    () =>
      new VoiceQueue(token || "", (state) => {
        if (activeToken.current === token)
          setView((old) => ({ ...old, token, ...state }));
      }),
    [token],
  );
  const current = useRef(engine);
  current.current = engine;
  const context = useRef({ ready, botName, modes, prefs });
  context.current = { ready, botName, modes, prefs };
  const recognition = useRef<any>(null),
    micTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    questionAbort = useRef<AbortController | null>(null);
  const welcome = useRef<string | null>(null),
    lastFacts = useRef<any>(null),
    seenTrades = useRef<Map<number, string> | null>(null),
    stopExpected = useRef(false),
    requestedMode = useRef<number | null>(null),
    lastMode = useRef<string | null>(null);
  const api = async (path: string, body?: unknown, signal?: AbortSignal) => {
    const response = await fetch(`/api/app/assistant/${path}`, {
      method: body ? "POST" : "GET",
      cache: "no-store",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Assistant unavailable.");
    return data;
  };
  const say = (
    text: string,
    key: string,
    priority = 20,
    category: SpeechCategory = "automatic",
  ) => engine.enqueue(text, key, priority, category);
  const stopMic = () => {
    recognition.current?.abort();
    recognition.current = null;
    engine.microphone(false);
    if (micTimer.current) clearTimeout(micTimer.current);
    micTimer.current = null;
    setView((old) => ({ ...old, token, listening: "" }));
  };
  const stop = () => {
    engine.stop();
    stopMic();
    questionAbort.current?.abort();
  };
  const update = (patch: Partial<VoicePreferences>) => {
    const value = normalizeVoicePreferences({
      ...context.current.prefs,
      ...patch,
    });
    engine.configure({ ...value, enabled: value.enabled && ready });
    setSaved({ key, value });
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
    if (!value.enabled) stop();
  };
  useLayoutEffect(() => {
    engine.configure({ ...prefs, enabled: prefs.enabled && ready });
  }, [engine, prefs, ready]);
  useLayoutEffect(
    () => () => {
      engine.dispose();
      recognition.current?.abort();
      questionAbort.current?.abort();
      if (micTimer.current) clearTimeout(micTimer.current);
    },
    [engine],
  );
  const facts = async () => {
    const data = await api("facts");
    if (current.current !== engine) throw new Error("Session changed.");
    return data;
  };
  const ask = async (question: string) => {
    if (!ready || !token) return;
    if (
      /^(please )?(stop (speaking|talking)|be quiet|cancel voice)[.!]?$/i.test(
        question.trim(),
      )
    ) {
      stop();
      setView((old) => ({ ...old, token, answer: "Speech stopped." }));
      return;
    }
    engine.unlock();
    engine.stop();
    stopMic();
    questionAbort.current?.abort();
    const controller = new AbortController();
    questionAbort.current = controller;
    setView((old) => ({ ...old, token, error: "", answer: "Checking…" }));
    try {
      const intent = await api(
        "intent",
        { question: cleanText(question, 700) },
        controller.signal,
      );
      const data = ["mode", "help", "unsupported"].includes(intent.intent)
        ? null
        : await api("facts", undefined, controller.signal);
      if (controller.signal.aborted || current.current !== engine) return;
      const reply = answerIntent(
        intent.intent,
        data,
        context.current.modes.imageReady
          ? context.current.modes.activeMode
          : null,
      );
      setView((old) => ({ ...old, token, answer: reply.text }));
      say(
        reply.financial && !context.current.prefs.accountSpeech
          ? "Your verified account information is shown in the assistant response. Enable spoken account values to hear it aloud."
          : reply.text,
        `answer-${Date.now()}`,
        60,
        "manual",
      );
    } catch (error) {
      if (!controller.signal.aborted && current.current === engine)
        setView((old) => ({
          ...old,
          token,
          answer: "",
          error: (error as Error).message,
        }));
    }
  };
  const listen = () => {
    if (!prefs.enabled || !ready) return;
    if (recognition.current) {
      stopMic();
      return;
    }
    engine.unlock();
    engine.stop();
    const Constructor =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!Constructor) {
      setView((old) => ({
        ...old,
        token,
        error:
          "Speech recognition is unavailable here. Use the typed question field.",
      }));
      return;
    }
    engine.microphone(true);
    const mic = new Constructor();
    recognition.current = mic;
    mic.continuous = false;
    mic.interimResults = false;
    mic.lang = "en-US";
    let answered = false;
    setView((old) => ({
      ...old,
      token,
      listening: "Requesting microphone permission…",
      error: "",
    }));
    mic.onstart = () => {
      if (
        recognition.current !== mic ||
        current.current !== engine ||
        !context.current.prefs.enabled ||
        !context.current.ready
      ) {
        mic.abort();
        return;
      }
      setView((old) => ({
        ...old,
        token,
        listening: "Listening — microphone active",
      }));
    };
    mic.onresult = (event: any) => {
      if (
        answered ||
        recognition.current !== mic ||
        current.current !== engine ||
        !context.current.prefs.enabled
      )
        return;
      answered = true;
      const transcript = event.results?.[0]?.[0]?.transcript;
      mic.stop();
      if (typeof transcript === "string") void ask(transcript);
    };
    mic.onerror = (event: any) => {
      if (recognition.current !== mic) return;
      recognition.current = null;
      if (micTimer.current) clearTimeout(micTimer.current);
      engine.microphone(false);
      if (current.current === engine)
        setView((old) => ({
          ...old,
          token,
          listening: "",
          error:
            event.error === "not-allowed"
              ? "Microphone permission was denied. You can type your question."
              : event.error === "aborted"
                ? ""
                : "Microphone input failed. Try again or type your question.",
        }));
    };
    mic.onend = () => {
      if (recognition.current !== mic) return;
      engine.microphone(false);
      if (recognition.current === mic) recognition.current = null;
      if (micTimer.current) clearTimeout(micTimer.current);
      if (current.current === engine)
        setView((old) => ({ ...old, token, listening: "" }));
    };
    try {
      mic.start();
      micTimer.current = setTimeout(() => {
        if (recognition.current === mic) stopMic();
      }, 20000);
    } catch {
      stopMic();
      setView((old) => ({
        ...old,
        token,
        error: "Microphone could not start. Use typed questions instead.",
      }));
    }
  };
  useEffect(() => {
    welcome.current = null;
    lastFacts.current = null;
    seenTrades.current = null;
    lastMode.current = null;
  }, [engine]);
  useEffect(() => {
    const gesture = () => engine.unlock();
    const hide = () => {
      if (document.hidden) {
        engine.suspend();
        stopMic();
        questionAbort.current?.abort();
      } else engine.foreground();
    };
    const leave = () => {
      engine.suspend();
      stopMic();
      questionAbort.current?.abort();
    };
    window.addEventListener("pointerdown", gesture, { passive: true });
    window.addEventListener("keydown", gesture);
    document.addEventListener("visibilitychange", hide);
    const show = () => {
      if (!document.hidden) engine.foreground();
    };
    window.addEventListener("pageshow", show);
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pointerdown", gesture);
      window.removeEventListener("keydown", gesture);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pageshow", show);
      window.removeEventListener("pagehide", leave);
    };
  }, [engine]);
  useEffect(() => {
    if (!ready || !prefs.enabled || !token) return;
    let alive = true;
    let inFlight = false;
    const refresh = async () => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        const data = await facts();
        if (!alive || document.hidden) return;
        const name = cleanText(data.botName) || context.current.botName;
        if (welcome.current !== token) {
          welcome.current = token;
          say(`Welcome to ${name}.`, `welcome-${token}`, 10);
        }
        const previous = lastFacts.current;
        if (previous && freshFacts(previous) && freshFacts(data)) {
          if (previous.connected === true && data.connected === false)
            say(
              "Your trading account has been disconnected.",
              "disconnected",
              90,
              "trading",
            );
          if (previous.connected !== true && data.connected === true) {
            const amount = money(data.account?.balance, data.account?.currency);
            const count =
              Number.isInteger(data.positionsCount) && data.positionsCount >= 0
                ? `You have ${data.positionsCount} open positions.`
                : "The open-position count is unavailable.";
            say(
              context.current.prefs.accountSpeech && amount
                ? `Your live account connection is verified. Your balance is ${amount}. ${count}`
                : "Your live trading account connection has been verified. Account values are available in the assistant.",
              "restored",
              70,
              "trading",
            );
          }
          if (
            activeBot(previous) &&
            data.connected === true &&
            data.engine === true &&
            data.robotEnabled === false &&
            !stopExpected.current
          )
            say(
              `${name} stopped unexpectedly.`,
              "unexpected-stop",
              90,
              "trading",
            );
        }
        lastFacts.current = data;
        stopExpected.current = false;
        const rows = Array.isArray(data.executions) ? data.executions : [];
        const fingerprint = (row: any) =>
          JSON.stringify([
            row.status,
            row.retcode,
            row.ticket,
            row.signalKind,
            row.action,
          ]);
        if (!seenTrades.current)
          seenTrades.current = new Map(
            rows.map((row: any) => [row.id, fingerprint(row)]),
          );
        else
          for (const row of [...rows].reverse()) {
            const changed = seenTrades.current.get(row.id) !== fingerprint(row);
            seenTrades.current.set(row.id, fingerprint(row));
            if (changed) {
              const text = executionSpeech(row),
                age = Date.now() - new Date(row.updatedAt).getTime();
              if (text && age >= -5000 && age < 60000)
                say(text, `execution-${row.id}`, 75, "trading");
            }
          }
        while (seenTrades.current.size > 1000)
          seenTrades.current.delete(seenTrades.current.keys().next().value!);
      } catch (error) {
        if (alive)
          setView((old) => ({
            ...old,
            token,
            error: (error as Error).message,
          }));
      } finally {
        inFlight = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 20000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [engine, ready, prefs.enabled]);
  useEffect(() => {
    const handler = (event: Event) => {
      if (!context.current.ready || !context.current.prefs.enabled) return;
      const detail = (event as CustomEvent<AssistantEvent>).detail;
      if (!detail) return;
      if (detail.type === "bot-request") {
        stopExpected.current = !detail.enabled;
        return;
      }
      if (detail.type === "bot-failed") {
        say(
          `Unable to ${detail.enabled ? "activate" : "deactivate"} ${cleanText(lastFacts.current?.botName) || context.current.botName}. Please check your connection.`,
          `bot-failed-${detail.enabled}`,
          80,
        );
        return;
      }
      if (detail.type === "bot-saved")
        void facts()
          .then((data) => {
            const name = cleanText(data.botName) || context.current.botName;
            const text = detail.enabled
              ? activeBot(data)
                ? `${name} activated.`
                : `Start setting saved for ${name}. Live trading activation remains unverified.`
              : freshFacts(data) &&
                  data.connected === true &&
                  data.engine === true &&
                  data.robotEnabled === false
                ? `${name} deactivated.`
                : `Stop setting saved for ${name}. Live bot deactivation is unverified.`;
            lastFacts.current = data;
            say(text, `bot-saved-${detail.enabled}`, 70);
          })
          .catch(() =>
            say(
              "The bot control setting was saved, but live activation could not be verified.",
              "bot-unverified",
              70,
            ),
          );
      if (detail.type === "mt5-start")
        say(
          `Opening a connection check for ${cleanText(detail.broker, 60)} on ${cleanText(detail.server, 100)}. Live broker verification is not integrated yet.`,
          `mt5-${detail.server}`,
          35,
        );
      if (detail.type === "mt5-unverified")
        say(
          "Your account remains unverified. No live broker login was performed.",
          "mt5-unverified",
          40,
        );
      if (detail.type === "scan-start")
        say(
          detail.kind === "fundamental"
            ? "Researching market fundamentals."
            : "Scanning chart.",
          `scan-start-${Date.now()}`,
          20,
          "chart",
        );
      if (detail.type === "scan-complete")
        say(
          narrateAnalysis(detail.record),
          `scan-${(detail.record as any)?.id}`,
          40,
          "chart",
        );
      if (detail.type === "scan-failed")
        say(
          "Chart analysis could not be completed. Please try again.",
          "scan-failed",
          65,
          "chart",
        );
    };
    window.addEventListener("ea:assistant", handler);
    return () => window.removeEventListener("ea:assistant", handler);
  }, [engine]);
  const activeMode = modes.imageReady ? modes.activeMode : null;
  useEffect(() => {
    if (!ready || activeMode === null) return;
    const identity = `${modes.ea?.id}:${activeMode}`;
    if (lastMode.current === null) {
      lastMode.current = identity;
      return;
    }
    if (lastMode.current === identity) return;
    const timer = setTimeout(() => {
      lastMode.current = identity;
      const fallback = modes.usingFallback
        ? "selected. Its artwork is unavailable, so this EA's fallback image is displayed."
        : "activated.";
      say(`${modeNames[activeMode]} mode ${fallback}`, `mode-${identity}`, 15);
    }, 450);
    return () => clearTimeout(timer);
  }, [engine, ready, activeMode, modes.ea?.id, modes.usingFallback]);
  const state =
    view.token === token
      ? view
      : {
          speaking: false,
          blocked: false,
          error: "",
          text: "",
          answer: "",
          listening: "",
        };
  return {
    prefs,
    update,
    listen,
    stop,
    unlock: () => engine.unlock(),
    ask,
    replay: () => void ask("Explain my latest chart analysis"),
    replayRecord: async (id: string) => {
      if (!ready || !token) return;
      engine.unlock();
      engine.stop();
      try {
        const record = await api(`report/${encodeURIComponent(id)}`);
        if (current.current !== engine) return;
        const text = narrateAnalysis(record);
        setView((old) => ({ ...old, token, answer: text }));
        say(text, `replay-${id}`, 60, "manual");
      } catch (error) {
        if (current.current === engine)
          setView((old) => ({
            ...old,
            token,
            error: (error as Error).message,
          }));
      }
    },
    ...state,
    preview: () => {
      engine.unlock();
      say(
        `Welcome to ${cleanText(lastFacts.current?.botName) || context.current.botName}. I am your assistant. I report verified application information and never place trades by voice.`,
        "voice-preview",
        60,
        "manual",
      );
    },
    supportedMic:
      typeof window !== "undefined" &&
      !!(
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition
      ),
  };
}
export type VoiceAssistant = ReturnType<typeof useVoiceAssistant>;
