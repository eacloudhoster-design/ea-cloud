import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
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
      {/* Same sheet surface, backdrop and immediate mount/unmount presentation
          as Symbols' Configure Pair popup; keep MT5 mounted to retain form state. */}
      <section
        className="mt5-popup"
        role="dialog"
        aria-label="MetaTrader 5"
        onClick={(event) => event.stopPropagation()}
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
