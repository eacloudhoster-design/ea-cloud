import { TrendingUp, Home, Settings } from "lucide-react";
import { type CSSProperties } from "react";
import { Tab, useApp } from "@/context/AppContext";
import {
  navigationTabs,
  useLiquidNavigation,
} from "@/hooks/use-liquid-navigation";
import "./BottomNav.css";

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  backgroundImage?: string;
}
const icons = [TrendingUp, Home, Settings];
const labels = ["MetaTrader", "Home", "Settings"];

export default function BottomNav({
  activeTab,
  onTabChange,
  backgroundImage,
}: BottomNavProps) {
  const { accentColor } = useApp();
  const motion = useLiquidNavigation(activeTab, onTabChange);
  return (
    <nav
      className="ea-glass-navigation"
      aria-label="Main navigation"
      style={{ "--nav-accent": accentColor } as CSSProperties}
    >
      <div
        className="ea-glass-bar"
        ref={motion.bar}
        onPointerDown={motion.pointerDown}
        onPointerMove={motion.pointerMove}
        onPointerUp={motion.pointerUp}
        onPointerCancel={motion.pointerCancel}
        onLostPointerCapture={motion.pointerCancel}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div
          ref={motion.glass}
          className="ea-glass-indicator"
          aria-hidden="true"
        >
          {backgroundImage && (
            <div className="ea-glass-lens">
              <img src={backgroundImage} alt="" draggable={false} />
            </div>
          )}
          <div className="ea-glass-reflection" />
        </div>
        {navigationTabs.map((tab, index) => {
          const Icon = icons[index];
          return (
            <button
              key={tab}
              type="button"
              data-nav-index={index}
              aria-current={activeTab === tab ? "page" : undefined}
              onClick={(event) => motion.click(event, tab)}
            >
              <Icon size={index === 1 ? 22 : 20} />
              <span>{labels[index]}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
