import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent,
  type KeyboardEvent,
} from "react";
export const CAROUSEL_INTERVAL = 5000;
export const CAROUSEL_TRANSITION = 750;
const count = 3;
const normalise = (index: number) => (index + count) % count;

type Gesture = {
  id: number;
  x: number;
  y: number;
  time: number;
  index: number | null;
  horizontal: boolean;
  vertical: boolean;
};
export function useShowcaseCarousel(
  root: RefObject<HTMLDivElement | null>,
  ready: boolean,
) {
  const [selection, setSelection] = useState({
    index: 0,
    revision: 0,
    wrap: null as number | null,
  });
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const [moving, setMoving] = useState(false),
    [interacting, setInteracting] = useState(false),
    [paused, setPaused] = useState(false),
    [visible, setVisible] = useState(false),
    [tabVisible, setTabVisible] = useState(!document.hidden),
    [reduced, setReduced] = useState(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null),
    gesture = useRef<Gesture | null>(null),
    paintFrame = useRef<number | null>(null),
    latestDrag = useRef(0);
  const [announcement, setAnnouncement] = useState("");
  const select = useCallback((target: number, manual = true) => {
    const next = normalise(target),
      previous = selectionRef.current.index;
    if (settle.current !== null) clearTimeout(settle.current);
    const changed = next !== previous;
    const wrap = changed
      ? normalise(previous + (normalise(next - previous) === 1 ? 2 : 1))
      : null;
    const update = {
      index: next,
      revision: selectionRef.current.revision + 1,
      wrap,
    };
    selectionRef.current = update;
    setSelection(update);
    setMoving(changed && !reducedRef.current);
    if (changed && !reducedRef.current)
      settle.current = setTimeout(() => {
        settle.current = null;
        setMoving(false);
      }, CAROUSEL_TRANSITION);
    else settle.current = null;
    if (manual)
      setAnnouncement(
        `${["Matrix", "Regular", "S2tone_"][next]} interface selected.`,
      );
  }, []);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) =>
        setVisible(
          Boolean(
            entries[0]?.isIntersecting && entries[0].intersectionRatio >= 0.1,
          ),
        ),
      { threshold: [0, 0.1] },
    );
    if (root.current) observer.observe(root.current);
    const visibility = () => {
      setTabVisible(!document.hidden);
      if (document.hidden) {
        gesture.current = null;
        setInteracting(false);
        root.current?.removeAttribute("data-dragging");
        root.current?.style.setProperty("--carousel-drag", "0px");
      }
    };
    const media = matchMedia("(prefers-reduced-motion: reduce)"),
      motion = () => setReduced(media.matches);
    document.addEventListener("visibilitychange", visibility);
    media.addEventListener("change", motion);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      media.removeEventListener("change", motion);
      if (settle.current !== null) clearTimeout(settle.current);
      if (paintFrame.current !== null) cancelAnimationFrame(paintFrame.current);
    };
  }, [root]);
  const running =
    ready && visible && tabVisible && !reduced && !paused && !interacting;
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(
      () => select(selectionRef.current.index + 1, false),
      CAROUSEL_INTERVAL,
    );
    return () => clearTimeout(timer);
  }, [running, selection.revision, select]);
  const paint = (distance: number) => {
    latestDrag.current = Math.max(-24, Math.min(24, distance * 0.18));
    if (paintFrame.current === null)
      paintFrame.current = requestAnimationFrame(() => {
        paintFrame.current = null;
        root.current?.style.setProperty(
          "--carousel-drag",
          `${latestDrag.current}px`,
        );
      });
  };
  const finish = (event: PointerEvent<HTMLDivElement>, cancel = false) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    gesture.current = null;
    setInteracting(false);
    if (paintFrame.current !== null) cancelAnimationFrame(paintFrame.current);
    paintFrame.current = null;
    root.current?.removeAttribute("data-dragging");
    root.current?.style.setProperty("--carousel-drag", "0px");
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (cancel || g.vertical) return;
    const dx = event.clientX - g.x,
      dy = event.clientY - g.y;
    if (
      g.horizontal &&
      (Math.abs(dx) >= 40 ||
        (Math.abs(dx) > 20 &&
          Math.abs(dx) / Math.max(1, performance.now() - g.time) > 0.45))
    )
      select(selectionRef.current.index + (dx < 0 ? 1 : -1));
    else if (!g.horizontal && Math.hypot(dx, dy) < 10 && g.index !== null)
      select(g.index);
  };
  return {
    index: selection.index,
    wrap: moving ? selection.wrap : null,
    moving,
    running,
    paused,
    reduced,
    announcement,
    select,
    togglePause: () => setPaused((value) => !value),
    position: (index: number) =>
      index === selection.index
        ? "centre"
        : index === normalise(selection.index + 1)
          ? "right"
          : "left",
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (
        !event.isPrimary ||
        event.button !== 0 ||
        (event.target as Element).closest(".showcase-controls")
      )
        return;
      const card = (event.target as Element).closest<HTMLElement>(
        "[data-slide-index]",
      );
      if (!card) return;
      gesture.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        time: performance.now(),
        index: Number(card.dataset.slideIndex),
        horizontal: false,
        vertical: false,
      };
      setInteracting(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      const g = gesture.current;
      if (!g || g.id !== event.pointerId || g.vertical) return;
      const dx = event.clientX - g.x,
        dy = event.clientY - g.y;
      if (!g.horizontal) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          g.vertical = true;
          return;
        }
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.15) return;
        g.horizontal = true;
        root.current?.setAttribute("data-dragging", "true");
      }
      event.preventDefault();
      paint(dx);
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => finish(event),
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) =>
      finish(event, true),
    onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) =>
      finish(event, true),
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        select(
          selectionRef.current.index + (event.key === "ArrowRight" ? 1 : -1),
        );
      }
    },
  };
}
