import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useApp, type ShapeStyle } from "@/context/AppContext";
import "./InteractiveBotPortrait.css";
/** Persistent layout slot; hidden portraits restore through capture-based hit testing. */
export default function InteractiveBotPortrait({
  size,
  margin = 0,
  frameInset = 0,
  enabled = true,
  children,
}: {
  size: number;
  margin?: number;
  frameInset?: number;
  enabled?: boolean;
  children: (shape: Exclude<ShapeStyle, "none">) => ReactNode;
}) {
  const {
    shapeStyle,
    setShapeStyle,
    restoreShape = "orbit",
    activeTab,
    clientToken,
    visualModes,
    interfaceStyle,
  } = useApp();
  const hidden = shapeStyle === "none",
    reduced = useReducedMotion();
  const slot = useRef<HTMLDivElement>(null),
    latest = useRef({
      hidden,
      shapeStyle,
      restoreShape,
      setShapeStyle,
      activeTab,
      enabled,
    });
  latest.current = {
    hidden,
    shapeStyle,
    restoreShape,
    setShapeStyle,
    activeTab,
    enabled,
  };
  const [retain, setRetain] = useState(!hidden);
  const previous = shapeStyle === "none" ? restoreShape : shapeStyle;
  useEffect(() => {
    if (!hidden) {
      setRetain(true);
      return;
    }
    const timer = setTimeout(() => setRetain(false), reduced ? 0 : 400);
    return () => clearTimeout(timer);
  }, [hidden, reduced]);
  useLayoutEffect(() => {
    const node = slot.current,
      root = node?.closest<HTMLElement>("[data-home-interface]");
    if (!node || !root) return;
    let down: { id: number; x: number; y: number; at: number } | null = null;
    let tap: { x: number; y: number; at: number } | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => {
      down = null;
      tap = null;
      clearTimeout(timer);
    };
    const eligible = (e: PointerEvent) => {
      if (!latest.current.enabled) return false;
      if (latest.current.activeTab && latest.current.activeTab !== "home")
        return false;
      const target = e.target instanceof Element ? e.target : null;
      if (!latest.current.hidden)
        return (
          !!target &&
          node.contains(target) &&
          !!target.closest(".robot-image-frame")
        );
      // The former image rectangle follows its content anchor when scrolling. It has
      // no pointer-active overlay: foreground controls always retain their own events.
      if (
        target?.closest(
          "button,a,input,select,textarea,[role=button],[data-bot-name],[data-no-interface-swipe]",
        )
      )
        return false;
      const r = node.getBoundingClientRect(),
        inset = frameInset;
      return (
        e.clientX >= r.left + inset &&
        e.clientX <= r.left + size - inset &&
        e.clientY >= r.top + inset &&
        e.clientY <= r.top + size - inset
      );
    };
    const start = (e: PointerEvent) => {
      if (!e.isPrimary) {
        cancel();
        return;
      }
      if (e.button !== 0 || !eligible(e)) return;
      down = { id: e.pointerId, x: e.clientX, y: e.clientY, at: e.timeStamp };
    };
    const move = (e: PointerEvent) => {
      if (
        down &&
        down.id === e.pointerId &&
        Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10
      )
        cancel();
    };
    const end = (e: PointerEvent) => {
      const first = down;
      down = null;
      if (
        !first ||
        first.id !== e.pointerId ||
        e.timeStamp - first.at > 350 ||
        Math.hypot(e.clientX - first.x, e.clientY - first.y) > 10 ||
        !eligible(e)
      )
        return;
      const state = latest.current;
      if (
        tap &&
        e.timeStamp - tap.at <= 300 &&
        Math.hypot(e.clientX - tap.x, e.clientY - tap.y) <= 24
      ) {
        clearTimeout(timer);
        tap = null;
        state.setShapeStyle(state.hidden ? state.restoreShape : "none");
      } else {
        clearTimeout(timer);
        tap = { x: e.clientX, y: e.clientY, at: e.timeStamp };
        timer = setTimeout(() => {
          tap = null;
          const current = latest.current;
          if (!current.hidden)
            current.setShapeStyle(
              current.shapeStyle === "orbit" ? "neural" : "orbit",
            );
        }, 300);
      }
    };
    root.addEventListener("pointerdown", start, true);
    root.addEventListener("pointermove", move, true);
    root.addEventListener("pointerup", end, true);
    root.addEventListener("pointercancel", cancel, true);
    root.addEventListener("scroll", cancel, true);
    return () => {
      cancel();
      root.removeEventListener("pointerdown", start, true);
      root.removeEventListener("pointermove", move, true);
      root.removeEventListener("pointerup", end, true);
      root.removeEventListener("pointercancel", cancel, true);
      root.removeEventListener("scroll", cancel, true);
    };
  }, [
    size,
    frameInset,
    enabled,
    activeTab,
    shapeStyle,
    clientToken,
    interfaceStyle,
    visualModes?.ea?.id,
  ]);
  const duration = reduced ? 0 : 0.38;
  return (
    <motion.div
      ref={slot}
      data-portrait-interactive
      data-hidden={hidden}
      className="interactive-portrait-slot"
      role="button"
      tabIndex={enabled ? 0 : -1}
      aria-label={
        hidden
          ? "Restore bot portrait. Double tap its previous location or press Enter."
          : "Change bot portrait shape. Tap to alternate circle and rounded square; double tap to hide."
      }
      onClick={(e) => {
        if (enabled && e.detail === 0)
          setShapeStyle(
            hidden ? restoreShape : shapeStyle === "orbit" ? "neural" : "orbit",
          );
      }}
      onKeyDown={(e) => {
        if (!enabled || e.repeat) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setShapeStyle(
            hidden ? restoreShape : shapeStyle === "orbit" ? "neural" : "orbit",
          );
        } else if (e.key === "Escape" && !hidden) {
          e.preventDefault();
          setShapeStyle("none");
        }
      }}
      style={{ width: size, "--portrait-size": `${size}px` } as CSSProperties}
      onUpdate={() =>
        slot.current?.dispatchEvent(
          new Event("ea:portrait-layout", { bubbles: true }),
        )
      }
      initial={false}
      animate={{ height: size, marginBottom: margin }}
      transition={{ duration, ease: [0.22, 0.68, 0, 1] }}
    >
      {(!hidden || retain) && (
        <motion.div
          className="interactive-portrait-visual"
          style={{ width: size, height: size }}
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: hidden ? 0 : 1, scale: hidden ? 0.94 : 1 }}
          transition={{ duration, ease: [0.22, 0.68, 0, 1] }}
          aria-hidden={hidden}
        >
          {children(previous)}
        </motion.div>
      )}
    </motion.div>
  );
}
