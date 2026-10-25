import {usePushNotifications} from "@/hooks/use-push-notifications";
import {useVoiceAnnouncements} from "@/hooks/use-voice-announcements";
import ModeImage from "@/components/ModeImage";
import { useVisualModes } from "@/hooks/use-visual-modes";
import { usePwaBackground } from "@/hooks/use-pwa-background";
import { useIosStandaloneLayout } from "@/hooks/use-ios-standalone-layout";
import { useBotStatus } from "@/hooks/use-bot-status";
import BackgroundAnimation from "@/components/BackgroundAnimation";
import {useHomePreferences} from "@/hooks/use-home-preferences";
import "@/components/HomeInteractions.css";
import {useFontPreference} from "@/hooks/use-font-preference";
import {useShapePreference} from "@/hooks/use-shape-preference";
import TradingActivityMonitor from "@/components/TradingActivityMonitor";
import { useState, useEffect, useCallback } from "react";
import { AppContext, AppSettings } from "@/context/AppContext";
import HomeTab from "@/pages/HomeTab";
import MetaTraderTab from "@/pages/MetaTraderTab";
import MetaTraderView from "@/components/MetaTraderView";
import SettingsTab from "@/pages/SettingsTab";
import BottomNav from "@/components/BottomNav";
import ChartScannerModal from "@/components/ChartScannerModal";
import AccessScreen from "@/pages/AccessScreen";
import PendingScreen from "@/pages/PendingScreen";
import ActivateScreen from "@/pages/ActivateScreen";
import type { Tab } from "@/context/AppContext";
import { requestJson } from "@/lib/request";
import StartupSplash from "@/components/StartupSplash";
import { eaLogo, robotBg } from "@/lib/branding";

type AuthStage = "loading" | "error" | "access" | "pending" | "rejected" | "activate" | "app";

export default function App() {
  const [ready, setReady] = useState(false);
  const [startupComplete, setStartupComplete] = useState(false);
  const finishStartup = useCallback(() => setStartupComplete(true), []);
  return <StartupSplash ready={ready} onComplete={finishStartup}><EACloudApp onReady={setReady} startupComplete={startupComplete} /></StartupSplash>;
}

