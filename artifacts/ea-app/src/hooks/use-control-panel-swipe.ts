import { useEffect, useRef, type PointerEvent } from "react";
import {
  adjacentControlPanel,
  horizontalSwipe,
  type ControlPanelStyle,
} from "@/lib/home-preferences";

/** Local gesture boundary: no trading actions or interface selection. */
export function useControlPanelSwipe(
  panel: ControlPanelStyle,
  select: (panel: ControlPanelStyle) => void,
) {
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    time: number;
  } | null>(null);
  const suppressUntil = useRef(0);
  const surface = useRef<HTMLDivElement>(null);
  const previous = useRef(panel);
  useEffect(() => {
    if (
      previous.current !== panel &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const animation = surface.current?.animate(
        [
          { opacity: 0.4, transform: "translateX(8px)" },
          { opacity: 1, transform: "translateX(0)" },
        ],
        { duration: 240, easing: "ease-out" },
      );
      previous.current = panel;
      return () => animation?.cancel();
    }
    previous.current = panel;
    return undefined;
  }, [panel]);
  const cancel = () => {
    gesture.current = null;
  };
  return {
    ref: surface,
    "data-no-interface-swipe": true,
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      // The parent interface gesture must never start inside this surface.
      event.stopPropagation();
      if (event.isPrimary) suppressUntil.current = 0;
      if (!event.isPrimary || event.pointerType === "mouse") {
        cancel();
        return;
      }
      gesture.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        time: event.timeStamp,
      };
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const start = gesture.current;
      if (!start || start.id !== event.pointerId) return;
      const dx = event.clientX - start.x,
        dy = event.clientY - start.y;
      if (Math.abs(dx) > 12 || Math.abs(dy) > 12)
        suppressUntil.current = performance.now() + 800;
      if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) {
        cancel();
        return;
      }
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5)
        event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerUp(event: PointerEvent<HTMLDivElement>) {
      const start = gesture.current;
      cancel();
      if (!start || start.id !== event.pointerId) return;
      const direction = horizontalSwipe(
        event.clientX - start.x,
        event.clientY - start.y,
        event.timeStamp - start.time,
      );
      if (direction) {
        suppressUntil.current = performance.now() + 800;
        select(adjacentControlPanel(panel, direction));
      }
    },
    onPointerCancel() {
      if (gesture.current) suppressUntil.current = performance.now() + 800;
      cancel();
    },
    onLostPointerCapture(event: PointerEvent<HTMLDivElement>) {
      if (event.target === event.currentTarget) cancel();
    },
    onClickCapture(event: React.MouseEvent<HTMLDivElement>) {
      if (performance.now() < suppressUntil.current && event.detail !== 0) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
}
