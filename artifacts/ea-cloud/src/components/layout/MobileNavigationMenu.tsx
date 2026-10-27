import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight } from "lucide-react";
import "./MobileNavigationMenu.css";

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
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    const t = setTimeout(() => setPresent(false), 200);
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
      inert={!open}
      aria-hidden={!open}
    >
      <div
        className="public-navigation-scrim"
        onClick={onDismiss}
        aria-hidden="true"
      />
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
            { label: "Get App", href: "/get-app", id: undefined },
          ].map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={
                item.label === "Get App" ? "public-sheet-get-app" : undefined
              }
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
              <ArrowUpRight size={19} />
            </a>
          ))}
        </nav>
      </div>
    </div>,
    document.body,
  );
}
