import { useLayoutEffect } from "react";

/** Paint the same mentor artwork on the standalone page canvas, without
 * changing the safe-area content box or exposing artwork after sign-out. */
export function usePwaBackground(source: string, enabled: boolean) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const standalone = window.matchMedia("(display-mode: standalone)");
    const attribute = "data-ea-pwa-background";
    const property = "--ea-pwa-background-image";
    const previousAttribute = root.getAttribute(attribute);
    const previousImage = root.style.getPropertyValue(property);
    const previousPriority = root.style.getPropertyPriority(property);
    const restore = () => {
      if (previousAttribute === null) root.removeAttribute(attribute);
      else root.setAttribute(attribute, previousAttribute);
      if (previousImage) root.style.setProperty(property, previousImage, previousPriority);
      else root.style.removeProperty(property);
    };
    const apply = () => {
      const legacyStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;
      if (!enabled || !(standalone.matches || legacyStandalone)) { restore(); return; }
      root.style.setProperty(property, `url(${JSON.stringify(source)})`);
      root.setAttribute(attribute, "");
    };
    apply();
    standalone.addEventListener("change", apply);
    return () => { standalone.removeEventListener("change", apply); restore(); };
  }, [source, enabled]);
}
