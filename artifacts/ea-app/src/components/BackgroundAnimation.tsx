import { useEffect, useState, type CSSProperties } from "react";
import type { BackgroundAnimation as Effect } from "@/lib/home-preferences";
import "./BackgroundAnimation.css";
const glyphs = "01アイウエカキクケコ23456789";

/** One decorative layer shared by every Home layout; never participates in layout or input. */
export default function BackgroundAnimation({
  effect,
  color,
  active,
}: {
  effect: Effect;
  color: string;
  active: boolean;
}) {
  const [visible, setVisible] = useState(() => !document.hidden);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setReduced(media.matches);
    const visibility = () => setVisible(!document.hidden);
    media.addEventListener("change", motion);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      media.removeEventListener("change", motion);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  // Off-screen tabs, hidden documents and reduced-motion users do no animation work.
  if (effect === "none" || !active || !visible || reduced) return null;
  return (
    <div
      key={effect}
      className={`ea-back-animation ea-back-${effect}`}
      data-background-effect={effect}
      aria-hidden="true"
      style={{ "--back-color": color } as CSSProperties}
    >
      {(effect === "pulse" || effect === "glow") && (
        <>
          <i className="ea-back-ambient" />
          <i className="ea-back-wave" />
        </>
      )}
      {effect === "matrix" &&
        Array.from({ length: 18 }, (_, i) => (
          <span
            key={i}
            className="ea-back-stream"
            style={
              {
                left: `${2 + i * 5.5}%`,
                "--duration": `${5 + (i % 5) * 0.7}s`,
                "--delay": `${-i * 1.37}s`,
              } as CSSProperties
            }
          >
            {Array.from({ length: 22 }, (_, j) => (
              <b
                key={j}
                style={{ opacity: 0.25 + ((i * 3 + j * 7) % 10) / 14 }}
              >
                {glyphs[(i * 7 + j * 3) % glyphs.length]}
              </b>
            ))}
          </span>
        ))}
      {effect === "particles" &&
        Array.from({ length: 28 }, (_, i) => (
          <i
            key={i}
            className="ea-back-particle"
            style={
              {
                left: `${3 + ((i * 37) % 94)}%`,
                top: `${5 + ((i * 19) % 89)}%`,
                width: 2 + (i % 3),
                height: 2 + (i % 3),
                "--duration": `${6 + (i % 7)}s`,
                "--delay": `${-i * 0.83}s`,
                "--drift": `${i % 2 ? 24 : -24}px`,
              } as CSSProperties
            }
          />
        ))}
    </div>
  );
}
