import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import eaLogo from "../../../ea-cloud/public/ea-cloud-logo.jpeg?url";
import "./StartupSplash.css";

// Preserve the 2s entrance and 7s trace; finish with 100ms glow and a 300ms crossfade.
export const STARTUP_DURATION_MS = 9400;
const ENTRANCE_MS = 2000;
const TRACE_MS = 7000;
const FINAL_GLOW_MS = 100;
const CROSSFADE_MS = 300;
// Clockwise in the unchanged image's coordinates, including the robot's lower
// silhouette where it interrupts the cloud baseline. No generic border shape.
const CLOUD_OUTLINE = "M626 180 C711 180 787 230 819 308 C873 308 919 346 934 399 C1007 398 1064 449 1073 520 C1141 528 1194 587 1194 658 C1194 734 1135 796 1060 796 H782 L701 825 L620 833 L541 825 L462 796 H190 C113 796 52 736 52 660 C52 605 87 556 140 537 C158 483 204 447 261 443 C279 365 345 308 427 308 C461 231 539 180 626 180 Z";
type Phase = "entrance" | "tracing" | "glowing" | "fading" | "done";

/** A presentation layer: initialization and the existing app stay mounted below. */
export default function StartupSplash({ ready, children }: { ready: boolean; children: ReactNode }) {
  const filterId = useId().replace(/:/g, "");
  const outlineHalo = `${filterId}-outline-halo`;
  const eyeHalo = `${filterId}-eye-halo`;
  const imageRef = useRef<HTMLImageElement>(null);
  const [started, setStarted] = useState(false);
  const [phase, setPhase] = useState<Phase>("entrance");
  const [traceComplete, setTraceComplete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // A cold image must not consume the entrance. A failed image must not trap
    // a usable app; still retain the readiness gate and presentation timeline.
    imageRef.current!.decode().catch(() => {}).then(() => {
      if (!cancelled) setStarted(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (traceComplete && ready && phase === "tracing") setPhase("glowing");
  }, [traceComplete, ready, phase]);

  // Readiness changes must not restart the entrance clock (or its CSS timeline).
  const canAdvance = phase !== "glowing" || ready;
  useEffect(() => {
    if (!canAdvance) return;
    if (!started || phase === "tracing" || phase === "done") return;
    const next: Record<"entrance" | "glowing" | "fading", [Phase, number]> = {
      entrance: ["tracing", ENTRANCE_MS],
      glowing: ["fading", FINAL_GLOW_MS],
      // Transitionend owns removal; this fallback handles cancelled transitions.
      fading: ["done", CROSSFADE_MS + 100],
    };
    const [nextPhase, delay] = next[phase];
    const timer = window.setTimeout(() => setPhase(nextPhase), delay);
    return () => window.clearTimeout(timer);
  }, [started, phase, canAdvance]);

  const revealing = phase === "fading" || phase === "done";
  const timing = {
    "--ea-entrance-duration": `${ENTRANCE_MS}ms`,
    "--ea-trace-duration": `${TRACE_MS}ms`,
    "--ea-final-glow-duration": `${FINAL_GLOW_MS}ms`,
    "--ea-crossfade-duration": `${CROSSFADE_MS}ms`,
  } as CSSProperties;
  return <>
    <div className="ea-startup-home" style={timing} data-visible={revealing} inert={!revealing} aria-hidden={!revealing}>
      {children}
    </div>
    {phase !== "done" && <div className="ea-startup" data-ready={ready} data-started={started} data-phase={phase}
      style={timing} role="status" aria-label="Starting EA Cloud"
      onTransitionEnd={event => {
        if (phase === "fading" && event.target === event.currentTarget && event.propertyName === "opacity") setPhase("done");
      }}>
      <div className="ea-startup-mark" aria-hidden="true">
        <div className="ea-startup-artwork">
          {/* Crop only the baked-in wordmark; never edit, stretch or recolour the asset. */}
          <img ref={imageRef} src={eaLogo} alt="" decoding="sync" fetchPriority="high" />
        </div>
        <svg viewBox="0 150 1254 690" className="ea-startup-energy" fill="none">
          <defs>
            {/* Explicit user-space filter bounds avoid clipped SVG/CSS shadows on WebKit. */}
            <filter id={outlineHalo} filterUnits="userSpaceOnUse" x="-60" y="90" width="1374" height="810" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation="9" />
            </filter>
            <filter id={eyeHalo} filterUnits="userSpaceOnUse" x="350" y="460" width="540" height="200" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation="8" />
            </filter>
          </defs>
          <g className="ea-startup-eyes">
            <g className="ea-startup-eye ea-startup-eye--left">
              <path className="ea-startup-eye-halo" filter={`url(#${eyeHalo})`} d="M403 507 L552 603 L443 570 Z" />
              <path className="ea-startup-eye-core" d="M403 507 L552 603 L443 570 Z" />
            </g>
            <g className="ea-startup-eye ea-startup-eye--right">
              <path className="ea-startup-eye-halo" filter={`url(#${eyeHalo})`} d="M834 507 L687 603 L796 570 Z" />
              <path className="ea-startup-eye-core" d="M834 507 L687 603 L796 570 Z" />
            </g>
          </g>
          <path className="ea-startup-edge" pathLength="1" d={CLOUD_OUTLINE}
            onAnimationEnd={event => {
              if (event.animationName === "ea-cloud-trace") setTraceComplete(true);
            }} />
          <g className="ea-startup-traveller">
            <path className="ea-startup-trail" filter={`url(#${outlineHalo})`} pathLength="1" d={CLOUD_OUTLINE} />
            <path className="ea-startup-tip-halo" filter={`url(#${outlineHalo})`} pathLength="1" d={CLOUD_OUTLINE} />
            <path className="ea-startup-tip" pathLength="1" d={CLOUD_OUTLINE} />
          </g>
        </svg>
      </div>
    </div>}
  </>;
}
