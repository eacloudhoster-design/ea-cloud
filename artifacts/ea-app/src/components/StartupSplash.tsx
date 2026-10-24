import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import eaLogo from "../../../ea-cloud/public/ea-cloud-logo.jpeg?url";
import "./StartupSplash.css";

export const STARTUP_DURATION_MS = 2000;
const CROSSFADE_MS = 500;
// Clockwise, in the original artwork's coordinates. The lower edge follows the
// robot where it interrupts the cloud's baseline, closing the actual silhouette.
const CLOUD_OUTLINE = "M626 180 C711 180 787 230 819 308 C873 308 919 346 934 399 C1007 398 1064 449 1073 520 C1141 528 1194 587 1194 658 C1194 734 1135 796 1060 796 H782 L701 825 L620 833 L541 825 L462 796 H190 C113 796 52 736 52 660 C52 605 87 556 140 537 C158 483 204 447 261 443 C279 365 345 308 427 308 C461 231 539 180 626 180 Z";

/** Initialization continues underneath the splash; readiness finishes its trace. */
export default function StartupSplash({ ready, children, onComplete }: { ready: boolean; children: ReactNode; onComplete?: () => void }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [started, setStarted] = useState(false);
  const [phase, setPhase] = useState<"tracing" | "glowing" | "fading" | "done">("tracing");
  const readyRef = useRef(ready);
  readyRef.current = ready;

  useEffect(() => {
    let cancelled = false;
    const image = imageRef.current!;
    image.decode().then(() => { if (!cancelled) setStarted(true); }).catch(() => {
      // Never trap a usable app behind an unavailable presentation asset.
      if (!cancelled) setStarted(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (phase !== "glowing" && phase !== "fading") return;
    const timer = window.setTimeout(() => setPhase(phase === "glowing" ? "fading" : "done"), phase === "glowing" ? 240 : CROSSFADE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => { if (phase === "done") onComplete?.(); }, [phase, onComplete]);

  const revealing = phase === "fading" || phase === "done";
  return <>
    <div className="ea-startup-home" data-visible={revealing} inert={!revealing} aria-hidden={!revealing}>
      {children}
    </div>
    {phase !== "done" && <div className="ea-startup" data-ready={ready} data-started={started} data-phase={phase}
      style={{ "--ea-startup-duration": `${STARTUP_DURATION_MS}ms` } as CSSProperties}
      role="status" aria-label="Starting EA Cloud">
      <div className="ea-startup-mark" aria-hidden="true">
        <img ref={imageRef} src={eaLogo} alt="" decoding="sync" fetchPriority="high" />
        <svg viewBox="0 0 1254 1254" className="ea-startup-energy" fill="none">
          <path className="ea-startup-edge" pathLength="1" d={CLOUD_OUTLINE}
            onAnimationIteration={() => { if (readyRef.current) setPhase("glowing"); }} />
          <path className="ea-startup-tip" pathLength="1" d={CLOUD_OUTLINE} />
        </svg>
      </div>
    </div>}
  </>;
}
