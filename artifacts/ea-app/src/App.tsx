import {usePushNotifications} from "@/hooks/use-push-notifications";
import {useVoiceAnnouncements} from "@/hooks/use-voice-announcements";
import ModeImage from "@/components/ModeImage";
import { useVisualModes } from "@/hooks/use-visual-modes";
import { usePwaBackground } from "@/hooks/use-pwa-background";
import { isIosStandaloneLayout, useIosStandaloneLayout } from "@/hooks/use-ios-standalone-layout";
import { useIosStandaloneZoom } from "@/hooks/use-ios-standalone-zoom";
import { useBotStatus } from "@/hooks/use-bot-status";
import BackgroundAnimation from "@/components/BackgroundAnimation";
import {useHomePreferences} from "@/hooks/use-home-preferences";
import "@/components/HomeInteractions.css";
import {useFontPreference} from "@/hooks/use-font-preference";
import {useShapePreference} from "@/hooks/use-shape-preference";
import TradingActivityMonitor from "@/components/TradingActivityMonitor";
import { lazy, Suspense, useState, useEffect, useCallback, useRef } from "react";
import { AppContext, AppSettings } from "@/context/AppContext";
import HomeTab from "@/pages/HomeTab";
import MetaTraderTab from "@/pages/MetaTraderTab";
import MetaTraderView from "@/components/MetaTraderView";
const LiveShot = lazy(() => import("@/pages/LiveShot"));
import SettingsTab from "@/pages/SettingsTab";
import BottomNav from "@/components/BottomNav";
import ChartScannerModal from "@/components/ChartScannerModal";
import AccessScreen from "@/pages/AccessScreen";
import PendingScreen from "@/pages/PendingScreen";
import ActivateScreen from "@/pages/ActivateScreen";
import type { Tab } from "@/context/AppContext";
import { requestJson, ApiRequestError, protocolError } from "@/lib/request";
import { useStartupRequest } from "@/hooks/use-startup-request";
import StartupSplash from "@/components/StartupSplash";
import { eaLogo, robotBg } from "@/lib/branding";

type AuthStage = "loading" | "error" | "access" | "pending" | "rejected" | "activate" | "app";

export default function App() {
  useIosStandaloneZoom();
  const [ready, setReady] = useState(false);
  const [startupComplete, setStartupComplete] = useState(false);
  const finishStartup = useCallback(() => setStartupComplete(true), []);
  return <StartupSplash ready={ready} onComplete={finishStartup}><EACloudApp onReady={setReady} startupComplete={startupComplete} /></StartupSplash>;
}

