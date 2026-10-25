import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useShowcaseCarousel } from "@/hooks/use-showcase-carousel";
import "./HeroAppShowcase.css";

// Rotation order: Matrix -> Regular -> S2tone_; each original image stays mounted.
const screens = [
  { id: "matrix", name: "Matrix" },
  { id: "regular", name: "Regular" },
  { id: "s2tone", name: "S2tone_" },
] as const;
const initialOrder = [2, 0, 1];
export default function HeroAppShowcase() {
  const root = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const carousel = useShowcaseCarousel(root, ready);
  useEffect(() => {
    let disposed = false;
    // Cold assets cannot consume the entrance. Text, links and scrolling stay available.
    void Promise.allSettled(
      Array.from(root.current!.querySelectorAll("img")).map((image) =>
        image.decode(),
      ),
    ).then(() => {
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
      data-centred={screens[carousel.index].id}
      data-running={carousel.running}
      data-moving={carousel.moving}
      className="hero-showcase"
      role="group"
      aria-roledescription="carousel"
      aria-label="EA Cloud application interfaces"
      onPointerDown={carousel.onPointerDown}
      onPointerMove={carousel.onPointerMove}
      onPointerUp={carousel.onPointerUp}
      onPointerCancel={carousel.onPointerCancel}
      onLostPointerCapture={carousel.onLostPointerCapture}
      onKeyDown={carousel.onKeyDown}
      onDragStart={(event) => event.preventDefault()}
    >
      <div className="showcase-ambient" aria-hidden="true" />
      <div className="showcase-scene">
        {initialOrder.map((index) => {
          const screen = screens[index];
          return (
            <figure
              key={screen.id}
              data-interface={screen.id}
              data-slide-index={index}
              data-wrapping={carousel.wrap === index || undefined}
              className={`showcase-phone showcase-phone--${carousel.position(index)}`}
            >
              <button
                type="button"
                className="showcase-card-select"
                aria-label={`Show ${screen.name} interface`}
                aria-pressed={carousel.index === index}
                onClick={(event) => {
                  if (event.detail === 0) carousel.select(index);
                }}
              >
                <div
                  className={`showcase-entrance showcase-entrance--${screen.id}`}
                >
                  <div className="showcase-phone-frame">
                    <picture>
                      <source
                        type="image/webp"
                        srcSet={`/showcase/${screen.id}-360.webp 360w, /showcase/${screen.id}-540.webp 540w, /showcase/${screen.id}-739.webp 739w`}
                        sizes="(max-width: 700px) 42vw, (max-width: 1100px) 261px, 21vw"
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
              </button>
            </figure>
          );
        })}
      </div>
      <div
        className="showcase-controls"
        role="group"
        aria-label="Carousel controls"
      >
        <div className="showcase-indicators">
          {screens.map((screen, index) => (
            <button
              key={screen.id}
              type="button"
              aria-label={`Select ${screen.name} interface`}
              aria-pressed={carousel.index === index}
              onClick={() => carousel.select(index)}
            >
              <span />
            </button>
          ))}
        </div>
        <button
          type="button"
          className="showcase-autoplay"
          disabled={carousel.reduced}
          aria-label={
            carousel.reduced
              ? "Automatic rotation disabled for reduced motion"
              : carousel.paused
                ? "Resume automatic rotation"
                : "Pause automatic rotation"
          }
          onClick={carousel.togglePause}
        >
          {carousel.paused ? <Play size={11} /> : <Pause size={11} />}
        </button>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {carousel.announcement}
      </span>
    </div>
  );
}
