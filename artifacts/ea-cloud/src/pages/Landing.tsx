import "../styles/PublicTypography.css";
import { useEffect, useRef } from "react";
import {
  ArrowUpRight,
  ArrowDown,
  Copy,
  ScanLine,
  Layers3,
  Users,
  SlidersHorizontal,
  MoveUpRight,
} from "lucide-react";
import HeroAppShowcase from "@/components/HeroAppShowcase";
import AppInstallation from "@/components/AppInstallation";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import "./Landing.css";
import { homepageWordmark } from "@/lib/branding";
import { usePublicScrollMotion } from "@/hooks/use-public-scroll-motion";

const features = [
  {
    icon: Copy,
    title: "Automated Copy Trading",
    desc: "Connect with mentors and follow supported trading strategies through EA Cloud’s copy-trading infrastructure.",
    tag: "CONNECTED STRATEGIES",
  },
  {
    icon: ScanLine,
    title: "AI Chart Scanner",
    desc: "Analyse trading charts and explore structured trade setups using the AI-powered chart scanner.",
    tag: "INTELLIGENT ANALYSIS",
  },
  {
    icon: Layers3,
    title: "MetaTrader 5 Integration",
    desc: "Manage supported MT5 account connections through EA Cloud.",
    tag: "SEAMLESS CONNECTIONS",
  },
  {
    icon: Users,
    title: "Mentor Management",
    desc: "Give mentors tools to manage their trading services and connected clients.",
    tag: "BUILT FOR MENTORS",
  },
  {
    icon: SlidersHorizontal,
    title: "Premium User Interfaces",
    desc: "Explore EA Cloud’s customisable trading interfaces, themes and interactive controls.",
    tag: "YOUR TRADING SPACE",
  },
];
const faqs = [
  {
    q: "Is EA Cloud a trading robot?",
    a: "No, EA Cloud is not a trading robot. It is a copy trading ecosystem and mentor platform. EA Cloud connects mentors who execute trades with clients who automatically copy those trades to their own accounts.",
  },
  {
    q: "Which brokers does EA Cloud support?",
    a: "EA Cloud currently supports Exness, Razor Markets, JustMarkets, and Profin Wealth. More brokers are being added regularly.",
  },
  {
    q: "How can I get access to a license key?",
    a: "License keys are issued by mentors. Contact a mentor on the platform to receive your license key and get started with copy trading.",
  },
  {
    q: "What is a mentor verification code?",
    a: "The mentor verification code is a unique identifier that allows stop loss, take profit, and trading tactics to sync correctly from the mentor's account to all connected client accounts.",
  },
];

