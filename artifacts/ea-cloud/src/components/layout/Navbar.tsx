import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { UserRound, Menu, X, ArrowUpRight, ChevronDown } from "lucide-react";
import { logo } from "@/lib/branding";
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
  const [path] = useLocation();
  const [mobile, setMobile] = useState(false);
  const [account, setAccount] = useState(false);
  const [help, setHelp] = useState(false);
  const [active, setActive] = useState("home");
  useEffect(() => {
    setMobile(false);
    setAccount(false);
  }, [path]);
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
    setMobile(false);
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
  return (
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
          <img src={logo} alt="" width="44" height="44" />
          <span>
            EA CLOUD<span className="public-brand-dot">.</span>
          </span>
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
          <DropdownMenu
            modal={false}
            open={account}
            onOpenChange={(value) => {
              setAccount(value);
              setHelp(false);
              if (value) setMobile(false);
            }}
          >
            <DropdownMenuTrigger asChild>
              <button className="public-icon-button" aria-label="Account menu">
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
              {help && (
                <div
                  id="public-help-menu"
                  role="group"
                  aria-label="Help options"
                  className="public-help-options"
                >
                  <DropdownMenuItem asChild>
                    <a href="/#help" onClick={(event) => jump(event, "help")}>
                      Frequently asked questions
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a
                      href="/#access-help"
                      onClick={(event) => jump(event, "access-help")}
                    >
                      License &amp; access help
                    </a>
                  </DropdownMenuItem>
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            className="public-icon-button public-mobile-toggle"
            aria-label={mobile ? "Close navigation" : "Open navigation"}
            aria-expanded={mobile}
            aria-controls="public-mobile-nav"
            onClick={() => {
              setMobile(!mobile);
              setAccount(false);
            }}
          >
            {mobile ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      {mobile && (
        <nav
          id="public-mobile-nav"
          className="public-mobile-nav"
          aria-label="Mobile website navigation"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setMobile(false);
              document
                .querySelector<HTMLButtonElement>(".public-mobile-toggle")
                ?.focus();
            }
          }}
        >
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
              <ArrowUpRight size={16} />
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
