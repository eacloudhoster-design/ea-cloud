import { useEffect, useState, type FormEvent } from "react";
import {
  Mic,
  MicOff,
  Square,
  RotateCcw,
  Play,
  MessageCircle,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import type { VoiceAssistant } from "@/hooks/use-voice-assistant";
import "./VoiceAssistant.css";
function Question({ voice }: { voice: VoiceAssistant }) {
  const [question, setQuestion] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (question.trim()) void voice.ask(question.trim());
  };
  return (
    <form onSubmit={submit} className="ea-voice-question">
      <label>
        Ask your assistant
        <input
          aria-label="Question for assistant"
          value={question}
          maxLength={700}
          placeholder="What's my balance?"
          onChange={(event) => setQuestion(event.target.value)}
        />
      </label>
      <button type="submit" disabled={!question.trim()}>
        Ask
      </button>
    </form>
  );
}
export function VoiceAssistantSettings() {
  const { voice } = useApp();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return;
    const load = () => setVoices(speechSynthesis.getVoices());
    load();
    speechSynthesis.addEventListener("voiceschanged", load);
    return () => speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  if (!voice) return null;
  const toggle = (
    label: string,
    key:
      | "enabled"
      | "automatic"
      | "trades"
      | "narration"
      | "accountSpeech"
      | "fallback",
  ) => (
    <label className="ea-voice-toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={voice.prefs[key]}
        onChange={(event) => voice.update({ [key]: event.target.checked })}
      />
    </label>
  );
  return (
    <section className="ea-voice-panel" aria-label="Voice assistant settings">
      <p className="ea-voice-disclosure">
        Optional AI voice. Neural speech sends spoken text to Google. Typed
        questions may be sent for intent recognition; account data is kept out
        of that AI classification. Account figures are spoken through Google
        only if you enable them below. Google’s free tier may use submitted text
        to improve its products. Device speech avoids our Google TTS requests, but may use your browser or vendor’s services. Do
        not say passwords or access tokens.
      </p>
      {toggle("Voice Assistant On / Off", "enabled")}
      <label className="ea-voice-field">
        Voice technology
        <select
          value={voice.prefs.provider}
          onChange={(event) =>
            voice.update({
              provider: event.target.value as "neural" | "device",
            })
          }
        >
          <option value="neural">Neural female voice · Aoede</option>
          <option value="device">Device voice · quality varies</option>
        </select>
      </label>
      {(voice.prefs.provider === "device" || voice.prefs.fallback) && (
        <label className="ea-voice-field">
          Device voice
          <select
            value={voice.prefs.deviceVoice}
            onChange={(event) =>
              voice.update({ deviceVoice: event.target.value })
            }
          >
            <option value="">Prefer an available female English voice</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} · {v.lang}
              </option>
            ))}
          </select>
        </label>
      )}
      {toggle("Allow device voice if neural speech fails", "fallback")}
      <label className="ea-voice-field">
        Volume · {Math.round(voice.prefs.volume * 100)}%
        <input
          aria-label="Voice volume"
          type="range"
          min="0"
          max="1"
          step=".05"
          value={voice.prefs.volume}
          onChange={(event) =>
            voice.update({ volume: Number(event.target.value) })
          }
        />
      </label>
      <label className="ea-voice-field">
        Voice speed · {voice.prefs.speed.toFixed(2)}×
        <input
          aria-label="Voice speed"
          type="range"
          min=".8"
          max="1.3"
          step=".05"
          value={voice.prefs.speed}
          onChange={(event) =>
            voice.update({ speed: Number(event.target.value) })
          }
        />
      </label>
      {toggle("Automatic announcements", "automatic")}
      {toggle("Verified trading notifications", "trades")}
      {toggle("Chart-analysis narration", "narration")}
      {toggle("Speak account values with neural voice", "accountSpeech")}
      <p className="ea-voice-disclosure">
        The microphone runs only when you press it, for one question at a time.
        Recognition may use your browser/device's speech service. Availability
        and audio playback depend on iOS/browser permissions.
      </p>
      <div className="ea-voice-actions">
        <button
          type="button"
          disabled={!voice.prefs.enabled}
          onClick={voice.preview}
        >
          Preview voice
        </button>
        <button
          type="button"
          disabled={!voice.prefs.enabled || !voice.supportedMic}
          onClick={voice.listen}
          aria-pressed={!!voice.listening}
        >
          <Mic size={16} />
          {voice.listening ? "Stop microphone" : "Microphone"}
        </button>
        <button type="button" onClick={voice.stop}>
          <Square size={15} />
          Stop speaking
        </button>
        <button type="button" onClick={voice.replay}>
          <RotateCcw size={15} />
          Replay analysis
        </button>
      </div>
      {!voice.supportedMic && (
        <p>
          Microphone recognition is unavailable here. Typed questions still
          work.
        </p>
      )}
      {voice.blocked && (
        <button type="button" onClick={voice.unlock}>
          <Play size={16} />
          Play queued voice
        </button>
      )}
      {voice.listening && (
        <p role="status" className="ea-voice-listening">
          {voice.listening}
        </p>
      )}
      {voice.error && (
        <p role="alert" className="ea-voice-error">
          {voice.error}
        </p>
      )}
      <Question voice={voice} />
      {voice.answer && (
        <p aria-live="polite" className="ea-voice-answer">
          {voice.answer}
        </p>
      )}
    </section>
  );
}
export function VoiceAssistantControls() {
  const { voice } = useApp();
  if (!voice?.prefs.enabled) return null;
  return (
    <aside className="ea-voice-controls" aria-label="Voice assistant controls">
      <div className="ea-voice-actions">
        <button
          type="button"
          title={
            voice.supportedMic ? "Ask by microphone" : "Use typed questions"
          }
          aria-label={voice.listening ? "Stop microphone" : "Ask by microphone"}
          aria-pressed={!!voice.listening}
          disabled={!voice.supportedMic}
          onClick={voice.listen}
        >
          {voice.listening ? <MicOff size={17} /> : <Mic size={17} />}
        </button>
        <button type="button" aria-label="Stop speaking" onClick={voice.stop}>
          <Square size={16} />
        </button>
        <button
          type="button"
          aria-label="Replay latest analysis"
          onClick={voice.replay}
        >
          <RotateCcw size={16} />
        </button>
      </div>
      {voice.listening && (
        <p role="status" className="ea-voice-listening">
          {voice.listening}
        </p>
      )}
      {voice.blocked && (
        <button type="button" onClick={voice.unlock}>
          <Play size={14} />
          Play queued voice
        </button>
      )}
      <details>
        <summary>
          <MessageCircle size={14} />
          Ask assistant
        </summary>
        <div className="ea-voice-popover">
          <Question voice={voice} />
          {voice.answer && <p aria-live="polite">{voice.answer}</p>}
          {voice.error && (
            <p role="alert" className="ea-voice-error">
              {voice.error}
            </p>
          )}
        </div>
      </details>
    </aside>
  );
}
