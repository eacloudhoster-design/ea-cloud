import { confirmSymbolSave } from "@/lib/symbol-save";
import ModeImage from "@/components/ModeImage";
import { useInterfaceSwipe } from "@/hooks/use-interface-swipe";
import BotName from "@/components/BotName";
import "@/components/S2toneActions.css";
import InteractiveBotPortrait from "@/components/InteractiveBotPortrait";
import RobotImageFrame from "@/components/RobotImageFrame";
import { Bell, Trash2, DollarSign, Play, Pause, X, TrendingUp, Settings2, Check, Menu, BarChart2, Plus, ArrowUpRight, ArrowDownRight, Activity, ChevronDown, ChevronLeft, Loader2 } from "lucide-react";
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useApp } from "@/context/AppContext";
import { useTradeExecutions, type TradeExecution } from "@/hooks/use-trade-executions";
import { eaLogo } from "@/lib/branding";

/* Custom chip icon — no inner square */
function ChipIcon({ size = 24, color = "currentColor", style }: { size?: number; color?: string; style?: React.CSSProperties }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
      <line x1="9" y1="6" x2="9" y2="2" /><line x1="12" y1="6" x2="12" y2="2" /><line x1="15" y1="6" x2="15" y2="2" />
      <line x1="9" y1="18" x2="9" y2="22" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="15" y1="18" x2="15" y2="22" />
      <line x1="6" y1="9" x2="2" y2="9" /><line x1="6" y1="12" x2="2" y2="12" /><line x1="6" y1="15" x2="2" y2="15" />
      <line x1="18" y1="9" x2="22" y2="9" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="18" y1="15" x2="22" y2="15" />
    </svg>
  );
}

interface HomeTabProps {
  homeNavigationRequest?: number;
  swipeEnabled?: boolean;
  onOpenChartScanner?: () => void;
}

export default function HomeTab({ onOpenChartScanner, swipeEnabled = true, homeNavigationRequest = 0 }: HomeTabProps) {
  const {
    botRunning, setBotRunning, accentColor, interfaceStyle, setInterfaceStyle, activeTab, shapeStyle,
    eaName, eaTagline, eaSymbols, bgImageUrl, showBg, setShowBg, clientToken,
  } = useApp();
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [showQuotes, setShowQuotes] = useState(false);
  const [showTrades, setShowTrades] = useState(false);
  // Selecting an already-active Home tab must also dismiss Quotes/Symbols and Copied Trades.
  useLayoutEffect(() => { setShowQuotes(false); setShowTrades(false); }, [homeNavigationRequest]);
  const { executions, connected } = useTradeExecutions(clientToken);
  const hasLiveTrades = executions.length > 0;
  const swipe = useInterfaceSwipe(interfaceStyle, setInterfaceStyle,
    swipeEnabled && activeTab === "home" && !showQuotes && !showTrades && !showRemoveConfirm);

  const accentRgb = hexToRgb(accentColor);

  const sharedLayoutProps = {
    shapeStyle,
    portraitEnabled: activeTab === "home" && !showQuotes && !showTrades && !showRemoveConfirm,
    accentColor,
    botRunning,
    setBotRunning,
    eaName,
    eaTagline,
    bgImageUrl,
    showBg,
    setShowBg,
    setShowRemoveConfirm,
    setShowQuotes,
  };

  return (
    <div data-home-interface={interfaceStyle} className="absolute inset-0" style={{ background: "transparent", zIndex: 2 }}>

      {/* Accent glow — pinned, never scrolls */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 100% 55% at 50% 0%, ${accentColor}33 0%, transparent 60%)` }}
      />

      {/* ── Scrollable content ── */}
      <div
        key={interfaceStyle}
        {...swipe.handlers}
        data-home-swipe-surface
        className={`ea-home-swipe-surface absolute inset-0 overflow-y-auto ${swipe.direction ? `ea-home-swipe-${swipe.direction}` : ""}`}
        style={{ paddingBottom: 88, scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >
        {/* Regular and S2tone headers belong to the same scrolling content. */}
        {interfaceStyle !== "matrix" && (
          <div
            className="relative z-10 flex items-center justify-between px-4"
            style={{ paddingTop: "max(16px, var(--ea-content-safe-top,env(safe-area-inset-top)))", paddingBottom: 8, background: "transparent" }}
          >
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full" style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${botRunning ? "#22c55e55" : "#f59e0b55"}` }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: botRunning ? "#22c55e" : "#f59e0b" }} />
              <span className="text-[9px] font-bold tracking-wider" style={{ color: botRunning ? "#22c55e" : "#f59e0b" }}>{botRunning ? "ACTIVE" : "PAUSED"}</span>
            </div>
            <button
              onClick={() => setShowTrades(true)}
              aria-label="Notifications"
              className="relative w-9 h-9 rounded-full border border-white/20 bg-black/30 flex items-center justify-center active:bg-white/10"
            >
              <Bell size={16} className="text-white/70" />
              {hasLiveTrades && (
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ background: accentColor }}
                >
                  {executions.length > 9 ? "9+" : executions.length}
                </span>
              )}
            </button>
          </div>
        )}

        {/* ── S2TONE — rect card, bot name in accent, bottom status bar ── */}
        {interfaceStyle === "s2tone" && <S2ToneLayout {...sharedLayoutProps} />}

        {/* ── MATRIX ── */}
        {interfaceStyle === "matrix" && (
          <MatrixLayout
            shapeStyle={shapeStyle}
            portraitEnabled={activeTab === "home" && !showQuotes && !showTrades && !showRemoveConfirm}
            accentColor={accentColor}
            botRunning={botRunning}
            setBotRunning={setBotRunning}
            eaName={eaName}
            eaTagline={eaTagline}
            bgImageUrl={bgImageUrl}
            setShowQuotes={setShowQuotes}
            setShowRemoveConfirm={setShowRemoveConfirm}
            onOpenTrades={() => setShowTrades(true)}
            tradeCount={executions.length}
          />
        )}

        {/* ── REGULAR — large glowing circle ── */}
        {interfaceStyle === "regular" && <RegularLayout {...sharedLayoutProps} />}

        <div style={{ height: 80 }} />
      </div>

      {/* ── Fixed overlays ── */}
      {showQuotes && (
        <QuotesSheet accentColor={accentColor} clientToken={clientToken} onClose={() => setShowQuotes(false)} />
      )}
      {showTrades && (
        <TradesSheet accentColor={accentColor} executions={executions} connected={connected} onClose={() => setShowTrades(false)} />
      )}
      {showRemoveConfirm && (
        <RemoveConfirm accentColor={accentColor} eaName={eaName} onClose={() => setShowRemoveConfirm(false)} />
      )}

    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* S2TONE — v2: glowing sphere • large name • pill buttons + list   */
