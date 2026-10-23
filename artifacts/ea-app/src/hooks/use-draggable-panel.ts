import {
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent,
  type KeyboardEvent,
} from "react";
type Point = { x: number; y: number };
type Gesture = {
  id: number;
  x: number;
  y: number;
  origin: Point;
  moved: boolean;
};

/** Session-local panel position, independent of the saved floating-circle position. */
export function useDraggablePanel(
  root: RefObject<HTMLDivElement | null>,
  panel: RefObject<HTMLDivElement | null>,
  open: boolean,
) {
  const current = useRef<Point | null>(null),
    gesture = useRef<Gesture | null>(null),
    frame = useRef<number | null>(null);
  const [point, setPoint] = useState<Point | null>(null);
  const [limits, setLimits] = useState({ width: 430, height: 540 });
  const bounds = () => {
    const rect = root.current!.getBoundingClientRect(),
      viewport = window.visualViewport,
      css = getComputedStyle(root.current!);
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
    return { left, top, right, bottom };
  };
  const clamp = (position: Point) => {
    const edge = bounds(),
      rect = panel.current!.getBoundingClientRect();
    return {
      x: Math.max(
        edge.left,
        Math.min(position.x, Math.max(edge.left, edge.right - rect.width)),
      ),
      y: Math.max(
        edge.top,
        Math.min(position.y, Math.max(edge.top, edge.bottom - rect.height)),
      ),
    };
  };
  const move = (next: Point) => {
    current.current = clamp(next);
    if (frame.current === null)
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        setPoint(current.current);
      });
  };
  useLayoutEffect(() => {
    if (!open || !root.current || !panel.current) return;
    const resize = () => {
      const edge = bounds();
      const next = {
        width: Math.max(1, edge.right - edge.left),
        height: Math.max(1, Math.min(540, edge.bottom - edge.top)),
      };
      setLimits((previous) =>
        previous.width === next.width && previous.height === next.height
          ? previous
          : next,
      );
      const area = root.current!.getBoundingClientRect(),
        rect = panel.current!.getBoundingClientRect();
      const position = clamp(
        current.current || { x: rect.left - area.left, y: rect.top - area.top },
      );
      current.current = position;
      setPoint((previous) =>
        previous?.x === position.x && previous?.y === position.y
          ? previous
          : position,
      );
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(root.current);
    observer.observe(panel.current);
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("scroll", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("scroll", resize);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      gesture.current = null;
    };
  }, [open]);
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    if (gesture.current?.id !== event.pointerId) return;
    gesture.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setPoint(current.current);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return {
    style: {
      ...(point
        ? {
            left: 0,
            top: 0,
            right: "auto",
            bottom: "auto",
            transform: `translate3d(${point.x}px,${point.y}px,0)`,
          }
        : {}),
      maxWidth: limits.width,
      maxHeight: limits.height,
    },
    handle: {
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (
          !event.isPrimary ||
          event.button !== 0 ||
          !current.current ||
          gesture.current
        )
          return;
        gesture.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          origin: current.current,
          moved: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        const drag = gesture.current;
        if (!drag || drag.id !== event.pointerId) return;
        const dx = event.clientX - drag.x,
          dy = event.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < 6) return;
        drag.moved = true;
        event.preventDefault();
        move({ x: drag.origin.x + dx, y: drag.origin.y + dy });
      },
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: finish,
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        const delta = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        }[event.key];
        if (!delta || !current.current) return;
        event.preventDefault();
        event.stopPropagation();
        const step = event.shiftKey ? 30 : 10;
        move({
          x: current.current.x + delta[0] * step,
          y: current.current.y + delta[1] * step,
        });
      },
    },
  };
}
