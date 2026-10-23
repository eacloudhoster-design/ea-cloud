import {
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { useApp } from "@/context/AppContext";
import "./MetaTraderPopup.css";

export default function MetaTraderPopup({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const { accentColor } = useApp();
  const closeButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    // The form stays mounted, but every opening must start with the full logo.
    if (open) {
      const content = panel.current?.querySelector<HTMLElement>(".mt5-content");
      if (content) content.scrollTop = 0;
    }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      // Do not steal focus from a newly opened destination (for example Settings).
      if (
        document.activeElement === closeButton.current ||
        document.activeElement === document.body
      ) {
        if (
          previous instanceof HTMLElement &&
          previous.isConnected &&
          !previous.closest("[inert]")
        )
          previous.focus({ preventScroll: true });
      }
    };
  }, [open]);

  return (
    <div
      className="mt5-popup-backdrop"
      hidden={!open}
      inert={!open}
      style={{ "--mt5-popup-accent": accentColor } as CSSProperties}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      {/* Keep MT5 mounted to retain form state; only its scroll resets on open. */}
      <section
        ref={panel}
        className="mt5-popup"
        role="dialog"
        aria-label="MetaTrader 5"
      >
        <header className="mt5-popup-header">
          <button
            ref={closeButton}
            type="button"
            aria-label="Close MetaTrader"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        <div className="mt5-popup-body">{children}</div>
      </section>
    </div>
  );
}
