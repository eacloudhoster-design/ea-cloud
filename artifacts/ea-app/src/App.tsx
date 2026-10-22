import {useHomePreferences} from "@/hooks/use-home-preferences";
import "@/components/HomeInteractions.css";
import {useFontPreference} from "@/hooks/use-font-preference";
import {useShapePreference} from "@/hooks/use-shape-preference";
import TradingActivityMonitor from "@/components/TradingActivityMonitor";
import { useState, useEffect } from "react";
import { AppContext, AppSettings } from "@/context/AppContext";
import HomeTab from "@/pages/HomeTab";
import MetaTraderTab from "@/pages/MetaTraderTab";
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
  return <StartupSplash ready={ready}><EACloudApp onReady={setReady} /></StartupSplash>;
}

function EACloudApp({ onReady }: { onReady: (ready: boolean) => void }) {
  const [authStage, setAuthStage] = useState<AuthStage>("loading");
  const [loadError, setLoadError] = useState("");
  const [brandingReady, setBrandingReady] = useState(false);
  const [brandingAttempt, setBrandingAttempt] = useState(0);
  const [clientToken, setClientToken] = useState<string | null>(null);
  const [clientStatus, setClientStatus] = useState<"pending" | "rejected" | "approved">("pending");

  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [showChartScanner, setShowChartScanner] = useState(false);
  const [botRunning, setBotRunning] = useState(true);
  const { interfaceStyle, setInterfaceStyle, showBg, setShowBg } = useHomePreferences(clientToken);
  const [accentColor, setAccentColor] = useState("#ef4444");
  const [shapeStyle, setShapeStyle] = useShapePreference(clientToken);
  const [botFont, setBotFont] = useFontPreference(clientToken);
  const [mtConnected, setMtConnected] = useState(false);

  const [eaName, setEaName] = useState("EA Cloud Pro");
  const [eaTagline, setEaTagline] = useState("@ea_cloud");
  const [eaSymbols, setEaSymbols] = useState<string[]>(["EURUSD", "GBPUSD", "XAUUSD"]);
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);

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

  // Load persisted copy-trading on/off state so the START/STOP control reflects
  // the database (survives logout, app restart, server restart, VPS restart).
  useEffect(() => {
    if (authStage !== "app" || !clientToken) return;
    fetch("/api/app/trading-controls", { headers: { Authorization: `Bearer ${clientToken}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && typeof data.copyingEnabled === "boolean") setBotRunning(data.copyingEnabled); })
      .catch(() => {});
  }, [authStage, clientToken]);

  // START/STOP — update the UI optimistically, persist immediately, and roll back
  // if the write fails so the control can never show a state the server rejected.
  const persistBotRunning = (v: boolean) => {
    const prev = botRunning;
    setBotRunning(v);
    if (!clientToken) return;
    fetch("/api/app/trading-controls", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${clientToken}` },
      body: JSON.stringify({ copyingEnabled: v }),
    })
      .then(r => { if (!r.ok) setBotRunning(prev); })
      .catch(() => setBotRunning(prev));
  };

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
    setAuthStage("access");
  };

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

  const settings: AppSettings = {
    activeTab,
    botRunning, setBotRunning: persistBotRunning,
    interfaceStyle, setInterfaceStyle,
    accentColor, setAccentColor,
    shapeStyle, setShapeStyle,
    botFont, setBotFont,
    mtConnected, setMtConnected,
    eaName, eaTagline, eaSymbols, bgImageUrl,
    showBg, setShowBg,
    clientToken,
  };

  const backgroundSrc = bgImageUrl || robotBg;

  const initializing = authStage === "loading" || (authStage === "app" && !brandingReady && !loadError);
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
        className="relative overflow-clip bg-black"
        style={{ height: "100dvh", maxWidth: 430, margin: "0 auto" }}
      >
        {/* Fade only the full-screen image; profile images remain independent. */}
        <img
          src={backgroundSrc}
          alt=""
          data-home-background
          className="ea-home-background absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
          style={{ zIndex: 0, opacity: showBg ? 1 : 0 }}
        />

        <HomeTab swipeEnabled={!showChartScanner} onOpenChartScanner={() => setShowChartScanner(true)} />

        <div
          className="absolute inset-0 z-20 transition-transform duration-300 ease-out"
          inert={activeTab !== "metatrader"}
          style={{ transform: activeTab === "metatrader" ? "translateX(0)" : "translateX(100%)" }}
        >
          <MetaTraderTab />
        </div>

        <div
          className="absolute top-0 right-0 h-full z-30 transition-transform duration-300 ease-out"
          inert={activeTab !== "settings"}
          style={{ width: "88%", transform: activeTab === "settings" ? "translateX(0)" : "translateX(100%)" }}
        >
          <SettingsTab onOpenChartScanner={() => setShowChartScanner(true)} />
        </div>

        <TradingActivityMonitor />
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

        {showChartScanner && (
          <div className="absolute inset-0 z-50">
            <ChartScannerModal onClose={() => setShowChartScanner(false)} onNavigate={tab => { setActiveTab(tab); setShowChartScanner(false); }} />
          </div>
        )}
      </div>
    </AppContext.Provider>
  );
}
