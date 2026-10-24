import {
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

type WindowBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
};
type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type Gesture = {
  id: number;
  x: number;
  y: number;
  origin: WindowBox;
  edge?: Edge;
};
const STORAGE_KEY = "ea-cloud:robot-panel-window";
const EDGES: Edge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(n, max));
function readSaved(): WindowBox | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (
      value &&
      ["x", "y", "width", "height", "scale"].every(
        (key) => typeof value[key] === "number" && Number.isFinite(value[key]),
      ) &&
      value.width > 0 &&
      value.height > 0 &&
      value.scale > 0 &&
      value.scale <= 1.5
    )
      return value;
  } catch {
    /* Storage can be unavailable in private/embedded contexts. */
  }
  return null;
}

/** Independent, persisted floating-window geometry. The original circle hook is untouched. */
export function useDraggablePanel(
  root: RefObject<HTMLDivElement | null>,
  panel: RefObject<HTMLDivElement | null>,
  open: boolean,
) {
  const current = useRef<WindowBox | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef<number | null>(null);
  const pinching = useRef(false);
  const suppressClick = useRef(false);
  const [box, setBox] = useState<WindowBox | null>(null);
  const bounds = () => {
    const rect = root.current!.getBoundingClientRect(),
      viewport = window.visualViewport;
    const css = getComputedStyle(root.current!);
    const safe = (side: string) =>
      Math.max(
        4,
        parseFloat(css.getPropertyValue(`--robot-safe-${side}`)) || 0,
      );
    const left =
      Math.max(0, (viewport?.offsetLeft || 0) - rect.left) + safe("left");
    const top =
      Math.max(0, (viewport?.offsetTop || 0) - rect.top) + safe("top");
    const right =
      Math.min(
        rect.width,
        (viewport?.offsetLeft || 0) +
          (viewport?.width || innerWidth) -
          rect.left,
      ) - safe("right");
    const bottom =
      Math.min(
        rect.height,
        (viewport?.offsetTop || 0) +
          (viewport?.height || innerHeight) -
          rect.top,
      ) - safe("bottom");
    return {
      left,
      top,
      right,
      bottom,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
  };
  const constrain = (next: WindowBox) => {
    const b = bounds();
    const scale = Math.min(
      clamp(next.scale, 0.85, 1.5),
      b.width / 240,
      b.height / 280,
    );
    const width = clamp(next.width, Math.min(240 * scale, b.width), b.width);
    const height = clamp(
      next.height,
      Math.min(280 * scale, b.height),
      b.height,
    );
    return {
      scale,
      width,
      height,
      x: clamp(next.x, b.left, b.right - width),
      y: clamp(next.y, b.top, b.bottom - height),
    };
  };
  const save = () => {
    try {
      if (current.current)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current.current));
    } catch {
      /* Keep gestures functional without storage. */
    }
  };
  const update = (next: WindowBox) => {
    current.current = constrain(next);
    if (frame.current === null)
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        setBox(current.current);
      });
  };
  const flush = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setBox(current.current);
    save();
  };
  useLayoutEffect(() => {
    if (!open || !root.current || !panel.current) return;
    const area = root.current.getBoundingClientRect(),
      rect = panel.current.getBoundingClientRect();
    const initial = current.current ||
      readSaved() || {
        x: rect.left - area.left,
        y: rect.top - area.top,
        width: rect.width,
        height: rect.height,
        scale: 1,
      };
    current.current = constrain(initial);
    setBox(current.current);
    save();
    let pinch: {
      ids: number[];
      distance: number;
      origin: WindowBox;
      anchorX: number;
      anchorY: number;
    } | null = null;
    const resize = () => {
      gesture.current = null;
      pinch = null;
      pinching.current = false;
      if (current.current) {
        update(current.current);
        save();
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(root.current);
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("scroll", resize);

    // Native non-passive touch listeners allow two-finger resizing while keeping
    // single-finger log scrolling native. Browser zoom stays enabled outside this panel.
    const element = panel.current;
    let lastTap: { time: number; x: number; y: number } | null = null;
    let contact: {
      id: number;
      x: number;
      y: number;
      time: number;
      lower: boolean;
      moved: boolean;
      drag: boolean;
      origin: WindowBox;
    } | null = null;
    const excluded = (target: Element) =>
      target.closest(
        "button,input,select,textarea,a,[role=button],.activity-panel-resize",
      );
    const touchesInside = (event: TouchEvent) =>
      Array.from(event.touches).filter((t) =>
        element.contains(t.target as Node),
      );
    const start = (event: TouchEvent) => {
      const touches = touchesInside(event);
      if (event.touches.length === 1) {
        suppressClick.current = false;
        const target = event.target as Element;
        const t = touches[0];
        if (t && current.current && !excluded(target)) {
          const upper = Boolean(target.closest(".trading-activity-header"));
          const second =
            !upper &&
            lastTap &&
            performance.now() - lastTap.time < 350 &&
            Math.hypot(t.clientX - lastTap.x, t.clientY - lastTap.y) < 28;
          contact = {
            id: t.identifier,
            x: t.clientX,
            y: t.clientY,
            time: performance.now(),
            lower: !upper,
            moved: false,
            drag: upper || Boolean(second),
            origin: { ...current.current },
          };
          if (contact.drag) {
            event.preventDefault();
            lastTap = null;
            gesture.current = null;
          }
        } else {
          contact = null;
          lastTap = null;
        }
        if (
          (event.target as Element).closest(
            ".activity-panel-drag-handle,.activity-panel-resize",
          )
        )
          event.preventDefault();
      }
      if (touches.length !== 2 || !current.current) return;
      contact = null;
      lastTap = null;
      event.preventDefault();
      gesture.current = null;
      pinching.current = true;
      suppressClick.current = true;
      const [a, b] = touches,
        rect = element.getBoundingClientRect();
      pinch = {
        ids: [a.identifier, b.identifier],
        distance: Math.max(
          1,
          Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        ),
        origin: { ...current.current },
        anchorX: ((a.clientX + b.clientX) / 2 - rect.left) / rect.width,
        anchorY: ((a.clientY + b.clientY) / 2 - rect.top) / rect.height,
      };
    };
    const move = (event: TouchEvent) => {
      if (contact && !pinch) {
        const t = Array.from(event.touches).find(
          (t) => t.identifier === contact!.id,
        );
        if (t) {
          const dx = t.clientX - contact.x,
            dy = t.clientY - contact.y;
          if (Math.hypot(dx, dy) >= 6) contact.moved = true;
          if (contact.drag) {
            event.preventDefault();
            if (contact.moved) {
              suppressClick.current = true;
              update({
                ...contact.origin,
                x: contact.origin.x + dx,
                y: contact.origin.y + dy,
              });
            }
          }
        }
      }
      if (!pinch) return;
      const a = Array.from(event.touches).find(
          (t) => t.identifier === pinch!.ids[0],
        ),
        b = Array.from(event.touches).find(
          (t) => t.identifier === pinch!.ids[1],
        );
      if (!a || !b) return;
      event.preventDefault();
      const boundsNow = bounds(),
        o = pinch.origin;
      const minRatio = Math.max(
        0.85 / o.scale,
        (240 * 0.85) / o.width,
        (280 * 0.85) / o.height,
      );
      const maxRatio = Math.min(
        1.5 / o.scale,
        boundsNow.width / o.width,
        boundsNow.height / o.height,
      );
      const ratio = clamp(
        Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) /
          pinch.distance,
        Math.min(minRatio, maxRatio),
        maxRatio,
      );
      update({
        width: o.width * ratio,
        height: o.height * ratio,
        scale: o.scale * ratio,
        x: o.x + (o.width - o.width * ratio) * pinch.anchorX,
        y: o.y + (o.height - o.height * ratio) * pinch.anchorY,
      });
    };
    const end = (event: TouchEvent) => {
      if (
        contact &&
        !Array.from(event.touches).some((t) => t.identifier === contact!.id)
      ) {
        if (
          contact.lower &&
          !contact.drag &&
          !contact.moved &&
          performance.now() - contact.time < 300 &&
          event.type !== "touchcancel"
        )
          lastTap = { time: performance.now(), x: contact.x, y: contact.y };
        else lastTap = null;
        if (contact.drag) flush();
        contact = null;
      }
      if (
        pinch &&
        !pinch.ids.every((id) =>
          Array.from(event.touches).some((t) => t.identifier === id),
        )
      ) {
        pinch = null;
        flush();
      }
      if (!event.touches.length) pinching.current = false;
    };
    element.addEventListener("touchstart", start, { passive: false });
    element.addEventListener("touchmove", move, { passive: false });
    element.addEventListener("touchend", end);
    element.addEventListener("touchcancel", end);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("scroll", resize);
      element.removeEventListener("touchstart", start);
      element.removeEventListener("touchmove", move);
      element.removeEventListener("touchend", end);
      element.removeEventListener("touchcancel", end);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      gesture.current = null;
      pinching.current = false;
    };
  }, [open]);
  const finish = (event: PointerEvent<HTMLElement>) => {
    if (gesture.current?.id !== event.pointerId) return;
    gesture.current = null;
    flush();
  };
  const resizeFrom = (o: WindowBox, edge: Edge, dx: number, dy: number) => {
    const b = bounds();
    let { x, y, width, height } = o;
    if (edge.includes("e"))
      width = clamp(
        o.width + dx,
        Math.min(240 * o.scale, b.width),
        b.right - o.x,
      );
    if (edge.includes("s"))
      height = clamp(
        o.height + dy,
        Math.min(280 * o.scale, b.height),
        b.bottom - o.y,
      );
    if (edge.includes("w")) {
      x = clamp(
        o.x + dx,
        b.left,
        o.x + o.width - Math.min(240 * o.scale, b.width),
      );
      width = o.width + o.x - x;
    }
    if (edge.includes("n")) {
      y = clamp(
        o.y + dy,
        b.top,
        o.y + o.height - Math.min(280 * o.scale, b.height),
      );
      height = o.height + o.y - y;
    }
    update({ ...o, x, y, width, height });
  };
  const handlers = (edge?: Edge) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (
        !event.isPrimary ||
        event.button !== 0 ||
        !current.current ||
        pinching.current
      )
        return;
      gesture.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        origin: { ...current.current },
        edge,
      };
      if (event.pointerType !== "touch") {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const g = gesture.current;
      if (!g || g.id !== event.pointerId || pinching.current) return;
      const dx = event.clientX - g.x,
        dy = event.clientY - g.y,
        o = g.origin;
      if (Math.hypot(dx, dy) < 6) return;
      if (!g.edge) {
        update({ ...o, x: o.x + dx, y: o.y + dy });
        return;
      }
      resizeFrom(o, g.edge, dx, dy);
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onLostPointerCapture: finish,
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      const d = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      }[event.key];
      if (!d || !current.current) return;
      event.preventDefault();
      event.stopPropagation();
      const step = event.shiftKey ? 30 : 10,
        o = current.current;
      if (edge) {
        resizeFrom(o, edge, d[0] * step, d[1] * step);
      } else update({ ...o, x: o.x + d[0] * step, y: o.y + d[1] * step });
      flush();
    },
  });
  return {
    ready: Boolean(box),
    style: box
      ? {
          left: 0,
          top: 0,
          right: "auto",
          bottom: "auto",
          transform: `translate3d(${box.x}px,${box.y}px,0)`,
          width: box.width,
          height: box.height,
          maxWidth: "none",
          maxHeight: "none",
        }
      : {},
    contentStyle: box
      ? {
          width: box.width / box.scale,
          height: box.height / box.scale,
          transform: `scale(${box.scale})`,
        }
      : {},
    handle: handlers(),
    header: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (
          event.pointerType === "touch" ||
          (event.target as Element).closest("button,input,a")
        )
          return;
        handlers().onPointerDown(event);
      },
      onPointerMove: handlers().onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: finish,
    },
    edges: EDGES.map((edge) => ({ edge, handle: handlers(edge) })),
    onClickCapture: (event: MouseEvent<HTMLDivElement>) => {
      if (suppressClick.current) {
        event.preventDefault();
        event.stopPropagation();
        suppressClick.current = false;
      }
    },
  };
}
