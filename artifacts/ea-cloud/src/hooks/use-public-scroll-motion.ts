import { useEffect, type RefObject } from "react";

const clamp = (value: number) => Math.max(0, Math.min(1, value));
type Scene = {
  element: HTMLElement;
  offset: number;
  entry: boolean;
  last: string;
};

/** Reversible edge effects compose with the existing entrance/hover transforms. */
export function usePublicScrollMotion(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = root.current;
    if (!container) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const supportsFocusVisible = CSS.supports("selector(:focus-visible)");
    const supportsTranslate = CSS.supports("translate", "0 1px");
    const scenes: Scene[] = Array.from(
      container.querySelectorAll<HTMLElement>(
        ".hero-copy, .hero-showcase, .hero-baseline, [data-reveal]",
      ),
    ).map((element) => ({
      element,
      offset: 0,
      entry: element.getBoundingClientRect().top >= innerHeight,
      last: "",
    }));
    const active = new Set(scenes);
    const byElement = new Map(scenes.map((scene) => [scene.element, scene]));
    let frame = 0,
      pointer: Scene | undefined,
      disposed = false;
    const reset = (scene: Scene) => {
      scene.element.style.removeProperty("--scroll-filter");
      scene.element.style.removeProperty("--scroll-translate");
      scene.element.removeAttribute("data-scroll-soft");
      scene.offset = 0;
      scene.last = "";
    };
    const paint = () => {
      frame = 0;
      if (disposed) return;
      if (motion.matches) {
        scenes.forEach(reset);
        return;
      }
      const height = innerHeight;
      // Read all geometry before writing. Subtract only our independent translation,
      // so the previous frame cannot feed back into its own visibility calculation.
      const readings = Array.from(active, (scene) => {
        const rect = scene.element.getBoundingClientRect();
        return {
          scene,
          top: rect.top - scene.offset,
          bottom: rect.bottom - scene.offset,
        };
      });
      for (const { scene, top, bottom } of readings) {
        if (top >= height) scene.entry = true;
        const pinned =
          scene === pointer ||
          (scene.element.contains(document.activeElement) &&
            (!supportsFocusVisible ||
              document.activeElement?.matches(":focus-visible")));
        const entry = scene.entry ? clamp((height - top) / (height * 0.16)) : 1;
        const exit = clamp(bottom / (height * 0.18));
        const progress = pinned ? 1 : Math.min(entry, exit);
        const eased = progress * progress * (3 - 2 * progress);
        const offset = supportsTranslate
          ? (1 - eased) * (top > height / 2 ? 12 : -12)
          : 0;
        const filter =
          eased > 0.999
            ? "none"
            : `opacity(${eased.toFixed(4)}) blur(${((1 - eased) * 0.65).toFixed(3)}px)`;
        const translate = eased > 0.999 ? "none" : `0 ${offset.toFixed(3)}px`;
        const value = `${filter}|${translate}`;
        if (scene.last === value) continue;
        scene.last = value;
        scene.offset = eased > 0.999 ? 0 : Number(offset.toFixed(3));
        scene.element.style.setProperty("--scroll-filter", filter);
        scene.element.style.setProperty("--scroll-translate", translate);
        scene.element.toggleAttribute(
          "data-scroll-soft",
          progress > 0 && progress < 1,
        );
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    scenes.forEach(({ element }) =>
      element.setAttribute("data-scroll-motion", ""),
    );
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const scene = byElement.get(entry.target as HTMLElement);
          if (!scene) continue;
          if (entry.isIntersecting) active.add(scene);
          else active.delete(scene);
        }
        schedule();
      },
      { rootMargin: "180px 0px" },
    );
    scenes.forEach(({ element }) => observer.observe(element));
    const press = (event: PointerEvent) => {
      pointer = scenes.find((scene) =>
        scene.element.contains(event.target as Node),
      );
      schedule();
    };
    const release = () => {
      pointer = undefined;
      schedule();
    };
    const resize = () => {
      scenes.forEach((scene) => active.add(scene));
      schedule();
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pointerdown", press, { passive: true });
    window.addEventListener("pointerup", release, { passive: true });
    window.addEventListener("pointercancel", release, { passive: true });
    container.addEventListener("focusin", schedule);
    container.addEventListener("focusout", schedule);
    motion.addEventListener("change", resize);
    paint();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerdown", press);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      container.removeEventListener("focusin", schedule);
      container.removeEventListener("focusout", schedule);
      motion.removeEventListener("change", resize);
      scenes.forEach((scene) => {
        reset(scene);
        scene.element.removeAttribute("data-scroll-motion");
      });
    };
  }, [root]);
}
