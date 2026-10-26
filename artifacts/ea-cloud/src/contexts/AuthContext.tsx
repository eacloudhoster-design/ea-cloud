import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
  useRef,
} from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@workspace/api-client-react";
interface AuthContextType {
  user: User | null;
  /** Non-secret compatibility hint; authentication is exclusively an HttpOnly cookie. */
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => Promise<void>;
  isLoading: boolean;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const generation = useRef(0);
  const identity = useRef<string | null>(null);
  const verify = useCallback(async () => {
    const current = generation.current;
    try {
      const res = await fetch("/api/auth/me", {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (current !== generation.current) return;
      if (res.status === 401 || res.status === 403) {
        identity.current = null;
        setUser(null);
        setToken(null);
        queryClient.clear();
      } else if (!res.ok) throw Error("Session unavailable");
      else {
        const account = await res.json();
        if (current !== generation.current) return;
        const nextIdentity = `${account.id}:${account.role}:${account.status}`;
        if (identity.current && identity.current !== nextIdentity)
          queryClient.clear();
        identity.current = nextIdentity;
        setUser(account);
        setToken("cookie");
      }
      setUnavailable(false);
      setLoading(false);
    } catch {
      if (current !== generation.current) return;
      setUnavailable(true); /* Keep verified state during transient outages. */
    }
  }, [queryClient]);
  useEffect(() => {
    // Legacy Base64 strings are not migrated into credentials. One fresh sign-in is required.
    try {
      localStorage.removeItem("token");
    } catch {}
    void verify();
    const focus = (event?: Event) => {
      if (
        event?.type === "pageshow" &&
        (event as PageTransitionEvent).persisted
      )
        setLoading(true);
      if (!document.hidden) void verify();
    };
    window.addEventListener("focus", focus);
    window.addEventListener("pageshow", focus);
    window.addEventListener("ea:auth-changed", focus);
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("ea-cloud-auth")
        : null;
    if (channel) channel.onmessage = focus;
    const timer = setInterval(focus, 60000);
    return () => {
      clearInterval(timer);
      channel?.close();
      window.removeEventListener("focus", focus);
      window.removeEventListener("pageshow", focus);
      window.removeEventListener("ea:auth-changed", focus);
    };
  }, [verify]);
  const login = (account: User, _hint: string) => {
    generation.current++;
    identity.current = `${account.id}:${account.role}:${account.status}`;
    queryClient.clear();
    setUser(account);
    setToken("cookie");
    setLoading(false);
    setUnavailable(false);
  };
  const logout = async () => {
    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw Error("Sign out failed");
      generation.current++;
      identity.current = null;
      try {
        for (const key of ["token", "app_token", "appClientToken"])
          localStorage.removeItem(key);
      } catch {}
      queryClient.clear();
      setUser(null);
      setToken(null);
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("ea-cloud-auth");
        channel.postMessage("logout");
        channel.close();
      }
      window.dispatchEvent(new Event("ea:auth-changed"));
      setLocation(
        window.location.pathname.startsWith("/superadmin")
          ? "/superadmin/login"
          : "/admin/login",
      );
    } catch {
      window.alert(
        "Unable to sign out securely. Please check your connection and try again.",
      );
    }
  };
  return (
    <AuthContext.Provider
      value={{ user, token, login, logout, isLoading: loading }}
    >
      {loading &&
      unavailable &&
      /^\/(admin|superadmin)(?:\/|$)/.test(window.location.pathname) ? (
        <div
          role="status"
          className="min-h-screen bg-black text-white flex items-center justify-center"
        >
          <button onClick={() => void verify()}>
            Unable to verify your session. Retry
          </button>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw Error("useAuth must be used within an AuthProvider");
  return value;
}
export function usePortalRedirect() {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  useEffect(() => {
    if (isLoading) return;
    if (!user || !["approved", "active"].includes(user.status)) {
      if (location.startsWith("/admin") && location !== "/admin/login")
        setLocation("/admin/login", { replace: true });
      if (
        location.startsWith("/superadmin") &&
        location !== "/superadmin/login"
      )
        setLocation("/superadmin/login", { replace: true });
    } else if (user.role === "mentor" && location.startsWith("/superadmin"))
      setLocation("/admin/dashboard", { replace: true });
    else if (user.role === "superadmin" && location.startsWith("/admin"))
      setLocation("/superadmin/dashboard", { replace: true });
  }, [user, isLoading, location, setLocation]);
}
