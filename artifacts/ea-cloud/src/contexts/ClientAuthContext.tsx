import {
  createContext,
  useContext,
  useEffect,
  useState,
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
  login: (token: string, client: AppClient) => void;
  logout: () => void;
  updateClient: (c: AppClient) => void;
}

const ClientAuthContext = createContext<ClientAuthContextType | null>(null);

export const APP_TOKEN_KEY = "app_token";
const BASE = "/api";

export async function appFetch(path: string, options: RequestInit = {}) {
  const token = null;
  const res = await fetch(`${BASE}${path}`, {
    ...options,
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
  const [attempt, setAttempt] = useState(0);
  const [, setLocation] = useLocation();

  useEffect(() => {
    let alive = true;
    setUnavailable(false);
    setLoading(true);
    appFetch("/app/me")
      .then((c: AppClient) => {
        if (alive) {
          setClient(c);
          setToken(btoa(`${c.id}:client:cookie`));
          setLoading(false);
        }
      })
      .catch((error) => {
        if (!alive) return;
        if (error.status === 401) {
          setClient(null);
          setToken(null);
          setLoading(false);
        } else {
          setUnavailable(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [attempt]);
  useEffect(() => {
    const check = () => setAttempt((n) => n + 1);
    const storage = (e: StorageEvent) => {
      if (e.key === "ea:signout") window.location.reload();
    };
    window.addEventListener("pageshow", check);
    window.addEventListener("focus", check);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("pageshow", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", storage);
    };
  }, []);
  const login = (_t: string, c: AppClient) => {
    try { localStorage.removeItem(APP_TOKEN_KEY); } catch {}
    setToken(btoa(`${c.id}:client:cookie`));
    setClient(c);
    setLoading(false);
  };
  const logout = async () => {
    try {
      const response = await fetch("/api/app/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign out failed");
      for (const key of ["token", "app_token", "appClientToken"])
        try { localStorage.removeItem(key); } catch {}
      try { localStorage.setItem("ea:signout", String(Date.now())); } catch {}
      window.location.replace("/app");
    } catch {
      setUnavailable(true);
    }
  };
  const updateClient = (c: AppClient) => setClient(c);

  if (unavailable && window.location.pathname.startsWith("/app"))
    return (
      <div
        role="status"
        className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4"
      >
        Unable to verify your session. Please retry.
        <button onClick={() => setAttempt((n) => n + 1)}>Retry</button>
      </div>
    );

  return (
    <ClientAuthContext.Provider
      value={{ client, token, loading, login, logout, updateClient }}
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
      setLocation("/app");
      return;
    }
    if (client.status === "rejected") {
      setLocation("/app/rejected");
      return;
    }
    if (client.status === "pending") {
      setLocation("/app/pending");
      return;
    }
    if (client.status === "approved" && !client.licenseKey) {
      setLocation("/app/activate");
      return;
    }
  }, [client, loading, setLocation]);
}
