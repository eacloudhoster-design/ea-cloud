import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
} from "react";
import { useLocation } from "wouter";

export interface AppClient {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  status: "pending" | "approved" | "rejected";
  plan: string;
  licenseKey: string | null;
  mentorId: number | null;
  createdAt: string;
}

interface ClientAuthContextType {
  client: AppClient | null;
  token: string | null;
  loading: boolean;
  sessionError: boolean;
  retrySession: () => void;
  login: (token: string, client: AppClient) => void;
  logout: () => void;
  updateClient: (c: AppClient) => void;
}

const ClientAuthContext = createContext<ClientAuthContextType | null>(null);

export const APP_TOKEN_KEY = "app_token";
const BASE = "/api";

export async function appFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem(APP_TOKEN_KEY);
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    signal: options.signal || AbortSignal.timeout(15000),
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, data };
  return data;
}

export function ClientAuthProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<AppClient | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const generation = useRef(0);
  const retry = useRef<() => void>(() => {});
  const [, setLocation] = useLocation();

  useEffect(() => {
    let alive = true;
    let verifying: number | null = null;
    try {
      localStorage.removeItem(APP_TOKEN_KEY);
    } catch {}
    const check = async (event?: Event) => {
      if (
        (event?.type === "pageshow" &&
          (event as PageTransitionEvent).persisted) ||
        event?.type === "message" ||
        event?.type === "ea:auth-changed"
      ) {
        generation.current++;
        setLoading(true);
      }
      const current = generation.current;
      if (verifying === current) return;
      verifying = current;
      try {
        const c = await appFetch("/app/me");
        if (alive && current === generation.current) {
          setClient(c);
          setToken(c.token);
          setLoading(false);
          setUnavailable(false);
        }
      } catch (error) {
        if (
          alive &&
          current === generation.current &&
          [401, 403].includes((error as { status: number }).status)
        ) {
          setClient(null);
          setToken(null);
          setLoading(false);
          setUnavailable(false);
        } else if (alive && current === generation.current)
          setUnavailable(true);
      } finally {
        if (verifying === current) verifying = null;
      }
    };
    retry.current = () => void check();
    void check();
    const visible = () => {
      if (!document.hidden) void check();
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    window.addEventListener("ea:auth-changed", check);
    const timer = setInterval(() => void check(), 30000);
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("ea-cloud-auth")
        : null;
    if (channel) channel.onmessage = check;
    return () => {
      alive = false;
      clearInterval(timer);
      channel?.close();
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      window.removeEventListener("ea:auth-changed", check);
    };
  }, []);

  const login = (t: string, c: AppClient) => {
    generation.current++;
    setLoading(false);
    setUnavailable(false);

    setToken(t);
    setClient(c);
  };

  const logout = async () => {
    try {
      await appFetch("/app/logout", { method: "POST", body: "{}" });
      generation.current++;
      try {
        for (const key of ["token", "app_token", "appClientToken"])
          localStorage.removeItem(key);
      } catch {}
      setToken(null);
      setClient(null);
      if (typeof BroadcastChannel !== "undefined") {
        const c = new BroadcastChannel("ea-cloud-auth");
        c.postMessage("logout");
        c.close();
      }
      window.dispatchEvent(new Event("ea:auth-changed"));
      setLocation("/app", { replace: true });
    } catch {
      window.alert("Unable to sign out securely. Please retry.");
    }
  };

  const updateClient = (c: AppClient) => setClient(c);

  return (
    <ClientAuthContext.Provider
      value={{
        client,
        token,
        loading,
        login,
        logout,
        updateClient,
        sessionError: unavailable,
        retrySession: () => retry.current(),
      }}
    >
      {children}
    </ClientAuthContext.Provider>
  );
}

export function useClientAuth() {
  const ctx = useContext(ClientAuthContext);
  if (!ctx)
    throw new Error("useClientAuth must be used inside ClientAuthProvider");
  return ctx;
}

export function useClientRedirect() {
  const { client, loading } = useClientAuth();
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (loading) return;
    if (!client) {
      setLocation("/app", { replace: true });
      return;
    }
    if (client.status === "rejected") {
      setLocation("/app/rejected", { replace: true });
      return;
    }
    if (client.status === "pending") {
      setLocation("/app/pending", { replace: true });
      return;
    }
    if (client.status === "approved" && !client.licenseKey) {
      setLocation("/app/activate", { replace: true });
      return;
    }
  }, [client, loading, setLocation]);
}
