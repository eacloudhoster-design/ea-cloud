import { TrendingUp, Home, Settings } from "lucide-react";
import { Tab, useApp } from "@/context/AppContext";

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export default function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const { accentColor } = useApp();

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-40 flex items-end justify-around"
      style={{
        height: 75,
        background: "linear-gradient(to top, #000 70%, transparent)",
        paddingBottom: 12,
        paddingLeft: 8,
        paddingRight: 8,
      }}
    >
      <button
        onClick={() => onTabChange("metatrader")}
        className="flex flex-col items-center gap-1 flex-1 pb-1 transition-opacity active:opacity-60"
      >
        <TrendingUp
          size={20}
          style={{ color: activeTab === "metatrader" ? accentColor : "rgba(255,255,255,0.45)" }}
        />
        <span
          className="text-[10px] font-semibold tracking-widest uppercase"
          style={{ color: activeTab === "metatrader" ? accentColor : "rgba(255,255,255,0.45)" }}
        >
          MetaTrader
        </span>
      </button>

      <button
        onClick={() => onTabChange("home")}
        className="flex flex-col items-center relative transition-transform active:scale-95"
        style={{ marginTop: -28 }}
      >
        <div
          className="w-[62px] h-[62px] rounded-full flex flex-col items-center justify-center"
          style={{
            background: `radial-gradient(circle at center, ${accentColor}33 0%, ${accentColor}11 60%, #000 100%)`,
            boxShadow: `0 0 20px ${accentColor}bb, 0 0 40px ${accentColor}44, inset 0 0 10px ${accentColor}33`,
            border: `1.5px solid ${accentColor}cc`,
          }}
        >
          <Home size={22} style={{ color: accentColor }} />
          <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: accentColor, marginTop: 2 }}>
            Home
          </span>
        </div>
      </button>

      <button
        onClick={() => onTabChange("settings")}
        className="flex flex-col items-center gap-1 flex-1 pb-1 transition-opacity active:opacity-60"
      >
        <Settings
          size={20}
          style={{ color: activeTab === "settings" ? accentColor : "rgba(255,255,255,0.45)" }}
        />
        <span
          className="text-[10px] font-semibold tracking-widest uppercase"
          style={{ color: activeTab === "settings" ? accentColor : "rgba(255,255,255,0.45)" }}
        >
          Settings
        </span>
      </button>
    </div>
  );
}
