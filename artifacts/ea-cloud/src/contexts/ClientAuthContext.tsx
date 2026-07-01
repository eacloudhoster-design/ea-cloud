import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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
  const token = localStorage.getItem(APP_TOKEN_KEY);
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
  const [token, setToken] = useState<string | null>(localStorage.getItem(APP_TOKEN_KEY));
  const [loading, setLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    appFetch("/app/me")
      .then((c: AppClient) => { setClient(c); setLoading(false); })
      .catch(() => { localStorage.removeItem(APP_TOKEN_KEY); setToken(null); setLoading(false); });
  }, [token]);

  const login = (t: string, c: AppClient) => {
    localStorage.setItem(APP_TOKEN_KEY, t);
    setToken(t);
    setClient(c);
  };

  const logout = () => {
    localStorage.removeItem(APP_TOKEN_KEY);
    setToken(null);
    setClient(null);
    setLocation("/app");
  };

  const updateClient = (c: AppClient) => setClient(c);

  return (
    <ClientAuthContext.Provider value={{ client, token, loading, login, logout, updateClient }}>
      {children}
    </ClientAuthContext.Provider>
  );
}

export function useClientAuth() {
  const ctx = useContext(ClientAuthContext);
  if (!ctx) throw new Error("useClientAuth must be used inside ClientAuthProvider");
  return ctx;
}

export function useClientRedirect() {
  const { client, loading } = useClientAuth();
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (loading) return;
    if (!client) { setLocation("/app"); return; }
    if (client.status === "rejected") { setLocation("/app/rejected"); return; }
    if (client.status === "pending") { setLocation("/app/pending"); return; }
    if (client.status === "approved" && !client.licenseKey) { setLocation("/app/activate"); return; }
  }, [client, loading, setLocation]);
}
