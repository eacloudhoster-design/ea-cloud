import { useLayoutEffect } from "react";
import { isIosStandaloneLayout } from "./use-ios-standalone-layout";

/** Page zoom is distinct from the draggable panels' own pinch/resize gestures. */
export function installIosStandaloneZoomGuard() {
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  const original = viewport?.getAttribute("content");
  const root = document.documentElement;
  const attribute = "data-ea-ios-standalone-zoom";
  const previous = root.getAttribute(attribute);
  const media = matchMedia("(display-mode: standalone)");
  let active = false;
  const restore = () => {
    if (viewport && original !== null && original !== undefined) viewport.setAttribute("content", original);
    if (previous === null) root.removeAttribute(attribute);
    else root.setAttribute(attribute, previous);
    active = false;
  };
  const apply = () => {
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone;
    if (!isIosStandaloneLayout({ userAgent: navigator.userAgent, platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints, standalone: standalone === true, displayStandalone: media.matches })) {
      if (active) restore();
      return;
    }
    active = true;
    root.setAttribute(attribute, "");
    // Keep the device-width layout. No fixed design width or inferred scale:
    // screenshots alone cannot establish the installed device's viewport.
    const content = "width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
    if (viewport?.getAttribute("content") !== content) viewport?.setAttribute("content", content);
  };
  const preventPageGesture = (event: Event) => {
    if (active && event.cancelable) event.preventDefault();
  };
  apply();
  media.addEventListener("change", apply);
  window.addEventListener("pageshow", apply);
  window.addEventListener("orientationchange", apply);
  window.addEventListener("resize", apply);
  // WebKit native page gestures only; do not cancel touchmove/pointer events.
  document.addEventListener("gesturestart", preventPageGesture, { passive: false });
  document.addEventListener("gesturechange", preventPageGesture, { passive: false });
  return () => {
    media.removeEventListener("change", apply);
    window.removeEventListener("pageshow", apply);
    window.removeEventListener("orientationchange", apply);
    window.removeEventListener("resize", apply);
    document.removeEventListener("gesturestart", preventPageGesture);
    document.removeEventListener("gesturechange", preventPageGesture);
    if (active) restore();
  };
}

export function useIosStandaloneZoom() {
  useLayoutEffect(installIosStandaloneZoomGuard, []);
}
