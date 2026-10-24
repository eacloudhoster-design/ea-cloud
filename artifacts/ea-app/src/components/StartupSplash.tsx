import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import eaLogo from "../../../ea-cloud/public/ea-cloud-logo.jpeg?url";
import "./StartupSplash.css";

// The complete ready-on-time sequence is 2s entrance + 7s trace + 1s glow + 2s fade.
export const STARTUP_DURATION_MS = 12000;
const ENTRANCE_MS = 2000;
const TRACE_MS = 7000;
const FINAL_GLOW_MS = 1000;
const CROSSFADE_MS = 2000;
// Clockwise in the unchanged image's coordinates, including the robot's lower
// silhouette where it interrupts the cloud baseline. No generic border shape.
const CLOUD_OUTLINE = "M626 180 C711 180 787 230 819 308 C873 308 919 346 934 399 C1007 398 1064 449 1073 520 C1141 528 1194 587 1194 658 C1194 734 1135 796 1060 796 H782 L701 825 L620 833 L541 825 L462 796 H190 C113 796 52 736 52 660 C52 605 87 556 140 537 C158 483 204 447 261 443 C279 365 345 308 427 308 C461 231 539 180 626 180 Z";
type Phase = "entrance" | "tracing" | "glowing" | "fading" | "done";

/** A presentation layer: initialization and the existing app stay mounted below. */
export default function StartupSplash({ ready, children }: { ready: boolean; children: ReactNode }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [started, setStarted] = useState(false);
  const [phase, setPhase] = useState<Phase>("entrance");
  const readyRef = useRef(ready);
  readyRef.current = ready;

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
    if (!started || phase === "tracing" || phase === "done") return;
    const next: Record<"entrance" | "glowing" | "fading", [Phase, number]> = {
      entrance: ["tracing", ENTRANCE_MS],
      glowing: ["fading", FINAL_GLOW_MS],
      fading: ["done", CROSSFADE_MS],
    };
    const [nextPhase, delay] = next[phase];
    const timer = window.setTimeout(() => setPhase(nextPhase), delay);
    return () => window.clearTimeout(timer);
  }, [started, phase]);

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
      style={timing} role="status" aria-label="Starting EA Cloud">
      <div className="ea-startup-mark" aria-hidden="true">
        <div className="ea-startup-artwork">
          {/* Crop only the baked-in wordmark; never edit, stretch or recolour the asset. */}
          <img ref={imageRef} src={eaLogo} alt="" decoding="sync" fetchPriority="high" />
        </div>
        <svg viewBox="0 150 1254 690" className="ea-startup-energy" fill="none">
          <path className="ea-startup-edge" pathLength="1" d={CLOUD_OUTLINE}
            onAnimationIteration={event => {
              if (event.animationName === "ea-cloud-trace" && phase === "tracing" && readyRef.current) setPhase("glowing");
            }} />
          <g className="ea-startup-traveller">
            <path className="ea-startup-trail" pathLength="1" d={CLOUD_OUTLINE} />
            <path className="ea-startup-tip" pathLength="1" d={CLOUD_OUTLINE} />
          </g>
        </svg>
      </div>
    </div>}
  </>;
}
