import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { eaLogo } from "@/lib/branding";
import "./StartupSplash.css";

export const STARTUP_DURATION_MS = 2000;

/** A one-shot presentation layer. App initialization continues underneath it. */
export default function StartupSplash({ ready, children }: { ready: boolean; children: ReactNode }) {
  const [elapsed, setElapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Also completes when animation events are unavailable or the tab is hidden.
    const timer = window.setTimeout(() => setElapsed(true), STARTUP_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (elapsed && ready) setDismissed(true);
  }, [elapsed, ready]);

  return <>
    <div inert={!dismissed} aria-hidden={!dismissed} style={ready || dismissed ? undefined : { visibility: "hidden" }}>
      {children}
    </div>
    {!dismissed && <div className="ea-startup" data-ready={ready} data-elapsed={elapsed}
      role="status" aria-label={elapsed ? "Preparing EA Cloud" : "Starting EA Cloud"}>
      <div className="ea-startup-scene" aria-hidden="true">
        <div className="ea-startup-haze" />
        <div className="ea-startup-pulse" />
        {Array.from({ length: 14 }, (_, i) => <i key={i} className="ea-startup-particle" style={{
          "--x": `${12 + ((i * 37) % 76)}%`, "--y": `${18 + ((i * 23) % 66)}%`,
          "--drift": `${(i % 2 ? 1 : -1) * (8 + i)}px`,
        } as CSSProperties} />)}
        <div className="ea-startup-mark">
          <img src={eaLogo} alt="" decoding="sync" fetchPriority="high" />
          {/* Overlays follow the original image's cloud contour and circuit traces. */}
          <svg viewBox="0 0 1254 1254" className="ea-startup-energy" fill="none">
            <path className="ea-startup-edge" pathLength="1" d="M463 800H190C35 800 0 590 139 537Q174 446 260 443Q291 307 426 309C500 133 733 133 817 308Q905 310 935 400Q1054 398 1072 519C1238 541 1247 794 1070 798H775" />
            <g className="ea-startup-circuits">
              <path pathLength="1" d="M168 661H266L308 700H384 M174 703H192L212 694H263L304 727H403 M247 743H418" />
              <path pathLength="1" d="M1073 661H977L934 701H856 M1068 703H1048L1035 694H978L936 727H835 M993 743H817" />
            </g>
          </svg>
          <div className="ea-startup-sweep" />
        </div>
      </div>
    </div>}
  </>;
}
