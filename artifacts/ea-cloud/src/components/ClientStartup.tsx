import { createContext, useContext, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useClientAuth } from "@/contexts/ClientAuthContext";
import StartupSplash from "../../../ea-app/src/components/StartupSplash";

const StartupReady = createContext<(ready: boolean) => void>(() => {});
export const useStartupReady = () => useContext(StartupReady);

/** Cover both supported app entries without changing routes or authentication. */
export default function ClientStartup({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const { loading } = useClientAuth();
  const [dashboardReady, setDashboardReady] = useState(false);
  const clientRoute = /^\/app(?:\/|$)/.test(path);
  return <StartupReady.Provider value={setDashboardReady}>
    {clientRoute ? <StartupSplash ready={!loading && (path !== "/app/dashboard" || dashboardReady)}>
      {children}
    </StartupSplash> : children}
  </StartupReady.Provider>;
}
