import { useState, type CSSProperties } from "react";
import {
  ArrowUpRight,
  Menu,
  Play,
  Square,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { modeNames } from "@/lib/assistant-text";
import { robotBg } from "@/lib/branding";
import ModeImage from "./ModeImage";
import BotName from "./BotName";
import "./LumoLayout.css";

type Props = {
  onOpenSettings?: () => void;
  onOpenQuotes: () => void;
  onRemove: () => void;
  onOpenActivity: () => void;
};

/** Presentation only: all commands, panels, voice and push remain owned by the app. */
export default function LumoLayout({
  onOpenSettings,
  onOpenQuotes,
  onRemove,
  onOpenActivity,
}: Props) {
  const {
    eaName,
    eaTagline,
    eaSymbols,
    bgImageUrl,
    accentColor,
    botRunning,
    botStatusConfirmed,
    setBotRunning,
    visualModes,
  } = useApp();
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const image = bgImageUrl && failedImage !== bgImageUrl ? bgImageUrl : robotBg;
  const status = !botStatusConfirmed
    ? "Status unconfirmed"
    : botRunning
      ? "Robot active"
      : "Paused";
  const mode = visualModes?.activeMode;
  return (
    <section
      className="ea-lumo"
      data-lumo
      style={{ "--lumo-accent": accentColor } as CSSProperties}
      aria-label="Lumo interface"
    >
      <div className="lumo-portrait">
        <ModeImage
          className="lumo-portrait-image"
          src={image}
          alt={eaName}
          draggable={false}
          onError={() => setFailedImage(bgImageUrl)}
        />
        <div className="lumo-portrait-shade" aria-hidden="true" />
        <button
          className="lumo-menu"
          type="button"
          aria-label="Open Settings"
          onClick={onOpenSettings}
        >
          <Menu aria-hidden="true" />
        </button>
        <div className="lumo-identity">
          <ModeImage src={image} alt="" draggable={false} />
          <div className="lumo-identity-text">
            <BotName as="p">{eaName}</BotName>
            <span className="lumo-status" aria-live="polite">
              {status}
            </span>
          </div>
        </div>
        <BotName primary toggleBackground className="lumo-name">
          {eaName}
        </BotName>
      </div>

      <div className="lumo-controls" role="group" aria-label="Robot controls">
        <ModeImage
          src={image}
          alt=""
          aria-hidden="true"
          className="lumo-control-reflection"
          draggable={false}
        />
        <button
          type="button"
          className="lumo-action"
          onClick={onOpenQuotes}
          aria-label="Quotes"
        >
          <span className="lumo-action-icon">
            <TrendingUp aria-hidden="true" />
          </span>
          <span>Quotes</span>
        </button>
        <button
          type="button"
          className="lumo-action lumo-toggle"
          onClick={() => setBotRunning(!botRunning)}
          aria-label={botRunning ? "Stop" : "Start"}
        >
          <span className="lumo-action-icon">
            {botRunning ? (
              <Square aria-hidden="true" fill="currentColor" />
            ) : (
              <Play aria-hidden="true" fill="currentColor" />
            )}
          </span>
          <span>{botRunning ? "Stop" : "Start"}</span>
        </button>
        <button
          type="button"
          className="lumo-action"
          onClick={onRemove}
          aria-label="Remove"
        >
          <span className="lumo-action-icon">
            <Trash2 aria-hidden="true" />
          </span>
          <span>Remove</span>
        </button>
      </div>

      <div className="lumo-powered">
        <span>Powered by </span>
        <strong>EA Cloud</strong>
      </div>

      <section className="lumo-information" aria-label="Bot information">
        <BotName as="p" className="lumo-information-name">
          {eaName}
        </BotName>
        {eaTagline && <p className="lumo-tagline">{eaTagline}</p>}
        <dl>
          <div>
            <dt>Robot</dt>
            <dd>{status}</dd>
          </div>
          <div>
            <dt>Visual mode</dt>
            <dd>{mode == null ? "Not selected" : modeNames[mode]}</dd>
          </div>
          {eaSymbols.length > 0 && (
            <div>
              <dt>Mentor symbols</dt>
              <dd>{eaSymbols.join(" · ")}</dd>
            </div>
          )}
        </dl>
        <button
          type="button"
          className="lumo-activity-link"
          onClick={onOpenActivity}
        >
          Live trading activity <ArrowUpRight size={17} aria-hidden="true" />
        </button>
      </section>
    </section>
  );
}
