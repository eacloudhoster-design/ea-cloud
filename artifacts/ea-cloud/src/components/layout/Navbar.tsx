import { helpLinks } from "@/privacy/legal-links";
import { useEffect, useRef, useState } from "react";
import MobilePublicPanel from "./MobilePublicPanel";
import { usePublicMobilePanel } from "@/hooks/use-public-mobile-panel";
import { useLocation } from "wouter";
import { UserRound, Menu, X, ArrowUpRight, ChevronDown } from "lucide-react";
import { navigationLogo } from "@/lib/branding";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import "./PublicNavigation.css";

const sections = [
  { label: "Home", href: "/", id: "home" },
  { label: "App", href: "/#download", id: "download" },
  { label: "Features", href: "/#features", id: "features" },
];
export function Navbar() {
  const [path, navigate] = useLocation();
  const [compact, setCompact] = useState(
    () =>
      window.matchMedia(
        "(max-width: 760px), (max-width: 960px) and (max-height: 500px) and (hover: none) and (pointer: coarse)",
      ).matches,
  );
  const mobilePanel = usePublicMobilePanel(compact);
  const mobileAccount = useRef<HTMLButtonElement>(null),
    mobileMenu = useRef<HTMLButtonElement>(null),
    panelTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const media = window.matchMedia(
      "(max-width: 760px), (max-width: 960px) and (max-height: 500px) and (hover: none) and (pointer: coarse)",
    );
    const update = () => {
      setCompact(media.matches);
      setAccount(false);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (mobilePanel.panel)
      panelTrigger.current =
        mobilePanel.panel === "account"
          ? mobileAccount.current
          : mobileMenu.current;
  }, [mobilePanel.panel]);
  const [account, setAccount] = useState(false);
  const [help, setHelp] = useState(false);
  const [active, setActive] = useState("home");
  useEffect(() => {
    mobilePanel.close();
    setAccount(false);
  }, [path, mobilePanel.close]);
  useEffect(() => {
    if (path !== "/") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) setActive(entry.target.id);
      },
      { rootMargin: "-20% 0px -55% 0px" },
    );
    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [path]);
  const jump = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    setAccount(false);
    if (
      path !== "/" ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    history.pushState(null, "", id === "home" ? "/" : `/#${id}`);
    target.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
    setActive(id);
  };
  const selectMobile = (href: string, section?: string) => {
    mobilePanel.close(() => {
      if (section && path === "/") {
        const target = document.getElementById(section);
        if (target) {
          history.pushState(
            null,
            "",
            section === "home" ? "/" : `/#${section}`,
          );
          target.scrollIntoView({
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "instant"
              : "smooth",
          });
          setActive(section);
          return;
        }
      }
      if (href === "/ea-app/" || href.startsWith("mailto:"))
        window.location.assign(href);
      else navigate(href);
    });
  };
  // Authentication pages have no mobile website chrome or portal overlays.
  if (compact && (path === "/register" || path === "/admin/login")) return null;
  return (
    <>
      <header className="public-header">
        <a className="public-skip" href="#public-content">
          Skip to content
        </a>
        <div className="public-nav-shell">
          <a
            href="/"
            className="public-brand"
            onClick={(event) => jump(event, "home")}
            aria-label="EA Cloud homepage"
          >
            <img src={navigationLogo} alt="" width="44" height="44" />
          </a>
          <nav className="public-nav-links" aria-label="Website navigation">
            {sections.map((item) => (
              <a
                key={item.id}
                href={item.href}
                onClick={(event) => jump(event, item.id)}
                aria-current={
                  path === "/" && active === item.id ? "location" : undefined
                }
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="public-nav-actions">
            <a className="public-get-app" href="/ea-app/">
              Get App
              <ArrowUpRight size={15} />
            </a>
            {compact ? (
              <button
                ref={mobileAccount}
                type="button"
                className="public-icon-button"
                aria-label="Account menu"
                aria-expanded={mobilePanel.panel === "account"}
                aria-haspopup="dialog"
                onClick={() => mobilePanel.open("account")}
              >
                <UserRound size={22} strokeWidth={1.6} />
              </button>
            ) : (
              <DropdownMenu
                modal={false}
                open={account}
                onOpenChange={(value) => {
                  setAccount(value);
                  setHelp(false);
                }}
              >
                <DropdownMenuTrigger asChild>
                  <button
                    className="public-icon-button"
                    aria-label="Account menu"
                  >
                    <UserRound size={22} strokeWidth={1.6} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="public-account-menu"
                  align="end"
                  sideOffset={16}
                  collisionPadding={12}
                >
                  <DropdownMenuItem asChild>
                    <a href="/admin/login">
                      Sign In
                      <ArrowUpRight size={15} />
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href="/register">
                      Sign Up
                      <ArrowUpRight size={15} />
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      setHelp(!help);
                    }}
                    aria-expanded={help}
                    aria-controls="public-help-menu"
                  >
                    Help
                    <ChevronDown
                      size={15}
                      style={{ transform: help ? "rotate(180deg)" : undefined }}
                    />
                  </DropdownMenuItem>
                  <div
                    className="public-help-collapse"
                    data-open={help}
                    aria-hidden={!help}
                    inert={!help}
                  >
                    <div className="public-help-clip">
                      <div
                        id="public-help-menu"
                        role="group"
                        aria-label="Help options"
                        className="public-help-options"
                      >
                        {helpLinks.map((item) => (
                          <DropdownMenuItem
                            key={item.href}
                            asChild
                            disabled={!help}
                          >
                            <a href={item.href}>{item.label}</a>
                          </DropdownMenuItem>
                        ))}
                      </div>
                    </div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <button
              ref={mobileMenu}
              type="button"
              className="public-icon-button public-mobile-toggle"
              aria-label={
                mobilePanel.panel === "navigation"
                  ? "Close navigation"
                  : "Open navigation"
              }
              aria-expanded={mobilePanel.panel === "navigation"}
              aria-controls="public-mobile-nav"
              onClick={() => {
                setAccount(false);
                mobilePanel.open("navigation");
              }}
            >
              {mobilePanel.panel === "navigation" ? (
                <X size={22} />
              ) : (
                <Menu size={22} />
              )}
            </button>
          </div>
        </div>
      </header>
      {compact && (
        <MobilePublicPanel
          kind={mobilePanel.panel}
          active={path === "/" ? active : ""}
          trigger={panelTrigger}
          onDismiss={() => mobilePanel.close()}
          onSelect={selectMobile}
        />
      )}
    </>
  );
}
