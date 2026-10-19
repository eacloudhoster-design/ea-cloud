import { useState, useEffect } from "react";
import { AppContext, AppSettings, InterfaceStyle, ShapeStyle } from "@/context/AppContext";
import HomeTab from "@/pages/HomeTab";
import MetaTraderTab from "@/pages/MetaTraderTab";
import SettingsTab from "@/pages/SettingsTab";
import BottomNav from "@/components/BottomNav";
import ChartScannerModal from "@/components/ChartScannerModal";
import AccessScreen from "@/pages/AccessScreen";
import PendingScreen from "@/pages/PendingScreen";
import ActivateScreen from "@/pages/ActivateScreen";
import type { Tab } from "@/context/AppContext";
import { robotBg } from "@/lib/branding";

type AuthStage = "loading" | "access" | "pending" | "rejected" | "activate" | "app";

export default function App() {
  const [authStage, setAuthStage] = useState<AuthStage>("loading");
  const [clientToken, setClientToken] = useState<string | null>(null);
  const [clientStatus, setClientStatus] = useState<"pending" | "rejected" | "approved">("pending");

  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [showChartScanner, setShowChartScanner] = useState(false);
  const [botRunning, setBotRunning] = useState(true);
  const [interfaceStyle, setInterfaceStyle] = useState<InterfaceStyle>("matrix");
  const [showBg, setShowBg] = useState(true);
  const [accentColor, setAccentColor] = useState("#ef4444");
  const [shapeStyle, setShapeStyle] = useState<ShapeStyle>("orbit");
  const [mtConnected, setMtConnected] = useState(false);

  const [eaName, setEaName] = useState("EA Cloud Pro");
  const [eaTagline, setEaTagline] = useState("@ea_cloud");
  const [eaSymbols, setEaSymbols] = useState<string[]>(["EURUSD", "GBPUSD", "XAUUSD"]);
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);

  // On mount: validate stored token or show auth
  useEffect(() => {
    const stored = localStorage.getItem("appClientToken");
    if (!stored) { setAuthStage("access"); return; }
    validateToken(stored);
  }, []);

  // Fetch public mentor config ONLY when there is no stored token (login screen).
  // When a token exists the dashboard fetch provides the correct mentor-specific data,
  // so running this would flash a wrong mentor's image before the real one arrives.
  useEffect(() => {
    const stored = localStorage.getItem("appClientToken");
    if (stored) return; // authenticated users get config from /api/app/dashboard instead
    fetch("/api/app/mentor-config")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        if (data.robotName) setEaName(data.robotName);
        if (data.robotTagline) setEaTagline(data.robotTagline);
        if (data.symbols && data.symbols.length > 0) setEaSymbols(data.symbols);
        if (data.backgroundImageUrl) setBgImageUrl(data.backgroundImageUrl);
      })
      .catch(() => {});
  }, []);

  // Once the user is on the dashboard with a token, fetch mentor-specific config
  useEffect(() => {
    if (authStage !== "app" || !clientToken) return;
    fetch("/api/app/dashboard", { headers: { Authorization: `Bearer ${clientToken}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const mentor = data.mentor;
        const eas: { name: string; symbol: string }[] = data.eas ?? [];
        // Background image from mentor profile
        if (mentor?.backgroundImageUrl) setBgImageUrl(mentor.backgroundImageUrl);
        // EA name: prefer first active EA's name from EA Manager, fall back to mentor robot name
        const primaryName = eas[0]?.name || mentor?.robotName;
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
      })
      .catch(() => {});
  }, [authStage, clientToken]);

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
      const res = await fetch("/api/app/me", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { clearAuth(); return; }
      const client = await res.json();
      setClientToken(token);
      routeByStatus(client.status, client.licenseKey ?? null);
    } catch {
      clearAuth();
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
    botRunning, setBotRunning: persistBotRunning,
    interfaceStyle, setInterfaceStyle,
    accentColor, setAccentColor,
    shapeStyle, setShapeStyle,
    mtConnected, setMtConnected,
    eaName, eaTagline, eaSymbols, bgImageUrl,
    showBg, setShowBg,
    clientToken,
  };

  const backgroundSrc = bgImageUrl || robotBg;

  // Loading splash
  if (authStage === "loading") {
    return (
      <div className="flex items-center justify-center bg-black" style={{ height: "100dvh", maxWidth: 430, margin: "0 auto" }}>
        <div className="w-8 h-8 rounded-full border-2 border-red-500/30 border-t-red-500 animate-spin" />
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
        className="relative overflow-hidden bg-black"
        style={{ height: "100dvh", maxWidth: 430, margin: "0 auto" }}
      >
        {/* Background image — hidden when showBg is false */}
        {showBg && (
          <img
            src={backgroundSrc}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
            style={{ zIndex: 0, opacity: 1 }}
          />
        )}

        <HomeTab onOpenChartScanner={() => setShowChartScanner(true)} />

        <div
          className="absolute inset-0 z-20 transition-transform duration-300 ease-out"
          style={{ transform: activeTab === "metatrader" ? "translateX(0)" : "translateX(100%)" }}
        >
          <MetaTraderTab />
        </div>

        <div
          className="absolute top-0 right-0 h-full z-30 transition-transform duration-300 ease-out"
          style={{ width: "88%", transform: activeTab === "settings" ? "translateX(0)" : "translateX(100%)" }}
        >
          <SettingsTab onOpenChartScanner={() => setShowChartScanner(true)} />
        </div>

        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

        {showChartScanner && (
          <div className="absolute inset-0 z-50">
            <ChartScannerModal onClose={() => setShowChartScanner(false)} />
          </div>
        )}
      </div>
    </AppContext.Provider>
  );
}