/* ══════════════════════════════════════════════════════════════════ */
function S2ToneLayout({ portraitEnabled, shapeStyle, accentColor, botRunning, setBotRunning, eaName, eaTagline, bgImageUrl, showBg, setShowBg, setShowRemoveConfirm, setShowQuotes }: any) {
  return (
    <div className="relative z-10 flex flex-col items-center px-5 pt-2 pb-6 gap-5">

      {/* Large glowing sphere */}
      <InteractiveBotPortrait enabled={portraitEnabled} size={230}>{displayShape=><RobotImageFrame shape={displayShape} accent={accentColor} size={230} borderWidth={2.5}
        className="relative flex-shrink-0 flex items-center justify-center overflow-hidden"
        style={{
          width: 230,
          height: 230,
          borderRadius: "50%",
          border: `2.5px solid ${accentColor}`,
          boxShadow: `0 0 50px ${accentColor}bb, 0 0 100px ${accentColor}55, 0 0 180px ${accentColor}22`,
          background: bgImageUrl
            ? "transparent"
            : `radial-gradient(circle at 38% 32%, ${accentColor}99 0%, ${accentColor}55 30%, rgba(50,0,0,0.98) 65%, rgba(12,0,0,1) 100%)`,
        }}
      >
        {bgImageUrl && (
          <ModeImage draggable={false} src={bgImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        {/* Inner highlight glint */}
        {!bgImageUrl && shapeStyle !== "none" && (
          <div
            className="absolute"
            style={{
              width: 80, height: 50, borderRadius: "50%",
              background: `radial-gradient(ellipse, ${accentColor}55 0%, transparent 70%)`,
              top: "18%", left: "22%",
              filter: "blur(6px)",
            }}
          />
        )}
      </RobotImageFrame>}</InteractiveBotPortrait>

      {/* Bot name — large white bold, wraps naturally */}
      <BotName primary toggleBackground
        className="text-white font-black text-center tracking-tight leading-tight"
        style={{ fontSize: 40, textShadow: "0 2px 24px rgba(0,0,0,0.9)" }}
      >
        {eaName.toUpperCase()}
      </BotName>

      {/* Powered By pill */}
      <div
        className="inline-flex items-center px-6 py-2.5 rounded-full -mt-2"
        style={{ border: `1.5px solid ${accentColor}55`, background: "rgba(0,0,0,0.55)" }}
      >
        <span className="text-white text-sm">Powered By&nbsp;</span>
        <span className="font-bold text-sm" style={{ color: accentColor }}>EA Cloud</span>
      </div>

      {/* Two-column row: pill buttons left | robots list right */}
      <div className="w-full flex gap-3 items-start">

        {/* LEFT — 3 illuminated concave controls, themed by Select Colour */}
        <div className="flex flex-col gap-3" style={{ flex: "0 0 52%", "--s2tone-accent-rgb": hexToRgb(accentColor) } as React.CSSProperties}>
          <button
            onClick={() => setShowRemoveConfirm(true)}
            type="button"
            className="s2tone-action-button flex items-center gap-3 px-5 rounded-2xl"
          >
            <X size={18} className="text-white/75 flex-shrink-0" />
            <span className="text-white font-semibold text-base">Remove</span>
          </button>

          <button
            onClick={() => setBotRunning(!botRunning)}
            type="button"
            className="s2tone-action-button flex items-center gap-3 px-5 rounded-2xl"
          >
            {botRunning
              ? <Pause size={18} className="text-white/75 flex-shrink-0" />
              : <Play size={18} className="text-white/75 flex-shrink-0" style={{ marginLeft: 1 }} />}
            <span className="text-white font-semibold text-base">{botRunning ? "Stop" : "Start"}</span>
          </button>

          <button
            onClick={() => setShowQuotes(true)}
            type="button"
            className="s2tone-action-button flex items-center gap-3 px-5 rounded-2xl"
          >
            <BarChart2 size={18} className="text-white/75 flex-shrink-0" />
            <span className="text-white font-semibold text-base">Symbols</span>
          </button>
        </div>

        {/* RIGHT — Robots List panel */}
        <div className="flex-1 flex flex-col items-start pt-1 pl-2">
          <p className="text-white/45 text-sm mb-2">Robots List:</p>
          <BotName as="p" className="text-white font-black leading-tight" style={{ fontSize: 22 }}>
            {eaName.toUpperCase()}
          </BotName>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* REGULAR — v2: large glowing circle • white bot name • 3 buttons  */
/* ══════════════════════════════════════════════════════════════════ */
function RegularLayout({ portraitEnabled, shapeStyle, accentColor, botRunning, setBotRunning, eaName, bgImageUrl, showBg, setShowBg, setShowRemoveConfirm, setShowQuotes }: any) {
  return (
    <div className="relative z-10 flex flex-col items-center px-2 mt-0">

      {/* Wide radial glow bloom behind the circle */}
      {<div
        className="portrait-bloom pointer-events-none absolute"
        style={{
          opacity:shapeStyle === "none"?0:1,
          width: 360,
          height: 360,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accentColor}55 0%, ${accentColor}22 45%, transparent 72%)`,
          top: -20,
          left: "50%",
          transform: "translateX(-50%)",
        }}
      />}

      {/* Circle — very large */}
      <InteractiveBotPortrait enabled={portraitEnabled} size={290} margin={24}>{displayShape=><RobotImageFrame shape={displayShape} accent={accentColor} size={290} borderWidth={2.5}
        className="relative flex items-center justify-center overflow-hidden"
        style={{
          width: 290,
          height: 290,
          borderRadius: "50%",
          border: `2.5px solid ${accentColor}`,
          boxShadow: `0 0 40px ${accentColor}aa, 0 0 80px ${accentColor}44`,
          background: "rgba(6,1,1,0.88)",
          zIndex: 1,
        }}
      >
        {bgImageUrl ? (
          <ModeImage draggable={false} src={bgImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <ChipIcon size={110} color={accentColor} style={{ filter: `drop-shadow(0 0 18px ${accentColor}) drop-shadow(0 0 36px ${accentColor}66)` }} />
        )}
      </RobotImageFrame>}</InteractiveBotPortrait>

      {/* Bot name — tap to toggle bg */}
      <button type="button" aria-label={showBg ? "Hide background image" : "Show background image"} aria-pressed={!showBg} onClick={() => setShowBg(!showBg)} className="active:opacity-70 transition-opacity mb-3 z-10 px-4" style={{maxWidth:"100%"}}>
        <BotName primary className="text-white font-black text-center tracking-tight" style={{ fontSize: 36, textShadow: "0 2px 20px rgba(0,0,0,0.9)" }}>
          {eaName.toUpperCase()}
        </BotName>
      </button>

      {/* Powered By pill */}
      <div
        className="inline-flex items-center px-6 py-2 rounded-full mb-10 z-10"
        style={{ border: "1px solid rgba(255,255,255,0.22)", background: "rgba(0,0,0,0.35)" }}
      >
        <span className="text-white text-sm">Powered By&nbsp;</span>
        <span className="font-semibold text-sm" style={{ color: accentColor }}>EA Cloud</span>
      </div>

      {/* Three circle buttons — wider spread */}
      <div className="z-10 w-full px-2">
        <ThreeButtons
          accentColor={accentColor}
          botRunning={botRunning}
          setBotRunning={setBotRunning}
          setShowRemoveConfirm={setShowRemoveConfirm}
          setShowQuotes={setShowQuotes}
          wideSpread
        />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* Shared: Three circle buttons (REMOVE · START/STOP · SYMBOLS)     */
/* wideSpread — pushes buttons to screen edges (Regular layout)     */
/* ══════════════════════════════════════════════════════════════════ */
function ThreeButtons({
  accentColor, botRunning, setBotRunning, setShowRemoveConfirm, setShowQuotes,
  wideSpread = false,
}: any) {
  const sideSize  = 54;
  const centreSize = 64;
  const gap = wideSpread ? "justify-between px-6" : "justify-center gap-10";

  return (
    <div className={`flex items-end w-full ${gap}`}>
      {/* REMOVE / DELETE */}
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={() => setShowRemoveConfirm(true)}
          className="rounded-full flex items-center justify-center active:scale-95 transition-transform"
          style={{ width: sideSize, height: sideSize, border: `1.5px solid ${accentColor}`, background: "transparent" }}
        >
          <X size={20} style={{ color: accentColor }} />
        </button>
        <span className="text-[11px] font-bold tracking-wider" style={{ color: accentColor }}>REMOVE</span>
      </div>

      {/* START / STOP */}
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={() => setBotRunning(!botRunning)}
          className="rounded-full flex items-center justify-center active:scale-95 transition-transform"
          style={{
            width: centreSize, height: centreSize,
            border: `2px solid ${accentColor}`,
            background: "transparent",
            boxShadow: `0 0 22px ${accentColor}55`,
          }}
        >
          {botRunning
            ? <div className="w-5 h-5 rounded-sm" style={{ background: accentColor }} />
            : <Play size={24} style={{ color: accentColor, marginLeft: 3 }} />}
        </button>
        <span className="text-[11px] font-bold tracking-wider" style={{ color: accentColor }}>
          {botRunning ? "STOP" : "START"}
        </span>
      </div>

      {/* SYMBOLS */}
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={() => setShowQuotes(true)}
          className="rounded-full flex items-center justify-center active:scale-95 transition-transform"
          style={{ width: sideSize, height: sideSize, border: `1.5px solid ${accentColor}`, background: "transparent" }}
        >
          <BarChart2 size={20} style={{ color: accentColor }} />
        </button>
        <span className="text-[11px] font-bold tracking-wider" style={{ color: accentColor }}>SYMBOLS</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* MATRIX layout                                                     */
/* ══════════════════════════════════════════════════════════════════ */
function MatrixLayout({ portraitEnabled, shapeStyle, accentColor, botRunning, setBotRunning, eaName, eaTagline, bgImageUrl, setShowQuotes, setShowRemoveConfirm, onOpenTrades, tradeCount = 0 }: any) {
  const theme = accentColor;
  const layoutRef = useRef<HTMLDivElement>(null);
  // Keep branding anchored below the name even when the portrait is hidden.
  useLayoutEffect(() => {
    const layout = layoutRef.current;
    const name = layout?.querySelector<HTMLElement>('[data-bot-name="primary"]');
    const branding = layout?.querySelector<HTMLElement>('[data-matrix-branding]');
    if (!layout || !name || !branding) return;
    const positionBranding = () => {
      // Move only the label visually; its original flow space keeps every other element fixed.
      branding.style.transform = `translateY(${name.offsetTop + name.offsetHeight + 8 - branding.offsetTop}px)`;
    };
    positionBranding();
    layout.addEventListener("ea:portrait-layout",positionBranding);
    const observer = new ResizeObserver(positionBranding);
    observer.observe(layout);
    observer.observe(name);
    observer.observe(branding);
    return () => { observer.disconnect();layout.removeEventListener("ea:portrait-layout",positionBranding); branding.style.removeProperty("transform"); };
  }, []);
  return (
    <div ref={layoutRef} className="matrix-portrait-layout relative z-10 flex flex-col items-center" style={{ minHeight: "calc(var(--ea-content-height, 100dvh) - 88px)", paddingBottom: 16 }}>
      <div className="w-full flex items-center justify-between px-4 pt-3 pb-4">
        <button className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}>
          <Menu size={16} className="text-white/60" />
        </button>
        <div className="flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: "rgba(0,0,0,0.55)", border: `1px solid ${theme}55`, backdropFilter: "blur(10px)" }}>
          <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${theme}22`, border: `1.5px solid ${theme}` }}>
            <span className="text-[11px] font-black" style={{ color: theme }}>P</span>
          </div>
          <div className="text-left">
            <BotName as="p" className="text-white font-black text-[11px] leading-none tracking-widest">{eaName.toUpperCase()}</BotName>
            <p className="text-[8px] tracking-[0.2em] mt-[2px] font-bold" style={{ color: botRunning ? "#22c55e" : "#f59e0b" }}>{botRunning ? "ACTIVE" : "PAUSED"}</p>
          </div>
        </div>
        <button
          onClick={onOpenTrades}
          className="relative w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}
        >
          <Bell size={16} className="text-white/60" />
          {tradeCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
              style={{ background: theme }}
            >
              {tradeCount > 9 ? "9+" : tradeCount}
            </span>
          )}
        </button>
      </div>

      <div className="flex gap-2 mb-5 opacity-30">
        {[...Array(5)].map((_, i) => <div key={i} className="w-1 h-1 rounded-full bg-white" style={{ opacity: i === 2 ? 0.8 : 0.4, background: i === 2 ? theme : undefined }} />)}
      </div>

      <InteractiveBotPortrait enabled={portraitEnabled} size={260} margin={24} frameInset={30}>{displayShape=><div className="relative flex items-center justify-center" style={{ width: 260, height: 260 }}>
        <div className="absolute rounded-full pointer-events-none" style={{ inset: 0, border: `1px solid ${theme}1f` }} />
        <div className="absolute rounded-full pointer-events-none" style={{ inset: 16, border: `1px solid ${theme}38` }} />
        <RobotImageFrame shape={displayShape} accent={accentColor} size={200} borderWidth={3} className="absolute rounded-full overflow-hidden flex items-center justify-center" style={{ inset: 30, background: bgImageUrl ? "transparent" : "rgba(240,245,255,0.96)", border: `3px solid color-mix(in srgb, ${theme} 25%, white 75%)`, boxShadow: `0 0 40px ${theme}55, 0 0 80px ${theme}28` }}>
          {bgImageUrl
            ? <ModeImage draggable={false} src={bgImageUrl} alt={eaName} className="w-full h-full object-cover" />
            : <span className="font-black select-none" style={{ fontSize: 58, color: "transparent", WebkitTextStroke: `3px ${theme}`, lineHeight: 1 }}>P</span>}
          {botRunning && <div className="absolute inset-0 rounded-full animate-ping" style={{ background: theme, opacity: 0.08 }} />}
        </RobotImageFrame>
      </div>}</InteractiveBotPortrait>

      <BotName primary toggleBackground className="text-white font-black text-center tracking-tight mb-1 px-4" style={{ fontSize: 34, lineHeight: 1.0, textShadow: "0 2px 20px rgba(0,0,0,0.9)" }}>
        {eaName.toUpperCase()}
      </BotName>
      {eaTagline && <p className="text-white/35 text-sm text-center mb-2 tracking-wide" style={{ visibility: "hidden" }}>{eaTagline}</p>}

      <div className="flex-1" style={{ minHeight: 32 }} />
      <div className="flex gap-2 mb-5 opacity-20">
        {[...Array(5)].map((_, i) => <div key={i} className="w-1 h-1 rounded-full bg-white" />)}
      </div>

      <div data-matrix-functions className="relative mx-4 w-[calc(100%-32px)] max-w-[340px] flex items-center justify-between px-6" style={{ height: 84, borderRadius: 9999, background: "rgba(6,6,20,0.75)", border: `1px solid ${theme}44`, backdropFilter: "blur(16px)" }}>
        <button onClick={() => setShowQuotes(true)} className="flex flex-col items-center gap-1 active:scale-95 transition-transform" style={{ minWidth: 56 }}>
          <TrendingUp size={22} className="text-white/65" />
          <span className="text-[10px] tracking-widest font-bold text-white/55">QUOTES</span>
        </button>
        <button
          onClick={() => setBotRunning(!botRunning)}
          className="absolute left-1/2 -translate-x-1/2 active:scale-95 transition-transform flex flex-col items-center justify-center gap-1"
          style={{ width: 68, height: 68, borderRadius: 18, background: botRunning ? `radial-gradient(circle at 40% 35%, ${theme}ee 0%, color-mix(in srgb, ${theme} 65%, black) 100%)` : "radial-gradient(circle at 40% 35%, #1a1a3a 0%, #0a0a1e 100%)", border: `2px solid ${botRunning ? theme : theme + "44"}`, boxShadow: botRunning ? `0 0 22px ${theme}88, 0 6px 24px rgba(0,0,0,0.7)` : `0 0 10px ${theme}22, 0 6px 24px rgba(0,0,0,0.6)` }}
        >
          {botRunning ? <div className="rounded-sm bg-white" style={{ width: 20, height: 20 }} /> : <Play size={22} className="text-white ml-0.5" />}
          <span className="text-[9px] font-black tracking-widest text-white/90">{botRunning ? "STOP" : "START"}</span>
        </button>
        <button onClick={() => setShowRemoveConfirm(true)} className="flex flex-col items-center gap-1 active:scale-95 transition-transform" style={{ minWidth: 56 }}>
          <Trash2 size={22} className="text-white/65" />
          <span className="text-[10px] tracking-widest font-bold text-white/55">REMOVE</span>
        </button>
      </div>

      <div data-matrix-branding className="mt-5 px-5 py-2.5 rounded-full" style={{ background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(8px)" }}>
        <span className="text-white/50 text-sm">Powered By&nbsp;</span>
        <span className="font-bold text-sm" style={{ color: theme }}>EA Cloud</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* QUOTES SHEET                                                      */
/* ══════════════════════════════════════════════════════════════════ */
interface PairConfig {
  pairName: string;
  variations: string[];
  selectedSymbol: string | null;
  customLotSize: string | null;
}

function QuotesSheet({ accentColor, clientToken, onClose }: { accentColor: string; clientToken: string | null; onClose: () => void }) {
  const { eaName, bgImageUrl } = useApp();
  const avatar = bgImageUrl || eaLogo;

  const [configs, setConfigs] = useState<PairConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<"selected" | "allowed">("allowed");

  // Configure-pair modal state
  const [activePair, setActivePair] = useState<PairConfig | null>(null);
  const [symbolVal, setSymbolVal] = useState("");
  const [lotVal, setLotVal] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);
  const [saved, setSaved] = useState(false);
  const [symbolOpen, setSymbolOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  const load = () => {
    if (!clientToken) { setLoading(false); return; }
    setLoading(true);
    setLoadError(false);
    fetch("/api/app/symbol-configs", { headers: { Authorization: `Bearer ${clientToken}` } })
      .then(r => { if (!r.ok) throw new Error("load failed"); return r.json(); })
      .then(data => { if (Array.isArray(data)) setConfigs(data as PairConfig[]); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };
  useEffect(load, [clientToken]);

  const allowed = configs.filter(c => !c.selectedSymbol);
  const selected = configs.filter(c => c.selectedSymbol);

  const openConfig = (cfg: PairConfig) => {
    setActivePair(cfg);
    setSymbolVal(cfg.selectedSymbol ?? "");
    setLotVal(cfg.customLotSize ?? "");
    setError("");
    setSaved(false);
    setSymbolOpen(false);
  };
  const closeConfig = () => { setActivePair(null); setSymbolOpen(false); };

  const save = async () => {
    if (!activePair || saveInFlight.current || saved) return;
    if (!symbolVal) { setError("Please select a broker symbol."); return; }
    const lot = parseFloat(lotVal);
    if (!lotVal || isNaN(lot) || lot <= 0) { setError("Lot size must be greater than 0."); return; }
    if (!clientToken) { setError("Session expired. Please reopen the app."); return; }

    saveInFlight.current = true;
    const saveId = crypto.randomUUID();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/app/symbol-configs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${clientToken}`, "X-Symbol-Save-Id": saveId },
        body: JSON.stringify({
          configs: [{ pairName: activePair.pairName, selectedSymbol: symbolVal, customLotSize: lot.toFixed(2) }],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to save. Please try again.");
        setSaving(false);
        return;
      }
      const updated = await res.json().catch(() => null);
      if (Array.isArray(updated)) setConfigs(updated as PairConfig[]);
      if (!confirmSymbolSave(updated, [{pairName: activePair.pairName, selectedSymbol: symbolVal, customLotSize: lot.toFixed(2)}], res.headers.get("X-Symbol-Save-Id") || saveId)) {
        setError("The saved symbol could not be confirmed. Reopen the symbol to check its settings.");
        return;
      }
      setSaved(true);
      // Configured pairs move to the Selected tab.
      closeTimer.current = setTimeout(() => { setActivePair(null); setSaved(false); setTab("selected"); }, 700);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };

  // Remove a mapping → returns the pair to Allowed Symbols.
  const remove = async (cfg: PairConfig) => {
    if (!clientToken) return;
    setDeleting(cfg.pairName);
    setActionError("");
    try {
      const res = await fetch("/api/app/symbol-configs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${clientToken}` },
        body: JSON.stringify({
          configs: [{ pairName: cfg.pairName, selectedSymbol: null, customLotSize: null }],
        }),
      });
      if (res.ok) {
        const updated = await res.json().catch(() => null);
        if (Array.isArray(updated)) setConfigs(updated as PairConfig[]);
      } else {
        setActionError(`Couldn't remove ${cfg.pairName}. Please try again.`);
      }
    } catch {
      setActionError(`Couldn't remove ${cfg.pairName}. Please try again.`);
    }
    setDeleting(null);
  };

  return (
    <div className="absolute inset-0 z-40 flex flex-col overflow-hidden">
      {/* Mentor bot image background + dark overlay + blur */}
      <ModeImage src={avatar} alt="" className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none" style={{ zIndex: 0 }} />
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }} />
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1, background: `radial-gradient(ellipse 90% 50% at 50% 0%, ${accentColor}33 0%, transparent 60%)` }} />

      {/* Header */}
      <div className="relative flex items-center gap-3 px-4" style={{ zIndex: 2, paddingTop: 52, paddingBottom: 12 }}>
        <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform flex-shrink-0" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.18)" }}>
          <ChevronLeft size={20} className="text-white" />
        </button>
        <ModeImage src={avatar} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" style={{ border: `1.5px solid ${accentColor}` }} />
        <h2 className="text-white font-bold text-lg truncate">{eaName}</h2>
      </div>

      {/* Tabs */}
      <div className="relative flex gap-2 px-4 pb-3" style={{ zIndex: 2 }}>
        {(["selected", "allowed"] as const).map(t => {
          const active = tab === t;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2.5 rounded-full text-[11px] font-bold tracking-wider active:scale-95 transition-transform"
              style={active
                ? { background: accentColor, color: "#fff", boxShadow: `0 4px 16px ${accentColor}55` }
                : { background: "rgba(0,0,0,0.4)", color: "rgba(255,255,255,0.6)", border: `1px solid ${accentColor}40` }}
            >
              {t === "selected" ? "SELECTED SYMBOLS" : "ALLOWED SYMBOLS"}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="relative flex-1 overflow-y-auto px-4" style={{ zIndex: 2, paddingBottom: 100, scrollbarWidth: "none" } as React.CSSProperties}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin" style={{ color: accentColor }} />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-16">
            <X size={32} className="text-red-400/40 mb-3" />
            <p className="text-white/40 text-sm">Couldn't load your symbols.</p>
            <button onClick={load} className="mt-3 px-4 py-1.5 rounded-lg text-xs font-semibold" style={{ background: `${accentColor}22`, color: accentColor, border: `1px solid ${accentColor}44` }}>
              Try again
            </button>
          </div>
        ) : configs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <TrendingUp size={32} className="text-white/15 mb-3" />
            <p className="text-white/40 text-sm text-center">No trading pairs yet.</p>
            <p className="text-white/25 text-xs text-center mt-1">Your mentor will add pairs in the EA Manager.</p>
          </div>
        ) : tab === "allowed" ? (
          allowed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Check size={30} style={{ color: accentColor }} className="mb-3" />
              <p className="text-white/40 text-sm text-center">All pairs configured.</p>
              <p className="text-white/25 text-xs text-center mt-1">See them under Selected Symbols.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4 pt-1">
              {allowed.map(cfg => (
                <button
                  key={cfg.pairName}
                  onClick={() => openConfig(cfg)}
                  className="aspect-square rounded-full flex items-center justify-center text-center px-1 active:scale-95 transition-transform"
                  style={{ background: "rgba(0,0,0,0.4)", border: `2px solid ${accentColor}66`, backdropFilter: "blur(12px)", boxShadow: `0 0 22px ${accentColor}22` }}
                >
                  <span className="text-white font-bold text-xs leading-tight break-all">{cfg.pairName}</span>
                </button>
              ))}
            </div>
          )
        ) : (
          selected.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <TrendingUp size={30} className="text-white/15 mb-3" />
              <p className="text-white/40 text-sm text-center">No symbols configured yet.</p>
              <p className="text-white/25 text-xs text-center mt-1">Tap a symbol under Allowed Symbols to map it.</p>
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              {selected.map(cfg => (
                <div
                  key={cfg.pairName}
                  className="rounded-2xl p-4 flex items-center gap-3"
                  style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${accentColor}33`, backdropFilter: "blur(12px)" }}
                >
                  <button onClick={() => openConfig(cfg)} className="flex-1 text-left min-w-0">
                    <p className="text-white font-bold text-base">{cfg.pairName}</p>
                    <p className="text-white/60 text-sm font-mono mt-0.5 truncate">→ {cfg.selectedSymbol}</p>
                    <p className="text-xs font-bold mt-1" style={{ color: accentColor }}>{cfg.customLotSize ?? "—"} Lot</p>
                  </button>
                  <button
                    onClick={() => remove(cfg)}
                    disabled={deleting === cfg.pairName}
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform disabled:opacity-50"
                    style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.4)" }}
                    aria-label={`Remove ${cfg.pairName}`}
                  >
                    {deleting === cfg.pairName
                      ? <Loader2 size={15} className="animate-spin text-red-400" />
                      : <Trash2 size={15} className="text-red-400" />}
                  </button>
                </div>
              ))}
              {actionError && (
                <p className="text-red-400 text-xs text-center pt-1">{actionError}</p>
              )}
            </div>
          )
        )}
      </div>

      {/* Configure / Edit Pair modal */}
      {activePair && (
        <div
          className="absolute inset-0 z-50 flex items-end"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={closeConfig}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full rounded-t-3xl overflow-visible"
            style={{ background: "#0a0a0a", border: `1px solid ${accentColor}44` }}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h3 className="text-white font-bold text-lg">Configure Pair</h3>
              <button onClick={closeConfig} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <X size={16} className="text-white" />
              </button>
            </div>

            {/* Extra bottom padding so the Save CTA clears the bottom nav (which stays visible). */}
            <div className="px-5 space-y-3" style={{ paddingBottom: 104 }}>
              {/* Pair name — read-only canonical master symbol */}
              <div>
                <p className="text-white/40 text-xs uppercase tracking-widest mb-1.5">Pair</p>
                <div className="px-3.5 py-2.5 rounded-xl text-white text-sm font-mono font-bold" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {activePair.pairName}
                </div>
              </div>

              {/* Broker symbol — single-select dropdown (mentor variations only) */}
              <div>
                <p className="text-white/40 text-xs uppercase tracking-widest mb-1.5">Broker Symbol</p>
                <button
                  type="button"
                  onClick={() => setSymbolOpen(o => !o)}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-mono outline-none"
                  style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${accentColor}40` }}
                >
                  <span className={symbolVal ? "text-white" : "text-white/30"}>
                    {symbolVal || "Select your broker's symbol…"}
                  </span>
                  <ChevronDown size={16} className="transition-transform" style={{ color: "rgba(255,255,255,0.4)", transform: symbolOpen ? "rotate(180deg)" : "none" }} />
                </button>
                {symbolOpen && (
                  <div className="mt-1.5 rounded-xl overflow-hidden max-h-52 overflow-y-auto" style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)" }}>
                    {activePair.variations.map(v => {
                      const isSel = symbolVal === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => { setSymbolVal(v); setSymbolOpen(false); setError(""); }}
                          className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-mono text-left active:bg-white/5 transition-colors"
                          style={isSel ? { background: `${accentColor}1f`, color: accentColor } : { color: "rgba(255,255,255,0.75)" }}
                        >
                          <span>{v}</span>
                          {isSel && <Check size={15} style={{ color: accentColor }} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Lot size */}
              <div>
                <p className="text-white/40 text-xs uppercase tracking-widest mb-1.5">Lot Size</p>
                <input
                  type="number" value={lotVal} onChange={e => setLotVal(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && save()}
                  placeholder="e.g. 0.05" min="0.01" step="0.01"
                  className="w-full px-3.5 py-2.5 rounded-xl text-white text-sm font-mono placeholder:text-white/20 outline-none"
                  style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${accentColor}40` }}
                />
                <p className="text-white/20 text-xs mt-1.5">Standard = 1.0 · Mini = 0.1 · Micro = 0.01</p>
              </div>

              {error && <p className="text-red-400 text-xs">{error}</p>}

              <button
                onClick={save}
                disabled={saving}
                className="w-full py-3 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-1.5 active:scale-95 transition-transform disabled:opacity-60"
                style={{ background: saved ? "#16a34a" : `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}cc 100%)` }}
              >
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : saved ? <><Check size={14} /> Saved!</> : <>Save</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* TRADES SHEET — live copied-trade feed                            */
/* ══════════════════════════════════════════════════════════════════ */
function statusColor(status: string): string {
  switch (status) {
    case "success": return "#16c784";
    case "failed": return "#e31e24";
    case "skipped": return "#8a8a99";
    default: return "#f0a020"; // pending
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function TradeRow({ ex, accentColor }: { ex: TradeExecution; accentColor: string }) {
  const isBuy = (ex.action ?? "").toUpperCase() === "BUY";
  const isSell = (ex.action ?? "").toUpperCase() === "SELL";
  const col = statusColor(ex.status);
  const DirIcon = isBuy ? ArrowUpRight : isSell ? ArrowDownRight : Activity;
  const dirColor = isBuy ? "#16c784" : isSell ? "#e31e24" : "#8a8a99";

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-2xl"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: `${dirColor}1f`, border: `1px solid ${dirColor}55` }}
      >
        <DirIcon size={18} style={{ color: dirColor }} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-sm">{ex.symbol}</span>
          <span className="text-white/45 text-xs">
            {(ex.action ?? ex.signalKind).toUpperCase()}
            {ex.volume ? ` · ${ex.volume}` : ""}
          </span>
        </div>
        <div className="text-white/35 text-[11px] mt-0.5 truncate">
          {ex.status === "failed" && ex.errorMessage
            ? ex.errorMessage
            : ex.ticket
              ? `Ticket #${ex.ticket}`
              : relativeTime(ex.createdAt)}
        </div>
      </div>

      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span
          className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
          style={{ background: `${col}22`, color: col, border: `1px solid ${col}55` }}
        >
          {ex.status}
        </span>
        <span className="text-white/30 text-[10px]">{relativeTime(ex.createdAt)}</span>
      </div>
    </div>
  );
}

function TradesSheet({
  accentColor, executions, connected, onClose,
}: { accentColor: string; executions: TradeExecution[]; connected: boolean; onClose: () => void }) {
  return (
    <div data-copied-trades-backdrop className="absolute inset-0 z-40 flex flex-col" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} onClick={event => {
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }}>
      <div className="mt-auto rounded-t-3xl overflow-hidden flex flex-col" style={{ background: "#0a0a0a", border: `1px solid ${accentColor}44`, maxHeight: "78%" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <h3 className="text-white font-bold text-lg">Copied Trades</h3>
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}>
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: connected ? "#16c784" : "#8a8a99", boxShadow: connected ? "0 0 6px #16c784" : "none" }}
              />
              <span className="text-[10px] font-semibold tracking-wide" style={{ color: connected ? "#16c784" : "#8a8a99" }}>
                {connected ? "LIVE" : "OFFLINE"}
              </span>
            </span>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center active:bg-white/10" style={{ border: "1px solid rgba(255,255,255,0.15)" }}>
            <X size={16} className="text-white/70" />
          </button>
        </div>

        {/* List */}
        <div className="px-4 pb-6 overflow-y-auto flex flex-col gap-2" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
          {executions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center px-6">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: `${accentColor}1a`, border: `1px solid ${accentColor}44` }}>
                <Activity size={22} style={{ color: accentColor }} />
              </div>
              <p className="text-white/70 text-sm font-medium">No trades copied yet</p>
              <p className="text-white/35 text-xs mt-1">When your mentor opens a trade, it appears here in real time.</p>
            </div>
          ) : (
            executions.map((ex) => <TradeRow key={ex.id} ex={ex} accentColor={accentColor} />)
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* REMOVE CONFIRM                                                    */
/* ══════════════════════════════════════════════════════════════════ */
function RemoveConfirm({ accentColor, eaName, onClose }: { accentColor: string; eaName: string; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center px-6" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}>
      <div className="w-full rounded-2xl overflow-hidden p-6" style={{ background: "#111", border: `1px solid ${accentColor}55` }}>
        <h3 className="text-white font-bold text-lg text-center mb-2">Remove EA?</h3>
        <p className="text-white/50 text-sm text-center mb-5">This will remove {eaName} from your account.</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-full text-white font-semibold" style={{ background: "rgba(255,255,255,0.1)" }}>Cancel</button>
          <button onClick={onClose} className="flex-1 py-3 rounded-full text-white font-bold" style={{ background: "#991b1b" }}>Remove</button>
        </div>
      </div>
    </div>
  );
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}
