import { useEffect, useRef, useState } from "react";
import "./HeroAppShowcase.css";

const screens = [
  { id: "s2tone", position: "left", name: "S2tone_" },
  { id: "matrix", position: "centre", name: "Matrix" },
  { id: "regular", position: "right", name: "Regular" },
] as const;

/** One composition of the user's actual, uncropped application screenshots. */
export default function HeroAppShowcase() {
  const root = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    const images = Array.from(root.current!.querySelectorAll("img"));
    // Cold assets must not consume the entrance animation. Text, links and
    // normal page scrolling stay available while the screenshots decode.
    void Promise.allSettled(images.map((image) => image.decode())).then(() => {
      if (!disposed) setReady(true);
    });
    return () => {
      disposed = true;
    };
  }, []);
  return (
    <div
      ref={root}
      data-ready={ready}
      className="hero-showcase"
      role="group"
      aria-label="EA Cloud application interfaces: S2tone_ left, Matrix centre, Regular right"
    >
      <div className="showcase-ambient" aria-hidden="true" />
      {screens.map((screen) => (
        <figure
          key={screen.id}
          data-interface={screen.id}
          className={`showcase-phone showcase-phone--${screen.position}`}
        >
          <div className="showcase-entrance">
            <div className="showcase-phone-frame">
              <picture>
                <source
                  type="image/webp"
                  srcSet={`/showcase/${screen.id}-360.webp 360w, /showcase/${screen.id}-540.webp 540w, /showcase/${screen.id}-739.webp 739w`}
                  sizes={
                    screen.position === "centre"
                      ? "(max-width: 700px) 42vw, (max-width: 1100px) 261px, 21vw"
                      : "(max-width: 700px) 34vw, (max-width: 1100px) 211px, 17vw"
                  }
                />
                <img
                  src={`/showcase/${screen.id}.png`}
                  width={739}
                  height={1600}
                  alt={`EA Cloud ${screen.name} interface screenshot`}
                  decoding="async"
                  fetchPriority={screen.id === "matrix" ? "high" : "auto"}
                  draggable={false}
                />
              </picture>
            </div>
          </div>
        </figure>
      ))}
    </div>
  );
}
