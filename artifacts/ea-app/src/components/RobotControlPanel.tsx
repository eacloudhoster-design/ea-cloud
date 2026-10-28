import type { CSSProperties } from "react";
import { Play, Square, Trash2, TrendingUp, X, ChartNoAxesColumn } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useControlPanelSwipe } from "@/hooks/use-control-panel-swipe";
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

/** Visual variants share the original command callbacks and allocated layout slot. */
export default function RobotControlPanel({image,accentColor,botRunning,onToggle,onOpenQuotes,onRemove}: Props) {
  const { controlPanel = "default", setControlPanel } = useApp();
  const swipe = useControlPanelSwipe(controlPanel, setControlPanel);
  const matrix = controlPanel === "matrix";
  return (
      <div {...swipe} data-control-panel={controlPanel} className="lumo-controls ea-robot-controls" style={{ "--lumo-accent": accentColor } as CSSProperties} role="group" aria-label="Robot controls">
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
          onClick={matrix ? onRemove : onOpenQuotes}
          aria-label={matrix ? "Remove" : "Quotes"}
        >
          <span className="lumo-action-icon">
            {matrix ? <X aria-hidden="true" /> : <TrendingUp aria-hidden="true" />}
          </span>
          <span>{matrix ? "Remove" : "Quotes"}</span>
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
          onClick={matrix ? onOpenQuotes : onRemove}
          aria-label={matrix ? "Symbols" : "Remove"}
        >
          <span className="lumo-action-icon">
            {matrix ? <ChartNoAxesColumn aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
          </span>
          <span>{matrix ? "Symbols" : "Remove"}</span>
        </button>
      </div>

  );
}
