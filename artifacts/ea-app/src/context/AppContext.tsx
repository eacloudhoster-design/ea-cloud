import type { VisualModes } from "@/hooks/use-visual-modes";
import type { BackgroundAnimation } from "@/lib/home-preferences";
import type {BotFont} from "@/lib/font-preference";
import { createContext, useContext } from "react";

export type Tab = "home" | "metatrader" | "settings";
export type InterfaceStyle = "regular" | "matrix" | "s2tone" | "lumo";
export type ShapeStyle = "orbit" | "neural" | "none";

export interface AppSettings {
  signOut?: () => Promise<void>;
  visualModes?: VisualModes;
  activeTab: Tab;
  botRunning: boolean;
  botStatusConfirmed: boolean;
  setBotRunning: (v: boolean) => void;
  interfaceStyle: InterfaceStyle;
  setInterfaceStyle: (v: InterfaceStyle) => void;
  accentColor: string;
  setAccentColor: (v: string) => void;
  botFont: BotFont;
  setBotFont: (font: BotFont) => void;
  shapeStyle: ShapeStyle;
  restoreShape?: Exclude<ShapeStyle,"none">;
  setShapeStyle: (v: ShapeStyle) => void;
  mtConnected: boolean;
  setMtConnected: (v: boolean) => void;
  eaName: string;
  eaTagline: string;
  eaSymbols: string[];
  bgImageUrl: string | null;
  backgroundAnimation: BackgroundAnimation;
  setBackgroundAnimation: (value: BackgroundAnimation) => void;
  showBg: boolean;
  setShowBg: (v: boolean) => void;
  clientToken: string | null;
}

export const AppContext = createContext<AppSettings>({
  activeTab: "home",
  botRunning: true,
  botStatusConfirmed: false,
  setBotRunning: () => {},
  interfaceStyle: "matrix",
  setInterfaceStyle: () => {},
  accentColor: "#ef4444",
  setAccentColor: () => {},
  botFont: "Inter",
  setBotFont: () => {},
  shapeStyle: "orbit",
  setShapeStyle: () => {},
  mtConnected: false,
  setMtConnected: () => {},
  eaName: "EA Cloud Pro",
  eaTagline: "@ea_cloud",
  eaSymbols: ["EURUSD", "GBPUSD", "XAUUSD"],
  bgImageUrl: null,
  backgroundAnimation: "none",
  setBackgroundAnimation: () => {},
  showBg: true,
  setShowBg: () => {},
  clientToken: null,
});

export const useApp = () => useContext(AppContext);
