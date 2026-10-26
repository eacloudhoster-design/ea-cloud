import { useState, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { loginErrorMessage } from "@/lib/login-error";
import { navigationLogo as logo, authBackground } from "@/lib/branding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Clock, CheckCircle2, X, Eye, EyeOff } from "lucide-react";

import { helpLinks } from "@/privacy/legal-links";
import "../MentorAuth.css";

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const justApproved = new URLSearchParams(search).get("approved") === "1";
  const { login, user, isLoading: restoringSession } = useAuth();
  useEffect(() => {
    if (!restoringSession && user?.status === "approved")
      setLocation(
        user.role === "superadmin"
          ? "/superadmin/dashboard"
          : "/admin/dashboard",
        { replace: true },
      );
  }, [user, restoringSession, setLocation]);
  const loginMutation = useLogin();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const supportHref =
    helpLinks.find((link) => link.label === "Support")?.href ?? "/#support";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsPending(false);
    try {
      const result = await loginMutation.mutateAsync({
        data: { ...form, role: "mentor" },
      });
      login(result.user, result.token);
      setLocation(
        result.user.role === "superadmin"
          ? "/superadmin/dashboard"
          : "/admin/dashboard",
        { replace: true },
      );
    } catch (err: unknown) {
      const msg = loginErrorMessage(err);
      if (msg === "pending_approval") {
        setIsPending(true);
      } else {
        setError(msg);
      }
    }
  };

  if (restoringSession || user?.status === "approved")
    return (
      <div
        role="status"
        className="min-h-screen bg-black text-white flex items-center justify-center"
      >
        Verifying session…
      </div>
    );

  return (
    <div
      className="mentor-login-page"
      style={{ backgroundImage: `url("${authBackground}")` }}
    >
      <Link href="/" aria-label="Close sign in" className="mentor-login-close">
        <X size={26} aria-hidden="true" />
      </Link>
      <section
        className="mentor-login-brand"
        aria-label="EA Cloud"
        style={{ backgroundImage: `url("${authBackground}")` }}
      >
        <div className="mentor-login-emblem">
          <img src={logo} alt="EA Cloud" className="mentor-login-logo" />
          <img
            src={logo}
            alt=""
            aria-hidden="true"
            className="mentor-login-eyes mentor-login-eyes-left"
          />
          <img
            src={logo}
            alt=""
            aria-hidden="true"
            className="mentor-login-eyes mentor-login-eyes-right"
          />
        </div>
      </section>
      <main className="mentor-login-main">
        <div className="mentor-login-form-content">
          <h1>Sign in to EA Cloud</h1>
          {justApproved && (
            <div
              role="status"
              className="mentor-login-notice mentor-login-approved"
            >
              <CheckCircle2 size={18} aria-hidden="true" />
              <div>
                <p>Account Approved!</p>
                <p>Your account has been approved. You can now log in below.</p>
              </div>
            </div>
          )}
          <form
            onSubmit={handleSubmit}
            className="mentor-login-form"
            aria-label="Sign in to EA Cloud"
          >
            <div>
              <Label htmlFor="mentor-login-email">Email Address</Label>
              <Input
                id="mentor-login-email"
                name="email"
                autoComplete="email"
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
                placeholder="admin@eacloud.com"
                required
              />
            </div>
            <div>
              <Label htmlFor="mentor-login-password">Password</Label>
              <div className="mentor-login-password">
                <Input
                  id="mentor-login-password"
                  name="password"
                  autoComplete="current-password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, password: e.target.value }))
                  }
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  aria-controls="mentor-login-password"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? (
                    <EyeOff size={20} aria-hidden="true" />
                  ) : (
                    <Eye size={20} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
            {isPending && (
              <div
                role="status"
                className="mentor-login-notice mentor-login-pending"
              >
                <Clock size={18} aria-hidden="true" />
                <div>
                  <p>Pending Super Admin Approval</p>
                  <p>
                    Your account is under review. You'll be able to log in once
                    a super admin approves it.
                  </p>
                </div>
              </div>
            )}
            {error && (
              <p role="alert" className="mentor-login-error">
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={loginMutation.isPending}
              aria-busy={loginMutation.isPending}
              className="mentor-login-submit"
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2
                    className="animate-spin"
                    size={18}
                    aria-hidden="true"
                  />
                  <span>Signing in…</span>
                </>
              ) : (
                "LOGIN"
              )}
            </Button>
          </form>
          <p className="mentor-login-create">
            Don't have an account? <Link href="/register">Create one</Link>
          </p>
        </div>
        <a href={supportHref} className="mentor-login-support">
          Help / Support
        </a>
      </main>
    </div>
  );
}
