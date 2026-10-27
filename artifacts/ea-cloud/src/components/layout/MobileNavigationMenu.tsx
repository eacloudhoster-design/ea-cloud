import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import "./MobileNavigationMenu.css";

export const MOBILE_NAVIGATION_DURATION_MS = 300;

type Props = {
  open: boolean;
  active: string;
  trigger: RefObject<HTMLButtonElement | null>;
  onDismiss: () => void;
  onSelect: (href: string, section?: string) => void;
};
/** Non-modal navigation keeps the real header buttons reachable, including on Safari. */
export default function MobileNavigationMenu({
  open,
  active,
  trigger,
  onDismiss,
  onSelect,
}: Props) {
  const [present, setPresent] = useState(open);
  const panel = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(73);
  useLayoutEffect(() => {
    if (!open && !present) return;
    const header = document.querySelector<HTMLElement>(".public-header");
    if (!header) return;
    const measure = () => setHeaderHeight(header.offsetHeight);
    measure();
    header.dataset.mobileNavigationOpen = "true";
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => {
      observer.disconnect();
      delete header.dataset.mobileNavigationOpen;
    };
  }, [open, present]);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    const duration = matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : MOBILE_NAVIGATION_DURATION_MS;
    const t = setTimeout(() => setPresent(false), duration);
    return () => clearTimeout(t);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const body = document.body,
      html = document.documentElement,
      y = scrollY;
    const original = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: html.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${y}px`;
    body.style.width = "100%";
    html.style.overflow = "hidden";
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss.current();
      }
      if (event.key === "Tab") {
        const items = [
          ...document.querySelectorAll<HTMLElement>(
            ".public-header a,.public-header button,.public-navigation-popover a",
          ),
        ].filter((n) => n.getClientRects().length > 0);
        const index = items.indexOf(document.activeElement as HTMLElement),
          next = event.shiftKey
            ? index <= 0
              ? items.length - 1
              : index - 1
            : (index + 1) % items.length;
        event.preventDefault();
        items[next]?.focus();
      }
    };
    const outsideHeader = (event: MouseEvent) => {
      const target = event.target as Element;
      if (target.closest(".public-header") && !target.closest("a,button"))
        dismiss.current();
    };
    document.addEventListener("click", outsideHeader);
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("click", outsideHeader);
      document.removeEventListener("keydown", keyboard);
      Object.assign(body.style, {
        position: original.position,
        top: original.top,
        width: original.width,
      });
      html.style.overflow = original.overflow;
      window.scrollTo({ top: y, behavior: "instant" });
      trigger.current?.focus({ preventScroll: true });
    };
  }, [open, trigger]);
  useEffect(() => {
    if (open && present)
      panel.current?.querySelector("a")?.focus({ preventScroll: true });
  }, [open, present]);
  if (!open && !present) return null;
  return createPortal(
    <div
      className="public-navigation-layer"
      data-open={open}
      style={
        {
          "--public-menu-duration": `${MOBILE_NAVIGATION_DURATION_MS}ms`,
          "--public-navigation-top": `${headerHeight}px`,
        } as CSSProperties
      }
      inert={!open}
      aria-hidden={!open}
    >
      <div
        ref={panel}
        className="public-navigation-popover"
        role="dialog"
        aria-modal="false"
        aria-labelledby="public-navigation-title"
      >
        <h2 id="public-navigation-title">Explore EA Cloud</h2>
        <nav
          id="public-mobile-nav"
          aria-label="Mobile website navigation"
          className="public-sheet-navigation"
        >
          {[
            { label: "Home", href: "/", id: "home" },
            { label: "App", href: "/#download", id: "download" },
            { label: "Features", href: "/#features", id: "features" },
            { label: "FAQ", href: "/#help", id: "help" },
            { label: "Support", href: "/#support", id: "support" },
          ].map((item, index) => (
            <a
              key={item.label}
              style={{ "--navigation-index": index } as CSSProperties}
              href={item.href}
              aria-current={active === item.id ? "location" : undefined}
              onClick={(event) => {
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                onSelect(item.href, item.id);
              }}
            >
              {item.label}
              <svg
                width="22"
                height="18"
                viewBox="0 0 22 18"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M2 9h16M12 3l6 6-6 6M20 6v6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="square"
                  strokeLinejoin="miter"
                />
              </svg>
            </a>
          ))}
        </nav>
      </div>
    </div>,
    document.body,
  );
}
