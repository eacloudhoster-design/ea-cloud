import { useEffect, type RefObject } from "react";

/** Direction hysteresis prevents trackpad jitter and iOS rubber-band flicker. */
export function useSmartPublicNavigation(
  ref: RefObject<HTMLElement | null>,
  locked: boolean,
  route: string,
) {
  useEffect(() => {
    const header = ref.current;
    if (!header) return;
    const position = () =>
      Math.max(
        0,
        Math.min(
          scrollY,
          Math.max(0, document.documentElement.scrollHeight - innerHeight),
        ),
      );
    let last = position(),
      direction = 0,
      travel = 0,
      frame = 0,
      overlay = false,
      keyboard = false,
      width = innerWidth;
    const show = () => {
      header.dataset.scrollHidden = "false";
    };
    const reset = () => {
      last = position();
      direction = 0;
      travel = 0;
      show();
    };
    const resize = () => {
      // Mobile browser chrome changes viewport height during a gesture. Do not
      // reveal the header on every address-bar resize; orientation/width changes reset it.
      if (innerWidth !== width) {
        width = innerWidth;
        reset();
      } else {
        last = position();
        direction = 0;
        travel = 0;
      }
    };
    const focused = () => keyboard && header.contains(document.activeElement);
    const paint = () => {
      frame = 0;
      const y = position(),
        delta = y - last;
      last = y;
      if (locked || overlay || focused() || y <= 24) {
        show();
        direction = 0;
        travel = 0;
        return;
      }
      if (delta === 0) return;
      const next = delta > 0 ? 1 : -1;
      travel = direction === next ? travel + Math.abs(delta) : Math.abs(delta);
      direction = next;
      if (next > 0 && y > header.offsetHeight + 16 && travel >= 28) {
        header.dataset.scrollHidden = "true";
      } else if (next < 0 && travel >= 14) show();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        keyboard = true;
        reset();
      }
    };
    const pointer = () => {
      keyboard = false;
    };
    const focus = () => {
      if (header.contains(document.activeElement)) reset();
    };
    const inspect = () => {
      const open = Boolean(
        document.querySelector(
          '[role="dialog"][data-state="open"], [role="menu"][data-state="open"]',
        ),
      );
      if (open !== overlay) {
        overlay = open;
        reset();
      }
    };
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("keydown", key, true);
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("focusin", focus);
    window.addEventListener("pageshow", reset);
    inspect();
    reset();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pageshow", reset);
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("focusin", focus);
      header.removeAttribute("data-scroll-hidden");
    };
  }, [ref, locked, route]);
}
