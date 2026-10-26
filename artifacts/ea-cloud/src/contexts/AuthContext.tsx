import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useLocation } from "wouter";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@workspace/api-client-react";
interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => Promise<void>;
  isLoading: boolean;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [path, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [logoutError, setLogoutError] = useState(false);
  const {
    data: user,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
      staleTime: 0,
      refetchOnWindowFocus: "always",
    },
  });
  const denied = (error as { status?: number } | null)?.status === 401;
  const unavailable = !!error && !denied;
  const currentUser = denied ? null : (user ?? null);
  const login = (newUser: User, _token: string) => {
    try { localStorage.removeItem("token"); } catch {}
    queryClient.setQueryData(getGetMeQueryKey(), newUser);
  };
  const logout = async () => {
    setLogoutError(false);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign out failed");
      for (const key of ["token", "app_token", "appClientToken"])
        try { localStorage.removeItem(key); } catch {}
      queryClient.clear();
      try { localStorage.setItem("ea:signout", String(Date.now())); } catch {}
      window.location.replace(
        path.startsWith("/superadmin") ? "/superadmin/login" : "/admin/login",
      );
    } catch {
      setLogoutError(true);
    }
  };
  useEffect(() => {
    const check = () => {
      void refetch();
    };
    const storage = (e: StorageEvent) => {
      if (e.key === "ea:signout") {
        queryClient.clear();
        window.location.reload();
      }
    };
    window.addEventListener("pageshow", check);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("pageshow", check);
      window.removeEventListener("storage", storage);
    };
  }, [refetch, queryClient]);
  const portal = /^\/(admin|superadmin)(?:\/|$)/.test(path);
  const loading = isLoading || isFetching || unavailable;
  return (
    <AuthContext.Provider
      value={{
        user: currentUser,
        token: currentUser ? "cookie-portal" : null,
        login,
        logout,
        isLoading: loading,
      }}
    >
      {portal && (loading || logoutError) ? (
        <div
          role="status"
          className="min-h-screen bg-[#080810] text-white flex flex-col items-center justify-center gap-4"
        >
          {logoutError
            ? "Unable to sign out. Please retry."
            : unavailable
              ? "Unable to verify your session. Please retry."
              : "Checking your session…"}
          {(unavailable || logoutError) && (
            <button
              onClick={() => (logoutError ? void logout() : void refetch())}
            >
              Retry
            </button>
          )}
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
export function usePortalRedirect() {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      if (location.startsWith("/admin") && location !== "/admin/login")
        setLocation("/admin/login", { replace: true });
      if (
        location.startsWith("/superadmin") &&
        location !== "/superadmin/login"
      )
        setLocation("/superadmin/login", { replace: true });
    } else if (user.role === "superadmin" && location.startsWith("/admin"))
      setLocation("/superadmin/dashboard", { replace: true });
    else if (user.role !== "superadmin" && location.startsWith("/superadmin"))
      setLocation("/admin/dashboard", { replace: true });
  }, [user, isLoading, location, setLocation]);
}
