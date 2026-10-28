import { ChartNoAxesColumn, Square, Trash2, TrendingUp, X } from "lucide-react";
import { controlPanelOrder } from "@/lib/home-preferences";
import { useApp } from "@/context/AppContext";
import "./ControlPanelChoices.css";

export default function ControlPanelChoices() {
  const { controlPanel, setControlPanel, interfaceStyle } = useApp();
  return (
    <div className="ea-panel-choices">
      <p className="text-xs text-white/60">
        Applies to Regular, Matrix and Lumo. S2tone_ keeps its own controls.
        {interfaceStyle === "s2tone"
          ? " Your choice will appear on the other interfaces."
          : " Swipe on the controls to switch designs."}
      </p>
      {controlPanelOrder.map((panel) => (
        <button
          key={panel}
          type="button"
          aria-pressed={controlPanel === panel}
          aria-label={`${panel[0].toUpperCase()}${panel.slice(1)} Panel`}
          onClick={() => setControlPanel(panel)}
          className="ea-panel-choice"
        >
          <span
            className="ea-panel-preview"
            data-preview={panel}
            aria-hidden="true"
          >
            <span>
              <i>{panel === "matrix" ? <X /> : <TrendingUp />}</i>
              <small>{panel === "matrix" ? "REMOVE" : "QUOTES"}</small>
            </span>
            <span className="ea-preview-toggle">
              <i>
                <Square fill="currentColor" />
              </i>
              <small>STOP</small>
            </span>
            <span>
              <i>{panel === "matrix" ? <ChartNoAxesColumn /> : <Trash2 />}</i>
              <small>{panel === "matrix" ? "SYMBOLS" : "REMOVE"}</small>
            </span>
          </span>
          <span>
            {panel[0].toUpperCase()}
            {panel.slice(1)} Panel{" "}
            {controlPanel === panel && <span aria-hidden="true">✓</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
