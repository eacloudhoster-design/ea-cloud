import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import eaLogo from "../../../ea-cloud/public/ea-cloud-logo.jpeg?url";
import "./StartupSplash.css";

export const STARTUP_DURATION_MS = 2000;

/** A one-shot presentation layer. App initialization continues underneath it. */
export default function StartupSplash({ ready, children }: { ready: boolean; children: ReactNode }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [started, setStarted] = useState(false);
  const [assetFailed, setAssetFailed] = useState(false);
  const [elapsed, setElapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const image = imageRef.current!;
    // A cold asset must not consume the two-second cinematic clock.
    image.decode().then(() => {
      if (!cancelled) setStarted(true);
    }).catch(() => { if (!cancelled) setAssetFailed(true); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (elapsed && ready) setDismissed(true);
  }, [elapsed, ready]);

  return <>
    <div inert={!dismissed} aria-hidden={!dismissed} style={ready || dismissed ? undefined : { visibility: "hidden" }}>
      {children}
    </div>
    {!dismissed && <div className="ea-startup" data-ready={ready} data-elapsed={elapsed} data-started={started}
      style={{ "--ea-startup-duration": `${STARTUP_DURATION_MS}ms` } as CSSProperties}
      onAnimationEnd={event => {
        if (event.target === event.currentTarget && event.animationName === "ea-launch") setElapsed(true);
      }}
      role="status" aria-label={elapsed ? "Preparing EA Cloud" : "Starting EA Cloud"}>
      {assetFailed && <button className="ea-startup-retry" onClick={() => window.location.reload()}>Retry startup</button>}
      <div className="ea-startup-scene" aria-hidden="true">
        <div className="ea-startup-mark">
          <img ref={imageRef} src={eaLogo} alt="" decoding="sync" fetchPriority="high" />
          {/* Overlays follow the original image's cloud contour and circuit traces. */}
          <svg viewBox="0 150 1254 690" className="ea-startup-energy" fill="none">
            <g className="ea-startup-eyes">
              <path d="M403 507 L551 602 L452 567 Z" />
              <path d="M834 507 L688 602 L785 567 Z" />
            </g>
            <path className="ea-startup-edge" pathLength="1" d="M463 800H190C35 800 0 590 139 537Q174 446 260 443Q291 307 426 309C500 133 733 133 817 308Q905 310 935 400Q1054 398 1072 519C1238 541 1247 794 1070 798H775" />
            <g className="ea-startup-circuits">
              <path pathLength="1" d="M168 661H266L308 700H384 M174 703H192L212 694H263L304 727H403 M247 743H418" />
              <path pathLength="1" d="M1073 661H977L934 701H856 M1068 703H1048L1035 694H978L936 727H835 M993 743H817" />
            </g>
          </svg>
          <div className="ea-startup-reflection"><div className="ea-startup-sweep" /></div>
        </div>
      </div>
    </div>}
  </>;
}
