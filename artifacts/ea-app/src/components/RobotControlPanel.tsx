import type { CSSProperties } from "react";
import { Play, Square, Trash2, TrendingUp } from "lucide-react";
import ModeImage from "./ModeImage";
import "./RobotControlPanel.css";

type Props = {
  image: string;
  accentColor: string;
  botRunning: boolean;
  onToggle: () => void;
  onOpenQuotes: () => void;
  onRemove: () => void;
};

/** The unchanged Lumo control surface; commands remain owned by each layout. */
export default function RobotControlPanel({image,accentColor,botRunning,onToggle,onOpenQuotes,onRemove}: Props) {
  return (
      <div className="lumo-controls ea-robot-controls" style={{ "--lumo-accent": accentColor } as CSSProperties} role="group" aria-label="Robot controls">
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
          onClick={onToggle}
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

  );
}