function EACloudApp({ onReady, startupComplete }: { onReady: (ready: boolean) => void; startupComplete: boolean }) {
  const [authStage, setAuthStage] = useState<AuthStage>("loading");
  const [loadError, setLoadError] = useState("");
  const [brandingReady, setBrandingReady] = useState(false);


  const [clientToken, setClientToken] = useState<string | null>(null);
  const [clientStatus, setClientStatus] = useState<"pending" | "rejected" | "approved">("pending");

  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [pageBackgroundHost, setPageBackgroundHost] = useState<HTMLDivElement | null>(null);
  const fullscreenBackgroundHost = isIosStandaloneLayout({
    userAgent: navigator.userAgent, platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: (navigator as Navigator & { standalone?: boolean }).standalone === true,
    displayStandalone: window.matchMedia("(display-mode: standalone)").matches,
  }) ? pageBackgroundHost : null;
  // Android Settings uses the same full-viewport artwork layer as iOS.
  // Keep scanner and all other screens on their existing platform paths.
  const settingsBackgroundHost = fullscreenBackgroundHost ??
    (/Android/i.test(navigator.userAgent) ? pageBackgroundHost : null);
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
  const [showLiveShot, setShowLiveShot] = useState(false);
  const [showChartScanner, setShowChartScanner] = useState(false);
  const { botRunning, botStatusConfirmed, setBotRunning: persistBotRunning } = useBotStatus(clientToken, authStage === "app");
  const { controlPanel, setControlPanel, interfaceStyle, setInterfaceStyle, showBg, setShowBg, backgroundAnimation, setBackgroundAnimation, accentColor, setAccentColor } = useHomePreferences(clientToken);
  const [mentorShape, setMentorShape] = useState<import("@/context/AppContext").ShapeStyle|undefined>();
  const [botFont, setBotFont] = useFontPreference(clientToken);
  const [mtConnected, setMtConnected] = useState(false);

  const [eaName, setEaName] = useState("EA Cloud Pro");
  const [eaTagline, setEaTagline] = useState("@ea_cloud");
  const [eaSymbols, setEaSymbols] = useState<string[]>(["EURUSD", "GBPUSD", "XAUUSD"]);
  const [mentorId, setMentorId] = useState<number|null>(null);
  const [mentorImageUrl, setBgImageUrl] = useState<string | null>(null);

  const refreshBrandingAfterSession = useRef(false);
  // A cookie is still the only credential. Recovery never restores legacy bearer login.
  const session = useStartupRequest("session", "session", async signal => {
    const client = await requestJson("/api/app/me", {signal}, 30000);
    if (!client || !["pending","rejected","approved"].includes(client.status) || typeof client.token !== "string" || !client.token)
      throw protocolError("The API session response does not match this app. Please check the frontend and API deployments.");
    return client;
  }, client => {
    if (clientToken && clientToken !== client.token) {
      branding.cancel();
      setBrandingReady(false);
      setBgImageUrl(null);
      setMentorId(null);
    }
    if (refreshBrandingAfterSession.current && authStage === "app" && brandingReady && clientToken === client.token) branding.recheck();
    refreshBrandingAfterSession.current = false;
    setClientToken(client.token);
    if (authStage !== "app" || brandingReady) setLoadError("");
    routeByStatus(client.status, client.licenseKey ?? null);
  }, error => {
    if (error.status === 401) { clearAuth(); return; }
    // A recheck must not unmount a previously verified app during an outage.
    if (authStage !== "app") { setLoadError(error.message); setAuthStage("error"); }
  });

  const branding = useStartupRequest(authStage === "app" && clientToken ? clientToken : null,
    "branding", async signal => {
      const data = await requestJson("/api/app/dashboard", {signal}, 30000);
      if (data?.client?.id !== undefined && String(data.client.id) !== atob(clientToken!).split(":")[0]) throw protocolError("The account changed during startup. Retrying securely.");
      if (!data || !data.mentor) throw new ApiRequestError("Your mentor is not linked. Please contact support.","MENTOR_NOT_LINKED","authorization",false);
      if (typeof data.mentor !== "object" || (data.eas !== undefined && !Array.isArray(data.eas))) throw protocolError("The mentor configuration response is invalid. Please retry.");
      return data;
    }, data => {
      const mentor = data.mentor;
      setMentorId(Number.isSafeInteger(mentor.id) ? mentor.id : null);
      setMentorShape(["orbit","neural","none"].includes(mentor.shapeStyle) ? mentor.shapeStyle : undefined);
      setBgImageUrl(typeof mentor.backgroundImageUrl === "string" ? mentor.backgroundImageUrl : null);
      const eas = data.eas ?? [];
      const primaryName = typeof mentor.robotName === "string" ? mentor.robotName.trim() : eas[0]?.name;
      if (primaryName) setEaName(primaryName);
      if (typeof mentor.robotTagline === "string") setEaTagline(mentor.robotTagline);
      const allSymbols = [...new Set<string>(eas.flatMap((ea: {symbol?: unknown}) => typeof ea.symbol === "string" ? ea.symbol.split(",").map((value: string) => value.trim()).filter(Boolean) : []))];
      if (allSymbols.length) setEaSymbols(allSymbols);
      setBrandingReady(true);
      setLoadError("");
    }, error => {
      if (error.status === 401) { clearAuth(); return; }
      if (!brandingReady) setLoadError(error.message);
    });

  useEffect(() => {
    try { localStorage.removeItem("appClientToken"); } catch {}
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("ea-cloud-auth") : null;
    if (channel) channel.onmessage = () => session.retry();
    return () => channel?.close();
  }, [session.retry]);

  const routeByStatus = (status: string, licenseKey: string | null) => {
    if (status === "pending") { setAuthStage("pending"); setClientStatus("pending"); }
    else if (status === "rejected") { setAuthStage("rejected"); setClientStatus("rejected"); }
    else if (status === "approved" && !licenseKey) { setAuthStage("activate"); setClientStatus("approved"); }
    else if (status === "approved" && licenseKey) { setAuthStage("app"); setClientStatus("approved"); }
    else { setAuthStage("access"); }
  };

  const signOut = async () => {
    try {
      await requestJson("/api/app/logout", { method:"POST", headers:{"Content-Type":"application/json"},body:"{}" });
      try { for(const key of ["token","app_token","appClientToken"]) localStorage.removeItem(key); } catch {}
      clearAuth();
      if(typeof BroadcastChannel !== "undefined"){const c=new BroadcastChannel("ea-cloud-auth");c.postMessage("logout");c.close();}
    } catch { window.alert("Unable to sign out securely. Please retry."); }
  };
  const clearAuth = () => {
    session.cancel();
    branding.cancel();
    try { localStorage.removeItem("appClientToken"); } catch {}
    setClientToken(null);
    setBrandingReady(false);
    setBgImageUrl(null);
    setMentorId(null);
    setMentorShape(undefined);
    setAuthStage("access");
  };

  useEffect(() => {
    const restore = (event?: Event) => {
      if (document.hidden) { session.cancel(); branding.cancel(); return; }
      if (event?.type === "pageshow" && !(event as PageTransitionEvent).persisted) return;
      if (["app","loading","error"].includes(authStage)) {
        if (event && authStage === "app" && brandingReady) refreshBrandingAfterSession.current = true;
        if (event?.type === "pageshow") session.retry(); else session.recheck();
        if (authStage === "app" && !brandingReady) branding.recheck();
      }
    };
    const invalid = (event: Event) => { if ((event as CustomEvent).detail?.token === clientToken) clearAuth(); };
    const leave = () => { session.cancel(); branding.cancel(); };
    window.addEventListener("pagehide",leave);
    window.addEventListener("ea:session-invalidated",invalid);
    for (const name of ["online","focus","pageshow"]) window.addEventListener(name,restore);
    document.addEventListener("visibilitychange",restore);
    const timer = window.setInterval(() => { if (authStage === "app") restore(); },20000);
    return () => {
      window.removeEventListener("pagehide",leave);
      window.removeEventListener("ea:session-invalidated",invalid);
      for (const name of ["online","focus","pageshow"]) window.removeEventListener(name,restore);
      document.removeEventListener("visibilitychange",restore);
      window.clearInterval(timer);
    };
  },[authStage,clientToken,brandingReady,session.recheck,session.retry,session.cancel,branding.recheck,branding.cancel]);

  const handleAuthenticated = (token: string, status: string, licenseKey: string | null) => {
    session.cancel();
    branding.cancel();
    setLoadError("");
    setBrandingReady(false);
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
    controlPanel, setControlPanel,
    interfaceStyle, setInterfaceStyle,
    accentColor, setAccentColor,
    shapeStyle, setShapeStyle, restoreShape,
    botFont, setBotFont,
    mtConnected, setMtConnected,
    eaName, eaTagline, eaSymbols, bgImageUrl,
    showBg, setShowBg, backgroundAnimation, setBackgroundAnimation,
    clientToken, signOut,
  };

  const backgroundSrc = bgImageUrl || robotBg;
  // The standalone canvas sits outside the splash's stacking context. Keep it
  // black until the existing handoff finishes, then use the decoded app artwork.
  usePwaBackground(backgroundSrc, startupComplete && authStage === "app" && brandingReady && showBg);
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
            if (authStage === "app") { setLoadError(""); branding.retry(); }
            else { setLoadError(""); setAuthStage("loading"); session.retry(); }
          }}>Retry</button>
        </div> : <img src={eaLogo} alt="Preparing EA Cloud" style={{ width: "min(39.375vw, 157.5px)", height: "auto" }} />}
      </div>
    );
  }

  // Auth screens — full screen, no bottom nav
  if (authStage === "access") {
    return (
      <AccessScreen onAuthenticated={handleAuthenticated} />
    );
  }

  if (authStage === "pending" || authStage === "rejected") {
    return (
      <div className="bg-black" style={{ height: "100dvh", maxWidth: 430, margin: "0 auto" }}>
        <PendingScreen
          status={authStage === "rejected" ? "rejected" : "pending"}
          token={clientToken!}
          onApproved={handleApproved}
          onLogout={signOut}
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
          onLogout={signOut}
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

        <div ref={setPageBackgroundHost} className="ea-page-background-host absolute inset-0 pointer-events-none" style={{ zIndex: 0 }} aria-hidden="true" />

        <div className="ea-app-content relative overflow-clip" inert={showLiveShot} aria-hidden={showLiveShot || undefined} data-fullscreen-scanner={!!fullscreenBackgroundHost && showChartScanner}>
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
          <SettingsTab onOpenLiveShot={() => setShowLiveShot(true)} backgroundHost={settingsBackgroundHost} onOpenChartScanner={() => setShowChartScanner(true)} />
        </div>

        <TradingActivityMonitor />

        {showChartScanner && (
          <div className="absolute inset-0 z-50" data-scanner-layer>
            <ChartScannerModal backgroundHost={fullscreenBackgroundHost} onClose={() => setShowChartScanner(false)} onNavigate={tab => { navigate(tab); setShowChartScanner(false); }} />
          </div>
        )}
        </div>
        {showLiveShot && <Suspense fallback={<div className="absolute inset-0 z-[100] bg-black text-white p-6" role="status"><button onClick={() => setShowLiveShot(false)}>Back</button><p>Loading Live Shot…</p></div>}><LiveShot onClose={() => setShowLiveShot(false)} /></Suspense>}
        {/* The dock must not inherit the content size-container/overflow bounds. */}
        {!showChartScanner && !showLiveShot && <BottomNav activeTab={activeTab} onTabChange={navigate} backgroundImage={showBg ? backgroundSrc : undefined} />}
      </div>
    </AppContext.Provider>
  );
}
