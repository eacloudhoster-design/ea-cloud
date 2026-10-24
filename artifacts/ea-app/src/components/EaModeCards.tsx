import type { CSSProperties } from "react";
import { ImageOff } from "lucide-react";
import { useApp } from "@/context/AppContext";
import "./EaModeCards.css";

const modes = ["NORMAL", "BEAST", "AGGRESSIVE", "ULTIMATE"] as const;
export default function EaModeCards() {
  const { visualModes, accentColor } = useApp();
  if (!visualModes) return null;
  const { eas, ea, selected, choose, selectEa, loading, error, retry } =
    visualModes;
  return (
    <div className="ea-mode-settings" style={{"--ea-mode-accent":accentColor} as CSSProperties}>
      {eas.length > 1 && (
        <label className="ea-mode-ea">
          EA artwork
          <select
            aria-label="EA artwork"
            value={ea?.id}
            onChange={(event) => selectEa(Number(event.target.value))}
          >
            {eas.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {loading && !ea && <p role="status">Loading EA artwork…</p>}
      {error && (
        <div role="alert" className="ea-mode-error">
          {error}{" "}
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>
      )}
      {!loading && !ea && !error && (
        <p>No active EA is linked to this mentor.</p>
      )}
      {ea && (
        <div
          className="ea-mode-grid"
          role="group"
          aria-label={`${ea.name} visual modes`}
        >
          {modes.map((name, index) => (
            <button
              type="button"
              key={`${ea.id}-${name}`}
              aria-label={`${name} visual mode`}
              aria-pressed={selected === index}
              className="ea-mode-card"
              onClick={() => choose(index)}
            >
              {ea.images[index] ? (
                <img
                  key={ea.images[index]}
                  src={ea.images[index]!}
                  alt=""
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <ImageOff aria-hidden size={20} />
              )}
              <span>{name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
