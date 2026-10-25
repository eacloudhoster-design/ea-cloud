import { useEffect, useRef, type RefObject, type PointerEvent } from "react";

type Drag = {
  x: number;
  y: number;
  time: number;
  distance: number;
  moved: boolean;
  id: number;
};
/** Single-finger sheet dismissal, keeping normal content scrolling and taps native. */
export function usePublicSheetDrag(
  sheet: RefObject<HTMLDivElement | null>,
  scroll: RefObject<HTMLDivElement | null>,
  open: boolean,
  close: () => void,
) {
  const gesture = useRef<Drag | null>(null);
  const suppressUntil = useRef(0);
  const closeRef = useRef(close);
  closeRef.current = close;
  const frame = useRef<number | null>(null);
  const paint = (distance: number) => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      sheet.current?.style.setProperty("--sheet-drag", `${distance}px`);
    });
  };
  const start = (x: number, y: number, id: number, target: Element) => {
    // A fresh press is intentional; only the preceding drag's compatibility click is suppressed.
    suppressUntil.current = 0;
    if (target.closest("input,textarea,select")) return false;
    if (
      scroll.current?.contains(target) &&
      !target.closest("[data-sheet-handle]") &&
      (scroll.current?.scrollTop || 0) > 0
    )
      return false;
    gesture.current = {
      x,
      y,
      id,
      time: performance.now(),
      distance: 0,
      moved: false,
    };
    return true;
  };
  const move = (x: number, y: number) => {
    const g = gesture.current;
    if (!g) return false;
    const dx = x - g.x,
      dy = y - g.y;
    if (!g.moved && (dy < -7 || Math.abs(dx) > Math.max(10, dy))) {
      gesture.current = null;
      return false;
    }
    if (dy < 7 && !g.moved) return false;
    g.moved = true;
    g.distance = Math.max(0, dy);
    sheet.current?.setAttribute("data-dragging", "true");
    paint(g.distance);
    return true;
  };
  const finish = (cancelled = false) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    sheet.current?.removeAttribute("data-dragging");
    if (g.moved) {
      suppressUntil.current = performance.now() + 450;
      const threshold = Math.max(
        65,
        (sheet.current?.getBoundingClientRect().height || 400) * 0.2,
      );
      const speed = g.distance / Math.max(1, performance.now() - g.time);
      if (
        !cancelled &&
        (g.distance >= threshold || (speed > 0.55 && g.distance > 35))
      ) {
        closeRef.current();
        return;
      }
    }
    sheet.current?.style.setProperty("--sheet-drag", "0px");
  };
  useEffect(() => {
    if (!open || !sheet.current) return;
    const el = sheet.current;
    suppressUntil.current = 0;
    el.style.setProperty("--sheet-drag", "0px");
    el.removeAttribute("data-dragging");
    const down = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        finish(true);
        return;
      }
      const t = e.touches[0];
      start(t.clientX, t.clientY, t.identifier, e.target as Element);
    };
    const drag = (e: TouchEvent) => {
      const t = Array.from(e.touches).find(
        (t) => t.identifier === gesture.current?.id,
      );
      if (t && move(t.clientX, t.clientY)) e.preventDefault();
    };
    const up = (e: TouchEvent) => {
      if (
        gesture.current &&
        !Array.from(e.touches).some((t) => t.identifier === gesture.current?.id)
      )
        finish(e.type === "touchcancel");
    };
    el.addEventListener("touchstart", down, { passive: false });
    el.addEventListener("touchmove", drag, { passive: false });
    el.addEventListener("touchend", up);
    el.addEventListener("touchcancel", up);
    return () => {
      el.removeEventListener("touchstart", down);
      el.removeEventListener("touchmove", drag);
      el.removeEventListener("touchend", up);
      el.removeEventListener("touchcancel", up);
      gesture.current = null;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [open]);
  return {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== "touch" && e.button === 0 && e.isPrimary)
        start(e.clientX, e.clientY, e.pointerId, e.target as Element);
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "touch" || gesture.current?.id !== e.pointerId)
        return;
      if (move(e.clientX, e.clientY)) {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== "touch") finish();
    },
    onPointerCancel: (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== "touch") finish(true);
    },
    onLostPointerCapture: (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== "touch") finish(true);
    },
    onClickCapture: (e: React.MouseEvent<HTMLDivElement>) => {
      if (performance.now() < suppressUntil.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };
}
