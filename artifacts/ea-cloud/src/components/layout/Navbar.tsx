import { helpLinks } from "@/privacy/legal-links";
import { useEffect, useRef, useState } from "react";
import MobilePublicPanel from "./MobilePublicPanel";
import { MOBILE_NAVIGATION_DURATION_MS } from "./MobileNavigationMenu";
import { usePublicMobilePanel } from "@/hooks/use-public-mobile-panel";
import { Link, useLocation } from "wouter";
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
import { useSmartPublicNavigation } from "@/hooks/use-smart-public-navigation";

const sections = [
  { label: "Home", href: "/", id: "home" },
  { label: "App", href: "/#download", id: "download" },
  { label: "Features", href: "/#features", id: "features" },
  { label: "FAQ", href: "/#help", id: "help" },
  { label: "Support", href: "/#support", id: "support" },
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
  const selectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelSelection = () => {
    if (selectionTimer.current !== null) clearTimeout(selectionTimer.current);
    selectionTimer.current = null;
  };
  useEffect(() => {
    const cancel = () => {
      if (selectionTimer.current !== null) clearTimeout(selectionTimer.current);
      selectionTimer.current = null;
    };
    window.addEventListener("popstate", cancel);
    return () => {
      cancel();
      window.removeEventListener("popstate", cancel);
    };
  }, []);
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
  // Body scroll locking can generate intersection entries unrelated to navigation.
  // Keep the current section stable while the mobile overlay is visible.
  const mobileNavigationOpen = useRef(false);
  mobileNavigationOpen.current = mobilePanel.panel === "navigation";
  const header = useRef<HTMLElement>(null);
  useSmartPublicNavigation(
    header,
    account ||
      mobilePanel.panel !== null ||
      mobilePanel.settling ||
      path === "/register" ||
      path === "/admin/login",
    `${path}:${compact}`,
  );
  useEffect(() => {
    mobilePanel.close();
    setAccount(false);
  }, [path, mobilePanel.close]);
  useEffect(() => {
    if (path !== "/" || compact) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (mobileNavigationOpen.current) return;
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
  }, [path, compact]);
  useEffect(() => {
    if (!compact || path !== "/") return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (
        mobileNavigationOpen.current ||
        document.body.style.position === "fixed"
      )
        return;
      // Choose the section crossing the reading area, rather than the last
      // IntersectionObserver entry (which can still refer to a previous section).
      const readingLine = innerHeight * 0.35;
      let current = "home";
      for (const { id } of sections) {
        const bounds = document.getElementById(id)?.getBoundingClientRect();
        if (bounds && bounds.top <= readingLine) current = id;
      }
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2)
        current = "support";
      setActive(current);
    };
    const scroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    scroll();
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", scroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("resize", scroll);
    };
  }, [path, compact]);
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
    cancelSelection();
    const animate =
      mobilePanel.panel === "navigation" &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started = performance.now();
    const navigateAfterClose = () => {
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
      else {
        if (section) setActive(section);
        navigate(href);
      }
    };
    mobilePanel.close(() => {
      if (!animate) {
        navigateAfterClose();
        return;
      }
      // Restore body/history scrolling before selecting a section; let the exit finish first.
      selectionTimer.current = setTimeout(
        () => {
          selectionTimer.current = null;
          navigateAfterClose();
        },
        Math.max(
          0,
          MOBILE_NAVIGATION_DURATION_MS - (performance.now() - started),
        ),
      );
    });
  };
  // Sign Up is header-free at every size; preserve the existing mobile Sign In rule.
  if (/^\/register\/?$/i.test(path) || (compact && path === "/admin/login"))
    return null;
  return (
    <>
      <header ref={header} className="public-header">
        <a className="public-skip" href="#public-content">
          Skip to content
        </a>
        <div className="public-nav-shell">
          <Link
            href="/"
            className="public-brand"
            onClick={(event) => {
              if (compact) cancelSelection();
              if (
                compact &&
                mobilePanel.panel &&
                event.button === 0 &&
                !event.metaKey &&
                !event.ctrlKey &&
                !event.shiftKey &&
                !event.altKey
              ) {
                event.preventDefault();
                selectMobile("/", "home");
              } else jump(event, "home");
            }}
            aria-label="EA Cloud homepage"
          >
            <img src={navigationLogo} alt="" width="44" height="44" />
          </Link>
          <nav className="public-nav-links" aria-label="Website navigation">
            {sections.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                onClick={(event) => jump(event, item.id)}
                aria-current={
                  path === "/" && active === item.id ? "location" : undefined
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="public-nav-actions">
            <Link className="public-get-app" href="/get-app">
              Get App
              <ArrowUpRight size={15} />
            </Link>
            {compact ? (
              <button
                ref={mobileAccount}
                type="button"
                className="public-icon-button"
                aria-label="Account menu"
                aria-expanded={mobilePanel.panel === "account"}
                aria-haspopup="dialog"
                onClick={() => {
                  cancelSelection();
                  mobilePanel.open("account");
                }}
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
                    <Link href="/admin/login">
                      Sign In
                      <ArrowUpRight size={15} />
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/register">
                      Sign Up
                      <ArrowUpRight size={15} />
                    </Link>
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
                cancelSelection();
                setAccount(false);
                if (mobilePanel.panel === "navigation") mobilePanel.close();
                else mobilePanel.open("navigation");
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
