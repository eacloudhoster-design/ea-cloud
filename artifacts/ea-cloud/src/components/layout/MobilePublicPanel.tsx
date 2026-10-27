import MobileNavigationMenu from "./MobileNavigationMenu";
import { helpLinks } from "@/privacy/legal-links";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Check, ChevronDown, Globe2, X } from "lucide-react";
import { usePublicSheetDrag } from "@/hooks/use-public-sheet-drag";
import type { PublicMobilePanel } from "@/hooks/use-public-mobile-panel";
import "./MobilePublicPanel.css";

type Props = {
  kind: PublicMobilePanel | null;
  active: string;
  trigger: RefObject<HTMLButtonElement | null>;
  onDismiss: () => void;
  onSelect: (href: string, section?: string) => void;
};
export default function MobilePublicPanel({
  kind,
  active,
  trigger,
  onDismiss,
  onSelect,
}: Props) {
  const lastKind = useRef<PublicMobilePanel>("account");
  if (kind === "account") lastKind.current = kind;
  const shown = kind || lastKind.current;
  const [help, setHelp] = useState(false),
    [languages, setLanguages] = useState(false),
    [announcement, setAnnouncement] = useState("");
  const sheet = useRef<HTMLDivElement>(null),
    scroll = useRef<HTMLDivElement>(null);
  const [attached, setAttached] = useState(false);
  const attach = useCallback((node: HTMLDivElement | null) => {
    sheet.current = node;
    setAttached(Boolean(node));
  }, []);
  const drag = usePublicSheetDrag(
    sheet,
    scroll,
    kind !== null && attached,
    onDismiss,
  );
  useEffect(() => {
    if (kind) {
      setHelp(false);
      setLanguages(false);
      setAnnouncement("");
    }
  }, [kind]);
  const link =
    (href: string, section?: string) =>
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      event.preventDefault();
      onSelect(href, section);
    };
  return (
    <>
      <MobileNavigationMenu
        open={kind === "navigation"}
        active={active}
        trigger={trigger}
        onDismiss={onDismiss}
        onSelect={onSelect}
      />
      <Dialog.Root
        open={kind === "account"}
        onOpenChange={(open) => {
          if (!open) onDismiss();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="public-mobile-backdrop" />
          <Dialog.Content
            ref={attach}
            className="public-mobile-sheet"
            {...drag}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              trigger.current?.focus({ preventScroll: true });
            }}
          >
            <div className="public-sheet-top">
              <button
                type="button"
                data-sheet-handle
                className="public-sheet-handle"
                aria-label={`Drag down to close ${shown === "account" ? "account panel" : "navigation"}`}
                onClick={onDismiss}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    onDismiss();
                  }
                }}
              >
                <span />
              </button>
              <button
                type="button"
                className="public-sheet-close"
                aria-label={`Close ${shown === "account" ? "account panel" : "navigation"}`}
                onClick={onDismiss}
              >
                <X size={19} />
              </button>
              <Dialog.Title>
                {shown === "account"
                  ? "Your EA Cloud account"
                  : "Explore EA Cloud"}
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                {shown === "account"
                  ? "Account access, support and website language."
                  : "Navigate the EA Cloud public website."}{" "}
                Swipe down, tap outside or use Back to close.
              </Dialog.Description>
            </div>
            <div ref={scroll} className="public-sheet-scroll">
              <>
                <div className="public-sheet-account-links">
                  <a href="/admin/login" onClick={link("/admin/login")}>
                    Sign In
                    <ArrowUpRight size={19} />
                  </a>
                  <a href="/register" onClick={link("/register")}>
                    Sign Up
                    <ArrowUpRight size={19} />
                  </a>
                  <button
                    type="button"
                    aria-expanded={help}
                    aria-controls="mobile-public-help"
                    onClick={() => setHelp(!help)}
                  >
                    Help
                    <ChevronDown
                      size={19}
                      className={help ? "is-expanded" : ""}
                    />
                  </button>
                  <div
                    className="public-help-collapse"
                    data-open={help}
                    aria-hidden={!help}
                    inert={!help}
                  >
                    <div className="public-help-clip">
                      <div
                        id="mobile-public-help"
                        className="public-sheet-help"
                        role="group"
                        aria-label="Help options"
                      >
                        {helpLinks.map((item) => (
                          <a
                            key={item.href}
                            href={item.href}
                            onClick={link(item.href)}
                          >
                            {item.label}
                            <ArrowUpRight size={15} />
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="public-sheet-language">
                  <button
                    type="button"
                    aria-expanded={languages}
                    aria-controls="public-language-options"
                    onClick={() => setLanguages(!languages)}
                  >
                    <span>
                      <Globe2 size={19} />
                      English
                    </span>
                    <ChevronDown
                      size={19}
                      className={languages ? "is-expanded" : ""}
                    />
                  </button>
                  {languages && (
                    <div
                      id="public-language-options"
                      className="public-language-options"
                      role="group"
                      aria-label="Website languages"
                    >
                      <button
                        type="button"
                        aria-pressed="true"
                        onClick={() => {
                          setLanguages(false);
                          setAnnouncement("English selected.");
                        }}
                      >
                        <span lang="en">English</span>
                        <Check size={16} />
                      </button>
                      <button type="button" disabled>
                        <span lang="pt">Português</span>
                        <small>Not yet available</small>
                      </button>
                      <button type="button" disabled>
                        <span lang="es">Español</span>
                        <small>Not yet available</small>
                      </button>
                      <p>
                        English is currently supported. Other languages will
                        become selectable when their website translations are
                        available.
                      </p>
                    </div>
                  )}
                </div>
                <span className="sr-only" role="status">
                  {announcement}
                </span>
              </>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
