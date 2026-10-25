import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { InterfaceStyle } from "@/context/AppContext";
import { adjacentInterface, horizontalSwipe } from "@/lib/home-preferences";

const controls =
  "button,a,input,select,textarea,label,summary,[role=button]:not([data-portrait-interactive]),[role=slider],[role=combobox],[role=listbox],[contenteditable]:not([contenteditable=false]),[data-no-interface-swipe]";
type Gesture = { id: number; x: number; y: number; time: number };

export function useInterfaceSwipe(
  style: InterfaceStyle,
  select: (style: InterfaceStyle) => void,
  enabled: boolean,
) {
  const gesture = useRef<Gesture | null>(null);
  const switchedAt = useRef(-Infinity);
  const outgoing = useRef<HTMLElement | null>(null);
  useEffect(() => () => outgoing.current?.remove(), []);
  const blocked = () =>
    !enabled ||
    !!document.querySelector(
      '[role="dialog"], [aria-modal="true"], [data-panel-open="true"]',
    );
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
        if (blocked() || event.pointerType !== "touch" || !event.isPrimary)
          return;
        if ((event.target as Element).closest(controls)) return;
        // Leave the very edge available for browser/OS navigation gestures.
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientY > window.innerHeight / 2 ||
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
          blocked() ||
          !start ||
          start.id !== event.pointerId ||
          event.timeStamp - switchedAt.current < 350
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
        // An inert visual snapshot exits while the next interface enters. It has
        // no React handlers, effects or subscriptions, so trading/voice never restart.
        outgoing.current?.remove();
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          const surface = event.currentTarget;
          const snapshot = surface.cloneNode(true) as HTMLElement;
          snapshot.inert = true;
          snapshot.setAttribute("aria-hidden", "true");
          snapshot.dataset.interfaceExit = direction;
          snapshot.removeAttribute("data-home-swipe-surface");
          snapshot.classList.remove(
            "ea-home-swipe-next",
            "ea-home-swipe-previous",
          );
          snapshot.style.pointerEvents = "none";
          snapshot.style.zIndex = "20";
          surface.parentElement?.appendChild(snapshot);
          snapshot.scrollTop = surface.scrollTop;
          outgoing.current = snapshot;
          const animation = snapshot.animate(
            [
              { transform: "translateX(0)", opacity: 1 },
              {
                transform: `translateX(${direction === "next" ? "-100%" : "100%"})`,
                opacity: 0,
              },
            ],
            { duration: 300, easing: "ease-out", fill: "forwards" },
          );
          animation.onfinish = () => snapshot.remove();
        }
        setTransition({ target, direction });
        select(target);
      },
      onPointerCancel: cancel,
      onContextMenu: cancel,
      onAnimationEnd: (event: React.AnimationEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) setTransition(null);
      },
    },
  };
}
