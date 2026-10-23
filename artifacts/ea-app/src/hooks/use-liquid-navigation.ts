import {
  useLayoutEffect,
  useRef,
  type MouseEvent,
  type PointerEvent,
} from "react";
import type { Tab } from "@/context/AppContext";

export const navigationTabs: Tab[] = ["metatrader", "home", "settings"];
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** Pointer samples and spring frames update only the decorative layer, not React state. */
export function useLiquidNavigation(
  activeTab: Tab,
  onTabChange: (tab: Tab) => void,
) {
  const bar = useRef<HTMLDivElement>(null);
  const glass = useRef<HTMLDivElement>(null);
  const model = useRef({
    x: 0,
    target: 0,
    velocity: 0,
    step: 1,
    frame: 0,
    time: 0,
    reduced: false,
    pressed: false,
    blockedClickUntil: 0,
    gesture: null as null | {
      id: number;
      startX: number;
      startY: number;
      origin: number;
      dragged: boolean;
    },
  });
  const current = useRef({ activeTab, onTabChange });
  current.current = { activeTab, onTabChange };
  const tick = useRef<(time: number) => void>(() => {});
  const wake = () => {
    const s = model.current;
    if (!s.frame) {
      s.time = 0;
      s.frame = requestAnimationFrame((time) => tick.current(time));
    }
  };
  const paint = () => {
    const s = model.current,
      node = glass.current;
    if (!node) return;
    const dragging = !!s.gesture?.dragged;
    const x = dragging ? s.target : s.x;
    const lag = s.reduced ? 0 : clamp((s.target - s.x) / s.step, -1, 1);
    const stretch = s.reduced
      ? 1
      : 1 + Math.abs(lag) * 0.12 + (s.pressed ? 0.035 : 0);
    node.style.transform = `translate3d(${x}px,${s.pressed && !s.reduced ? -2 : 0}px,0) scale(${stretch},${s.pressed && !s.reduced ? 1.055 : 1}) skewX(${-lag * 2}deg)`;
    node.style.setProperty("--glass-reflection", `${50 + lag * 24}%`);
    // Keep the magnified image stationary relative to the viewport as the lens travels.
    node.style.setProperty("--lens-x", `${-x}px`);
    bar.current?.setAttribute("data-pressed", String(s.pressed));
    const preview = Math.round(s.target / s.step);
    bar.current
      ?.querySelectorAll<HTMLButtonElement>("button[data-nav-index]")
      .forEach((button, index) => {
        button.dataset.preview = String(
          index ===
            (s.gesture
              ? preview
              : navigationTabs.indexOf(current.current.activeTab)),
        );
      });
  };
  tick.current = (time) => {
    const s = model.current;
    const dt = Math.min((time - (s.time || time - 16)) / 1000, 0.032);
    s.time = time;
    if (s.reduced) {
      s.x = s.target;
      s.velocity = 0;
    } else {
      const stiffness = s.gesture?.dragged ? 700 : 360;
      const damping = s.gesture?.dragged ? 40 : 27;
      s.velocity += ((s.target - s.x) * stiffness - s.velocity * damping) * dt;
      s.x += s.velocity * dt;
    }
    const moving =
      Math.abs(s.target - s.x) > 0.06 || Math.abs(s.velocity) > 0.06;
    if (!moving) {
      s.x = s.target;
      s.velocity = 0;
    }
    paint();
    s.frame = moving ? requestAnimationFrame((t) => tick.current(t)) : 0;
  };
  const cancel = () => {
    const s = model.current;
    if (s.gesture?.dragged) s.x = s.target;
    s.gesture = null;
    s.pressed = false;
    s.target = navigationTabs.indexOf(current.current.activeTab) * s.step;
    wake();
  };

  useLayoutEffect(() => {
    const node = bar.current;
    if (!node) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const preference = () => {
      model.current.reduced = media.matches;
      wake();
    };
    const measure = () => {
      const s = model.current,
        rect = node.getBoundingClientRect();
      s.gesture = null;
      s.pressed = false;
      s.step = (rect.width - 14) / 3;
      s.target = navigationTabs.indexOf(current.current.activeTab) * s.step;
      s.x = s.target;
      s.velocity = 0;
      node.style.setProperty("--glass-step", `${s.step}px`);
      // Align the optional magnification plane to the unchanged app image layer.
      const viewport = node
        .closest(".ea-app-viewport")
        ?.getBoundingClientRect();
      if (viewport) {
        node.style.setProperty("--lens-width", `${viewport.width}px`);
        node.style.setProperty("--lens-height", `${viewport.height}px`);
        node.style.setProperty("--lens-left", `${viewport.x - rect.x - 6}px`);
        node.style.setProperty("--lens-top", `${viewport.y - rect.y - 5}px`);
      }
      paint();
    };
    const hidden = () => {
      if (document.hidden) cancel();
    };
    preference();
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const viewport = node.closest(".ea-app-viewport");
    if (viewport) observer.observe(viewport);
    window.visualViewport?.addEventListener("resize", measure);
    media.addEventListener("change", preference);
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      cancelAnimationFrame(model.current.frame);
      model.current.frame = 0;
      observer.disconnect();
      media.removeEventListener("change", preference);
      window.visualViewport?.removeEventListener("resize", measure);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  useLayoutEffect(() => {
    cancel();
  }, [activeTab]);

  const pointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!event.isPrimary || event.button !== 0 || model.current.gesture) return;
    const button = (event.target as Element).closest<HTMLButtonElement>(
      "button[data-nav-index]",
    );
    if (!button) return;
    const s = model.current,
      index = Number(button.dataset.navIndex);
    s.gesture = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: index * s.step,
      dragged: false,
    };
    s.pressed = true;
    s.target = index * s.step;
    event.currentTarget.setPointerCapture(event.pointerId);
    wake();
  };
  const pointerMove = (event: PointerEvent<HTMLElement>) => {
    const s = model.current,
      gesture = s.gesture;
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.startX;
    if (Math.hypot(dx, event.clientY - gesture.startY) > 7)
      gesture.dragged = true;
    if (gesture.dragged) s.target = clamp(gesture.origin + dx, 0, s.step * 2);
    wake();
  };
  const pointerUp = (event: PointerEvent<HTMLElement>) => {
    const s = model.current,
      gesture = s.gesture;
    if (!gesture || event.pointerId !== gesture.id) return;
    const rect = event.currentTarget.getBoundingClientRect();
    s.blockedClickUntil = performance.now() + 500;
    const index = Math.round(s.target / s.step);
    // The lead edge tracks the finger directly; start settling at that last
    // visible position, rather than jumping back to the lagging spring body.
    if (gesture.dragged) s.x = s.target;
    s.velocity = clamp(s.velocity, -600, 600);
    s.gesture = null;
    s.pressed = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (event.clientY < rect.top - 48 || event.clientY > rect.bottom + 48) {
      cancel();
      return;
    }
    s.target = index * s.step;
    wake();
    current.current.onTabChange(navigationTabs[index]);
  };
  return {
    bar,
    glass,
    pointerDown,
    pointerMove,
    pointerUp,
    pointerCancel: (event: PointerEvent<HTMLElement>) => {
      if (model.current.gesture?.id === event.pointerId) {
        model.current.blockedClickUntil = performance.now() + 500;
        cancel();
      }
    },
    click: (event: MouseEvent, tab: Tab) => {
      // Compatibility clicks following pointerup must not navigate a second time.
      if (
        event.detail > 0 &&
        performance.now() < model.current.blockedClickUntil
      ) {
        event.preventDefault();
        return;
      }
      current.current.onTabChange(tab);
    },
  };
}
