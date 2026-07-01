import { createContext, useContext } from "react";

export type Tab = "home" | "metatrader" | "settings";
export type InterfaceStyle = "regular" | "matrix" | "s2tone";
export type ShapeStyle = "orbit" | "cornerstone" | "fortress" | "neural";

export interface AppSettings {
  botRunning: boolean;
  setBotRunning: (v: boolean) => void;
  interfaceStyle: InterfaceStyle;
  setInterfaceStyle: (v: InterfaceStyle) => void;
  accentColor: string;
  setAccentColor: (v: string) => void;
  shapeStyle: ShapeStyle;
  setShapeStyle: (v: ShapeStyle) => void;
  mtConnected: boolean;
  setMtConnected: (v: boolean) => void;
  eaName: string;
  eaTagline: string;
  eaSymbols: string[];
  bgImageUrl: string | null;
  showBg: boolean;
  setShowBg: (v: boolean) => void;
  clientToken: string | null;
}

export const AppContext = createContext<AppSettings>({
  botRunning: true,
  setBotRunning: () => {},
  interfaceStyle: "matrix",
  setInterfaceStyle: () => {},
  accentColor: "#ef4444",
  setAccentColor: () => {},
  shapeStyle: "orbit",
  setShapeStyle: () => {},
  mtConnected: false,
  setMtConnected: () => {},
  eaName: "EA Cloud Pro",
  eaTagline: "@ea_cloud",
  eaSymbols: ["EURUSD", "GBPUSD", "XAUUSD"],
  bgImageUrl: null,
  showBg: true,
  setShowBg: () => {},
  clientToken: null,
});

export const useApp = () => useContext(AppContext);
