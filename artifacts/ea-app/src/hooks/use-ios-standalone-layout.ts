import { useLayoutEffect } from "react";

export function isIosStandaloneLayout(device: {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  standalone: boolean;
  displayStandalone: boolean;
}) {
  const ios = /iPhone|iPad|iPod/i.test(device.userAgent) ||
    (device.platform === "MacIntel" && device.maxTouchPoints > 1);
  return ios && (device.standalone || device.displayStandalone);
}

/** iOS standalone's fixed/dynamic viewport can omit the status-bar extent.
 * Select a document-flow, large-viewport layout without changing other platforms
 * or adding an inset to the viewport twice. No device dimensions are hardcoded. */
export function useIosStandaloneLayout(enabled: boolean) {
  useLayoutEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    const attribute = "data-ea-ios-standalone-layout";
    const previous = root.getAttribute(attribute);
    const media = window.matchMedia("(display-mode: standalone)");
    const restore = () => {
      if (previous === null) root.removeAttribute(attribute);
      else root.setAttribute(attribute, previous);
    };
    const apply = () => {
      const standalone = (navigator as Navigator & { standalone?: boolean }).standalone;
      if (isIosStandaloneLayout({
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        maxTouchPoints: navigator.maxTouchPoints,
        standalone: standalone === true,
        displayStandalone: media.matches,
      })) root.setAttribute(attribute, "");
      else restore();
    };
    apply();
    media.addEventListener("change", apply);
    window.addEventListener("pageshow", apply);
    return () => {
      media.removeEventListener("change", apply);
      window.removeEventListener("pageshow", apply);
      restore();
    };
  }, [enabled]);
}
