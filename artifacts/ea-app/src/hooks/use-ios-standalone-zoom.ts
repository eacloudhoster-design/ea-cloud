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
    // The approved portrait reference uses a 390 CSS-pixel design canvas.
    // Wider layout viewports otherwise make every fixed-size control smaller
    // relative to the screen. Normalize the shared viewport, not each design.
    // width * visual scale stays stable after normalization and on keyboard open.
    const angle = (window as Window & { orientation?: number }).orientation ?? screen.orientation?.angle ?? 0;
    const iphonePortrait = /iPhone/i.test(navigator.userAgent) && Math.abs(angle % 180) === 0;
    const surfaceWidth = (visualViewport?.width || innerWidth) * (visualViewport?.scale || 1);
    const scale = iphonePortrait && surfaceWidth > 390 ? Number((surfaceWidth / 390).toFixed(5)) : 1;
    const width = scale > 1 ? "390" : "device-width";
    const content = `width=${width}, initial-scale=${scale}, minimum-scale=${scale}, maximum-scale=${scale}, user-scalable=no, viewport-fit=cover`;
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
