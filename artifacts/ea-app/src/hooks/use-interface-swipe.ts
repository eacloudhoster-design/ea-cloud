import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { InterfaceStyle } from "@/context/AppContext";
import { adjacentInterface, horizontalSwipe } from "@/lib/home-preferences";

const controls =
  "button,a,input,select,textarea,label,summary,[role=button],[role=slider],[role=combobox],[role=listbox],[contenteditable]:not([contenteditable=false]),[data-no-interface-swipe]";
type Gesture = { id: number; x: number; y: number; time: number };

export function useInterfaceSwipe(
  style: InterfaceStyle,
  select: (style: InterfaceStyle) => void,
  enabled: boolean,
) {
  const gesture = useRef<Gesture | null>(null);
  const switchedAt = useRef(-Infinity);
  const [transition, setTransition] = useState<{
    target: InterfaceStyle;
    direction: "next" | "previous";
  } | null>(null);
  useEffect(() => {
    gesture.current = null;
  }, [style, enabled]);

  const cancel = () => {
    gesture.current = null;
  };
  return {
    direction: transition?.target === style ? transition.direction : null,
    handlers: {
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        cancel();
        if (!enabled || event.pointerType !== "touch" || !event.isPrimary)
          return;
        if ((event.target as Element).closest(controls)) return;
        // Leave the very edge available for browser/OS navigation gestures.
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left + 16 ||
          event.clientX > bounds.right - 16
        )
          return;
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
        if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) {
          cancel();
          return;
        }
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          // A swipe that ends over a button must not activate that button.
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      },
      onPointerUp(event: PointerEvent<HTMLDivElement>) {
        const start = gesture.current;
        cancel();
        if (
          !enabled ||
          !start ||
          start.id !== event.pointerId ||
          event.timeStamp - switchedAt.current < 250
        )
          return;
        const direction = horizontalSwipe(
          event.clientX - start.x,
          event.clientY - start.y,
          event.timeStamp - start.time,
        );
        if (!direction) return;
        const target = adjacentInterface(style, direction);
        switchedAt.current = event.timeStamp;
        setTransition({ target, direction });
        select(target);
      },
      onPointerCancel: cancel,
      onContextMenu: cancel,
      onAnimationEnd: () => setTransition(null),
    },
  };
}