function EACloudApp({ onReady, startupComplete }: { onReady: (ready: boolean) => void; startupComplete: boolean }) {
  const [authStage, setAuthStage] = useState<AuthStage>("loading");
  const [loadError, setLoadError] = useState("");
  const [brandingReady, setBrandingReady] = useState(false);
  const [brandingAttempt, setBrandingAttempt] = useState(0);
  const [clientToken, setClientToken] = useState<string | null>(null);
  const [clientStatus, setClientStatus] = useState<"pending" | "rejected" | "approved">("pending");

  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [mt5BackgroundHost, setMt5BackgroundHost] = useState<HTMLDivElement | null>(null);
  const [mt5Present, setMt5Present] = useState(false);
  useEffect(() => {
    if (activeTab === "metatrader") { setMt5Present(true); return; }
    const timer = window.setTimeout(() => setMt5Present(false), 240);
    return () => window.clearTimeout(timer);
  }, [activeTab]);
  const [homeNavigationRequest, setHomeNavigationRequest] = useState(0);
  const navigate = (tab: Tab) => {
    if (tab === "home") setHomeNavigationRequest(value => value + 1);
    setActiveTab(tab);
  };
  const [settingsClosing, setSettingsClosing] = useState(false);
  const dismissSettings = () => {
    setSettingsClosing(true);
    setActiveTab("home");
  };
  useEffect(() => {
    if (!settingsClosing) return;
    const timer = window.setTimeout(() => setSettingsClosing(false), 300);
    return () => window.clearTimeout(timer);
  }, [settingsClosing]);
  const [showChartScanner, setShowChartScanner] = useState(false);
  const { botRunning, botStatusConfirmed, setBotRunning: persistBotRunning } = useBotStatus(clientToken, authStage === "app");
  const { interfaceStyle, setInterfaceStyle, showBg, setShowBg, backgroundAnimation, setBackgroundAnimation, accentColor, setAccentColor } = useHomePreferences(clientToken);
  const [mentorShape, setMentorShape] = useState<import("@/context/AppContext").ShapeStyle|undefined>();
  const [botFont, setBotFont] = useFontPreference(clientToken);
  const [mtConnected, setMtConnected] = useState(false);

  const [eaName, setEaName] = useState("EA Cloud Pro");
  const [eaTagline, setEaTagline] = useState("@ea_cloud");
  const [eaSymbols, setEaSymbols] = useState<string[]>(["EURUSD", "GBPUSD", "XAUUSD"]);
  const [mentorId, setMentorId] = useState<number|null>(null);
  const [mentorImageUrl, setBgImageUrl] = useState<string | null>(null);

  // On mount: validate stored token or show auth
  useEffect(() => {
    let stored;
    try { stored = localStorage.getItem("appClientToken"); }
    catch { setLoadError("Browser storage is unavailable. Enable site storage and retry."); setAuthStage("error"); return; }
    if (!stored) { setAuthStage("access"); return; }
    validateToken(stored);
  }, []);

  // Once the user is on the dashboard with a token, fetch mentor-specific config
  useEffect(() => {
    if (authStage !== "app" || !clientToken) return;
    let cancelled = false;
    setBrandingReady(false);
    setLoadError("");
    requestJson("/api/app/dashboard", { headers: { Authorization: `Bearer ${clientToken}` } })
      .then(data => {
        if (cancelled) return;
        if (!data.mentor) throw new Error("Your mentor is not linked. Please contact support.");
        const mentor = data.mentor;
        setMentorId(Number.isSafeInteger(mentor.id) ? mentor.id : null);
        setMentorShape(["orbit","neural","none"].includes(mentor.shapeStyle) ? mentor.shapeStyle : undefined);
        const eas: { name: string; symbol: string }[] = data.eas ?? [];
        // Background image from mentor profile
        setBgImageUrl(mentor?.backgroundImageUrl || null);
        // The mentor profile is the source of truth for client branding.
        const primaryName = mentor?.robotName?.trim() || eas[0]?.name;
        if (primaryName) setEaName(primaryName);
        if (mentor?.robotTagline) setEaTagline(mentor.robotTagline);
        // Symbols: all unique symbols across active EAs
        if (eas.length > 0) {
          const allSymbols = [...new Set(
            eas.flatMap((ea) =>
              ea.symbol.split(",").map((s: string) => s.trim()).filter(Boolean)
            )
          )];
          if (allSymbols.length > 0) setEaSymbols(allSymbols);
        }
        setBrandingReady(true);
      })
      .catch((err) => { if (!cancelled) setLoadError(err.message || "Unable to load your mentor. Please retry."); });
    return () => { cancelled = true; };
  }, [authStage, clientToken, brandingAttempt]);

  const validateToken = async (token: string) => {
    try {
      setAuthStage("loading");
      setLoadError("");
      const client = await requestJson("/api/app/me", { headers: { Authorization: `Bearer ${token}` } });
      setClientToken(token);
      routeByStatus(client.status, client.licenseKey ?? null);
    } catch (err) {
      if ((err as { status?: number }).status === 401) { clearAuth(); return; }
      setLoadError((err as Error).message || "Unable to connect. Please retry.");
      setAuthStage("error");
    }
  };

  const routeByStatus = (status: string, licenseKey: string | null) => {
    if (status === "pending") { setAuthStage("pending"); setClientStatus("pending"); }
    else if (status === "rejected") { setAuthStage("rejected"); setClientStatus("rejected"); }
    else if (status === "approved" && !licenseKey) { setAuthStage("activate"); setClientStatus("approved"); }
    else if (status === "approved" && licenseKey) { setAuthStage("app"); setClientStatus("approved"); }
    else { setAuthStage("access"); }
  };

  const clearAuth = () => {
    localStorage.removeItem("appClientToken");
    setClientToken(null);
    setBrandingReady(false);
    setBgImageUrl(null);
    setMentorId(null);
    setMentorShape(undefined);
    setAuthStage("access");
  };

  useEffect(() => {
    if (authStage !== "app" || !clientToken) return;
    let alive = true, busy = false;
    const invalid = (event: Event) => {
      if ((event as CustomEvent).detail?.token === clientToken && alive) clearAuth();
    };
    const check = async () => {
      if (!alive || busy || document.hidden) return;
      busy = true;
      try { const client = await requestJson("/api/app/me", { headers: { Authorization: `Bearer ${clientToken}` } }); if (alive && (client.status !== "approved" || !client.licenseKey)) clearAuth(); }
      catch (error) { if (alive && (error as {status?: number}).status === 401) clearAuth(); }
      finally { busy = false; }
    };
    window.addEventListener("ea:session-invalidated", invalid);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, 20000);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("ea:session-invalidated", invalid); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, [authStage, clientToken]);

  const handleAuthenticated = (token: string, status: string, licenseKey: string | null) => {
    setClientToken(token);
    routeByStatus(status, licenseKey);
  };

  const handleApproved = (licenseKey: string | null) => {
    routeByStatus("approved", licenseKey);
  };

  const handleActivated = () => {
    setAuthStage("app");
  };

  const visualModes = useVisualModes(clientToken,authStage === "app" && brandingReady,mentorImageUrl,mentorId);
  const bgImageUrl = visualModes.displayImage;
  const [shapeStyle,setShapeStyle,restoreShape] = useShapePreference(clientToken,{bot:`mentor:${mentorId}:ea:${visualModes.ea?.id ?? "default"}`,interfaceStyle},mentorShape);
  useEffect(()=>{
    if(authStage!=="app"||!clientToken)return;
    const open=(tab:string)=>{if(tab!=="home"&&tab!=="metatrader")return;setShowChartScanner(false);setSettingsClosing(false);setActiveTab(tab);requestAnimationFrame(()=>window.dispatchEvent(new Event("ea:open-trading-activity")));};
    const message=(event:Event)=>{const data=(event as CustomEvent).detail;if(data?.activity===true)open(data.tab);};
    window.addEventListener("ea:push-navigate",message);
    const url=new URL(location.href);if(url.searchParams.get("activity")==="1"){
      open(url.searchParams.get("tab")||"home");url.searchParams.delete("activity");url.searchParams.delete("tab");history.replaceState(history.state,"",url);
    }
    return()=>window.removeEventListener("ea:push-navigate",message);
  },[authStage,clientToken]);
  usePushNotifications(clientToken,authStage === "app");
  useVoiceAnnouncements(clientToken,authStage === "app" && brandingReady && startupComplete,eaName,visualModes,authStage === "app" && brandingReady);

  const settings: AppSettings = {
    visualModes,
    activeTab,
    botRunning, botStatusConfirmed, setBotRunning: persistBotRunning,
    interfaceStyle, setInterfaceStyle,
    accentColor, setAccentColor,
    shapeStyle, setShapeStyle, restoreShape,
    botFont, setBotFont,
    mtConnected, setMtConnected,
    eaName, eaTagline, eaSymbols, bgImageUrl,
    showBg, setShowBg, backgroundAnimation, setBackgroundAnimation,
    clientToken,
  };

  const backgroundSrc = bgImageUrl || robotBg;
  usePwaBackground(backgroundSrc, authStage === "app" && brandingReady && showBg);
  useIosStandaloneLayout(authStage === "app" && brandingReady);

  const initializing = authStage === "loading" || (authStage === "app" && !loadError && (!brandingReady || visualModes.loading));
  useEffect(() => { onReady(!initializing); }, [initializing, onReady]);

  // Keep the existing retry flow; slow initialization holds the logo without replay.
  // Loading splash
  if (authStage === "loading" || authStage === "error" || (authStage === "app" && !brandingReady)) {
    return (
      <div className="flex items-center justify-center bg-black" style={{ height: "100dvh", maxWidth: 430, margin: "0 auto" }}>
        {loadError ? <div className="text-white text-center p-6" role="alert">
          <p>{loadError}</p>
          <button className="mt-4 rounded-xl bg-red-500 px-5 py-3" onClick={() => {
            if (authStage === "app") setBrandingAttempt(v => v + 1);
            else { try { const token = localStorage.getItem("appClientToken"); if (token) void validateToken(token); else setAuthStage("access"); } catch { window.location.reload(); } }
          }}>Retry</button>
        </div> : <img src={eaLogo} alt="Preparing EA Cloud" style={{ width: "min(39.375vw, 157.5px)", height: "auto" }} />}
      </div>
    );
  }

  // Auth screens — full screen, no bottom nav
  if (authStage === "access") {
    return (
      <div className="bg-black" style={{ height: "100dvh", maxWidth: 430, margin: "0 auto" }}>
        <AccessScreen onAuthenticated={handleAuthenticated} />
      </div>
    );
  }

  if (authStage === "pending" || authStage === "rejected") {
    return (
      <div className="bg-black" style={{ height: "100dvh", maxWidth: 430, margin: "0 auto" }}>
        <PendingScreen
          status={authStage === "rejected" ? "rejected" : "pending"}
          token={clientToken!}
          onApproved={handleApproved}
          onLogout={clearAuth}
        />
      </div>
    );
  }

  if (authStage === "activate") {
    return (
      <div className="bg-black" style={{ height: "100dvh", maxWidth: 430, margin: "0 auto" }}>
        <ActivateScreen
          token={clientToken!}
          onActivated={handleActivated}
          onLogout={clearAuth}
        />
      </div>
    );
  }

  // Main app dashboard
  return (
    <AppContext.Provider value={settings}>
      <div
        className="ea-app-viewport relative overflow-clip bg-black"
      >
        {/* Fade only the full-screen image; profile images remain independent. */}
        <ModeImage
          src={backgroundSrc}
          alt=""
          data-home-background
          className="ea-home-background pointer-events-none"
          style={{ zIndex: 0, opacity: showBg ? 1 : 0 }}
        />

        <div ref={setMt5BackgroundHost} data-mt5-background-host
          className="mt5-background-transition absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}
          data-active={activeTab === "metatrader"}
          hidden={activeTab !== "metatrader" && !mt5Present} aria-hidden="true" />

        <div className="ea-app-content relative overflow-clip">
        <BackgroundAnimation effect={backgroundAnimation} color={accentColor} active={activeTab === "home"} />

        <div data-home-screen className="ea-nav-screen absolute inset-0 z-[2]" style={{ opacity: activeTab === "home" ? 1 : 0 }} inert={activeTab !== "home" || settingsClosing}>
          <HomeTab onOpenSettings={() => navigate("settings")} homeNavigationRequest={homeNavigationRequest} swipeEnabled={!showChartScanner} onOpenChartScanner={() => setShowChartScanner(true)} />
        </div>

        {!showChartScanner && (activeTab === "settings" || settingsClosing) && (
          <button
            type="button"
            aria-label="Close Settings"
            className="absolute top-0 left-0 z-[95] border-0 bg-transparent p-0"
            style={{ width: "12%", bottom: "calc(var(--ea-nav-height, 66px) + var(--ea-nav-bottom, 4px))", touchAction: "none" }}
            onClick={event => { event.preventDefault(); event.stopPropagation(); dismissSettings(); }}
          />
        )}

        <MetaTraderView active={activeTab === "metatrader"} present={mt5Present}>
          <MetaTraderTab backgroundHost={mt5BackgroundHost} backgroundImage={backgroundSrc} />
        </MetaTraderView>

        <div
          className="ea-nav-screen absolute top-0 right-0 h-full z-30"
          inert={activeTab !== "settings"}
          style={{ width: "88%", opacity: activeTab === "settings" ? 1 : 0, pointerEvents: activeTab === "settings" ? "auto" : "none" }}
        >
          <SettingsTab onOpenChartScanner={() => setShowChartScanner(true)} />
        </div>

        <TradingActivityMonitor />

        {showChartScanner && (
          <div className="absolute inset-0 z-50">
            <ChartScannerModal onClose={() => setShowChartScanner(false)} onNavigate={tab => { navigate(tab); setShowChartScanner(false); }} />
          </div>
        )}
        </div>
        {/* The dock must not inherit the content size-container/overflow bounds. */}
        {!showChartScanner && <BottomNav activeTab={activeTab} onTabChange={navigate} backgroundImage={showBg ? backgroundSrc : undefined} />}
      </div>
    </AppContext.Provider>
  );
}
