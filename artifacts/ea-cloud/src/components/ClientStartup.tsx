import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useClientAuth } from "@/contexts/ClientAuthContext";
import PortalLoading from "./PortalLoading";
const ready = (_ready: boolean) => {};
const StartupReady = createContext<(ready: boolean) => void>(ready);
export const useStartupReady = () => useContext(StartupReady);

/** Route-only authorization gate. Public pages never wait for session restoration. */
export default function ClientStartup({ children }: { children: ReactNode }) {
  const [path, navigate] = useLocation();
  const { client, loading } = useClientAuth();
  const protectedRoute = /^\/app\/(dashboard|activate|pending)(?:\/|$)/.test(
    path,
  );
  const destination = !client
    ? "/app"
    : client.status === "rejected"
      ? "/app"
      : client.status === "pending"
        ? "/app/pending"
        : !client.licenseKey
          ? "/app/activate"
          : "/app/dashboard";
  const authorized =
    !loading &&
    Boolean(client) &&
    client?.status !== "rejected" &&
    destination === path;
  useEffect(() => {
    if (protectedRoute && !loading && !authorized)
      navigate(destination, { replace: true });
  }, [protectedRoute, loading, authorized, destination, navigate]);
  return (
    <StartupReady.Provider value={ready}>
      {protectedRoute && !authorized ? <PortalLoading /> : children}
    </StartupReady.Provider>
  );
}