export default function Landing() {
  const root = useRef<HTMLElement>(null);
  const atmosphere = useRef<HTMLDivElement>(null);
  usePublicScrollMotion(root);
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            observer.unobserve(entry.target);
          }
      },
      { threshold: 0.12 },
    );
    root.current
      ?.querySelectorAll("[data-reveal]")
      .forEach((el) => observer.observe(el));
    let frame = 0;
    const paint = () => {
      frame = 0;
      if (atmosphere.current)
        atmosphere.current.style.transform = reduced.matches
          ? "none"
          : `translate3d(0,${Math.min(scrollY * 0.13, 130)}px,0)`;
    };
    const scroll = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    window.addEventListener("scroll", scroll, { passive: true });
    reduced.addEventListener("change", paint);
    const hash = window.location.hash.slice(1);
    if (hash)
      requestAnimationFrame(() =>
        document.getElementById(hash)?.scrollIntoView(),
      );
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", scroll);
      reduced.removeEventListener("change", paint);
      cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <main ref={root} id="public-content" className="cinematic-site">
      <section
        id="home"
        className="cinematic-hero"
        aria-labelledby="hero-title"
      >
        <div className="hero-atmosphere" ref={atmosphere} aria-hidden="true">
          <div className="hero-orbit" />
          <div className="hero-grid" />
        </div>
        <HeroAppShowcase />
        <div className="hero-copy">
          <p className="public-eyebrow hero-enter">
            <span /> THE NEXT CHAPTER OF TRADING
          </p>
          <h1 id="hero-title" className="hero-enter">
            <img
              className="hero-wordmark"
              src={homepageWordmark}
              alt="EA CLOUD"
              width="1150"
              height="168"
              fetchPriority="high"
            />
          </h1>
          <h2 className="hero-enter">
            <span className="hero-headline-lead">The Future of</span>
            <span className="hero-headline-metal">Automated Trading</span>
          </h2>
          <div className="hero-description hero-enter">
            <p>
              EA Cloud connects traders with experienced mentors through{" "}
              <span className="hero-text-accent">intelligent copy trading</span>
              , AI-powered chart analysis, and seamless trading account
              management.
            </p>
            <p>
              Connect your trading account, explore{" "}
              <span className="hero-text-accent">advanced trading tools</span>,
              and experience a smarter way to trade—all in one powerful
              platform.
            </p>
          </div>
          <div className="public-cta-row hero-enter">
            <a href="/ea-app/" className="public-cta public-cta-primary">
              Get App
              <ArrowUpRight size={18} />
            </a>
            <a href="/register" className="public-cta public-cta-secondary">
              Become a Mentor
              <ArrowUpRight size={17} />
            </a>
          </div>
        </div>
        <div className="hero-baseline">
          <span>BUILT FOR A CONNECTED TRADING EXPERIENCE</span>
          <a
            href="#download"
            onClick={(event) => {
              event.preventDefault();
              document.getElementById("download")?.scrollIntoView({
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "instant"
                  : "smooth",
              });
            }}
          >
            Explore EA Cloud
            <ArrowDown size={16} />
          </a>
          <span>01 — INTRODUCTION</span>
        </div>
      </section>
      <section
        id="download"
        className="public-section public-app-section"
        aria-labelledby="app-title"
      >
        <div data-reveal>
          <p className="public-eyebrow">01 / THE PLATFORM</p>
          <h2 id="app-title">
            Your trading world.
            <br />
            <span>One connected space.</span>
          </h2>
        </div>
        <div data-reveal className="app-section-copy">
          <p>
            From mentor connections to chart analysis, bring your trading tools
            together with EA Cloud. Open the existing app on your phone or
            desktop and continue through your account-access flow.
          </p>
          <AppInstallation />
        </div>
      </section>
      <section
        id="features"
        className="public-section public-features"
        aria-labelledby="features-title"
      >
        <div data-reveal className="public-section-heading">
          <div>
            <p className="public-eyebrow">02 / THE ECOSYSTEM</p>
            <h2 id="features-title">
              Intelligent tools.
              <br />
              <span>Connected possibilities.</span>
            </h2>
          </div>
          <p>
            Built around the way you trade.
            <br />
            Designed to work together.
          </p>
        </div>
        <div className="public-feature-grid">
          {features.map((feature, index) => (
            <article
              data-reveal
              className="public-feature-card"
              key={feature.title}
            >
              <div className="feature-top">
                <feature.icon size={28} strokeWidth={1.35} />
                <span>0{index + 1}</span>
              </div>
              <span className="feature-tag">{feature.tag}</span>
              <h3>{feature.title}</h3>
              <p>{feature.desc}</p>
            </article>
          ))}
          <a
            href="/register"
            data-reveal
            className="public-feature-card feature-mentor"
          >
            <span className="feature-tag">BUILD YOUR COMMUNITY</span>
            <h3>
              Share your experience.
              <br />
              Become a mentor.
            </h3>
            <span className="feature-mentor-link">
              Explore mentor registration
              <MoveUpRight size={22} />
            </span>
          </a>
        </div>
      </section>
      <section
        id="help"
        className="public-section public-help-section"
        aria-labelledby="help-title"
      >
        <div data-reveal>
          <p className="public-eyebrow">03 / A LITTLE CLARITY</p>
          <h2 id="help-title">
            Before you
            <br />
            <span>get started.</span>
          </h2>
          <p className="help-intro">
            A few things to know about EA Cloud.
            <br />
            Find answers to the essentials.
          </p>
        </div>
        <div data-reveal>
          <Accordion type="single" collapsible className="public-faq">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={faq.q}
                value={`faq-${index}`}
                id={index === 2 ? "access-help" : undefined}
              >
                <AccordionTrigger>{faq.q}</AccordionTrigger>
                <AccordionContent>{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
      <section className="public-closing public-section" data-reveal>
        <p className="public-eyebrow">YOUR NEXT MOVE</p>
        <h2>
          A smarter trading
          <br />
          experience starts here.
        </h2>
        <div className="public-cta-row">
          <a href="/ea-app/" className="public-cta public-cta-primary">
            Get App
            <ArrowUpRight size={18} />
          </a>
          <a href="/register" className="public-cta public-cta-secondary">
            Become a Mentor
            <ArrowUpRight size={17} />
          </a>
        </div>
      </section>
    </main>
  );
}
