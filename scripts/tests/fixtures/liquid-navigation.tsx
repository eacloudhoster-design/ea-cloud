// Browser-only fixture: renders the real navigation with counted callbacks.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import BottomNav from "@/components/BottomNav";
import { AppContext, type AppSettings, type Tab } from "@/context/AppContext";
import "@/index.css";
function Fixture() {
  const [tab, setTab] = useState<Tab>("home");
  const [count, setCount] = useState(0);
  return (
    <AppContext.Provider value={{ accentColor: "#3b82f6" } as AppSettings}>
      <div
        className="ea-app-viewport"
        style={{
          position: "relative",
          height: "100dvh",
          width: "min(100%,430px)",
          margin: "auto",
          background: "linear-gradient(35deg,#052d43,#39796b)",
        }}
      >
        <output data-count={count} data-tab={tab}>
          {count}:{tab}
        </output>
        <button id="outside">Outside</button>
        <BottomNav
          activeTab={tab}
          onTabChange={(value) => {
            setCount((n) => n + 1);
            setTab(value);
          }}
        />
      </div>
    </AppContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
