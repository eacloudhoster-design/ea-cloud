import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useLocation } from "wouter";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@workspace/api-client-react";

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Derive user directly from the query — no separate useState that can lag behind
  const { data: user, isLoading, error } = useGetMe({
    query: {
      queryKey: [...getGetMeQueryKey(), token],
      enabled: !!token,
      retry: false,
      staleTime: 5 * 60 * 1000, // treat as fresh for 5 min so refresh doesn't flicker
    },
  });

  // If the server rejects our token, clear it
  useEffect(() => {
    if (error) {
      setToken(null);
      localStorage.removeItem("token");
    }
  }, [error]);

  const login = (newUser: User, newToken: string) => {
    localStorage.setItem("token", newToken);
    // Seed the cache BEFORE updating the token state so the query finds data immediately
    queryClient.setQueryData([...getGetMeQueryKey(), newToken], newUser);
    setToken(newToken);
  };

  const logout = () => {
    const oldToken = token;
    setToken(null);
    localStorage.removeItem("token");
    if (oldToken) {
      queryClient.removeQueries({ queryKey: [...getGetMeQueryKey(), oldToken] });
    }
    // Redirect to the right login based on current path
    const dest = window.location.pathname.startsWith("/superadmin")
      ? "/superadmin/login"
      : "/admin/login";
    setLocation(dest);
  };

  // Consider loading whenever we have a token but the user hasn't resolved yet.
  // This prevents usePortalRedirect from seeing (isLoading=false, user=null) on refresh.
  const loading = !!token && (isLoading || (!user && !error));

  return (
    <AuthContext.Provider value={{ user: user ?? null, token: token, login, logout, isLoading: loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function usePortalRedirect() {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    // While loading (token present, user resolving) — don't touch the location
    if (isLoading) return;

    if (!user) {
      if (location.startsWith("/admin") && location !== "/admin/login") {
        setLocation("/admin/login");
      }
      if (location.startsWith("/superadmin") && location !== "/superadmin/login") {
        setLocation("/superadmin/login");
      }
      return;
    }

    // Role-based portal enforcement
    if (user.role === "mentor" && location.startsWith("/superadmin")) {
      setLocation("/admin/dashboard");
    } else if (user.role === "superadmin" && location.startsWith("/admin")) {
      setLocation("/superadmin/dashboard");
    }
  }, [user, isLoading, location, setLocation]);
}
