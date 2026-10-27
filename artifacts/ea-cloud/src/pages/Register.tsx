import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { navigationLogo as logo, authBackground } from "@/lib/branding";
import "./MentorAuth.css";
import "./MobileRegister.css";
import {
  MobileLoginBackdrop,
  MobileLoginCloud,
} from "./admin/MobileLoginArtwork";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRegister } from "@workspace/api-client-react";
import { Loader2, Clock, CheckCircle2, Mail, RefreshCw, X } from "lucide-react";

function PendingApprovalScreen({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  const [, setLocation] = useLocation();
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date>(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkStatus = async () => {
    setChecking(true);
    try {
      const res = await fetch(
        `/api/auth/status?email=${encodeURIComponent(email)}`,
      );
      if (res.ok) {
        const { status } = (await res.json()) as { status: string };
        setLastChecked(new Date());
        if (status === "approved") {
          setLocation("/admin/login?approved=1");
        }
      }
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    // Poll every 30 seconds
    intervalRef.current = setInterval(checkStatus, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [email]);

  return (
    <div className="min-h-screen bg-[#080810] flex items-center justify-center px-4">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 50% 50%, rgba(245,158,11,0.06) 0%, transparent 60%)",
        }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Floating icon */}
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="flex justify-center mb-8"
        >
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-amber-500/20 blur-2xl scale-150" />
            <div className="relative w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <Clock className="w-9 h-9 text-amber-400" />
            </div>
          </div>
        </motion.div>

        <div className="rounded-2xl border border-amber-500/20 bg-white/3 backdrop-blur-md shadow-[0_0_60px_rgba(245,158,11,0.06)] overflow-hidden">
          {/* Header */}
          <div className="bg-amber-500/8 border-b border-amber-500/15 px-8 py-5 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <span className="text-green-400 text-sm font-medium">
                Account Created Successfully
              </span>
            </div>
            <h2 className="text-xl font-bold text-white">Welcome, {name}!</h2>
          </div>

          {/* Body */}
          <div className="px-8 py-7">
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/6 p-5 mb-6">
              <div className="flex gap-3 items-start">
                <Clock className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-amber-300 font-semibold text-sm mb-2">
                    Pending Super Admin Approval
                  </p>
                  <p className="text-amber-200/70 text-sm leading-relaxed">
                    Your approval is pending from the super admin. You will be
                    notified once approved. Please check back within 24 hours.
                    Admin will approve you within 24 hours.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/8 bg-white/3 p-4 mb-6 flex gap-3 items-start">
              <Mail className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-white/50 text-xs leading-relaxed">
                You'll receive an email at{" "}
                <span className="text-white/80 font-medium">{email}</span> as
                soon as your account is approved. Check your inbox and spam
                folder.
              </p>
            </div>

            {/* Status indicator */}
            <div className="flex items-center justify-between text-xs text-white/30 mb-6 px-1">
              <span>Auto-checking every 30 seconds</span>
              <div className="flex items-center gap-1.5">
                <AnimatePresence mode="wait">
                  {checking ? (
                    <motion.div
                      key="checking"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="w-2 h-2 rounded-full bg-amber-500/50"
                    />
                  )}
                </AnimatePresence>
                <span>
                  Last checked{" "}
                  {lastChecked.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={checkStatus}
                disabled={checking}
                className="flex-1 h-10 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 text-sm gap-2"
              >
                {checking ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Check Status
              </Button>
              <Link href="/admin/login" className="flex-1">
                <Button className="w-full h-10 bg-white/5 hover:bg-white/10 text-white/50 border border-white/8 text-sm">
                  Back to Login
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function Register() {
  const registerMutation = useRegister();
  const [, setLocation] = useLocation();
  const close = () => {
    if (
      document.referrer &&
      new URL(document.referrer).origin === window.location.origin &&
      window.history.length > 1
    )
      window.history.back();
    else setLocation("/");
  };
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    mentorName: "",
    phone: "",
  });
  const [error, setError] = useState("");
  const [registered, setRegistered] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [registeredName, setRegisteredName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await registerMutation.mutateAsync({ data: form });
      setRegisteredName(form.firstName);
      setRegisteredEmail(form.email);
      setRegistered(true);
    } catch (err: unknown) {
      const apiErr = err as { data?: { error?: string } | null };
      setError(apiErr?.data?.error || "Registration failed");
    }
  };

  if (registered) {
    return (
      <PendingApprovalScreen name={registeredName} email={registeredEmail} />
    );
  }

  return (
    <div
      className="mentor-register-page"
      style={{
        backgroundImage: `linear-gradient(rgba(0,0,0,.4), rgba(0,0,0,.4)), url("${authBackground}")`,
      }}
    >
      <div
        className="mentor-register-mobile-backdrop"
        style={{ backgroundImage: `url("${authBackground}")` }}
      >
        <MobileLoginBackdrop />
      </div>
      <div className="mentor-register-mobile-brand">
        <MobileLoginCloud />
      </div>
      <section
        className="mentor-register-panel"
        aria-labelledby="register-heading"
      >
        <div className="mentor-register-topbar">
          <img src={logo} alt="EA Cloud" className="mentor-register-logo" />
          <button
            type="button"
            onClick={close}
            aria-label="Close registration"
            className="mentor-register-close"
          >
            <X aria-hidden="true" size={24} />
          </button>
        </div>
        <div className="mentor-register-content">
          <header className="mentor-register-heading">
            <h1 id="register-heading">Create Mentor Account</h1>
            <p>Join the EA Cloud mentor network</p>
          </header>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="mentor-register-names grid grid-cols-2 gap-4">
              <div>
                <Label
                  htmlFor="register-firstName"
                  className="text-white/70 text-xs mb-1.5 block"
                >
                  First Name
                </Label>
                <Input
                  id="register-firstName"
                  name="firstName"
                  autoComplete="given-name"
                  value={form.firstName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, firstName: e.target.value }))
                  }
                  placeholder="John"
                  required
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-primary/50 focus:ring-primary/20"
                />
              </div>
              <div>
                <Label
                  htmlFor="register-lastName"
                  className="text-white/70 text-xs mb-1.5 block"
                >
                  Last Name
                </Label>
                <Input
                  id="register-lastName"
                  name="lastName"
                  autoComplete="family-name"
                  value={form.lastName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, lastName: e.target.value }))
                  }
                  placeholder="Doe"
                  required
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-primary/50 focus:ring-primary/20"
                />
              </div>
            </div>
            <div>
              <Label
                htmlFor="register-mentorName"
                className="text-white/70 text-xs mb-1.5 block"
              >
                Mentor Name
              </Label>
              <Input
                id="register-mentorName"
                name="mentorName"
                autoComplete="nickname"
                value={form.mentorName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, mentorName: e.target.value }))
                }
                placeholder="Your trading handle"
                required
                className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-primary/50 focus:ring-primary/20"
              />
            </div>
            <div>
              <Label
                htmlFor="register-email"
                className="text-white/70 text-xs mb-1.5 block"
              >
                Email Address
              </Label>
              <Input
                id="register-email"
                name="email"
                autoComplete="email"
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
                placeholder="you@example.com"
                required
                className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-primary/50 focus:ring-primary/20"
              />
            </div>
            <div>
              <Label
                htmlFor="register-phone"
                className="text-white/70 text-xs mb-1.5 block"
              >
                Phone Number
              </Label>
              <Input
                id="register-phone"
                name="phone"
                autoComplete="tel"
                type="tel"
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
                placeholder="+1 234 567 8900"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-primary/50 focus:ring-primary/20"
              />
            </div>
            <div>
              <Label
                htmlFor="register-password"
                className="text-white/70 text-xs mb-1.5 block"
              >
                Password
              </Label>
              <Input
                id="register-password"
                name="password"
                autoComplete="new-password"
                type="password"
                value={form.password}
                onChange={(e) =>
                  setForm((f) => ({ ...f, password: e.target.value }))
                }
                placeholder="••••••••••"
                required
                className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-primary/50 focus:ring-primary/20"
              />
            </div>
            {error && (
              <p
                role="alert"
                className="text-red-400 text-xs text-center bg-red-500/10 rounded-lg py-2 px-3 border border-red-500/20"
              >
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full h-11 bg-gradient-to-r from-primary to-[#ff5f63] hover:from-primary/90 hover:to-[#ff5f63]/90 text-white font-semibold shadow-[0_0_20px_rgba(227,30,36,0.4)] transition-all duration-300 mt-2"
            >
              {registerMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Create Account"
              )}
            </Button>
          </form>
          <p className="mentor-register-signin">
            Already have an account? <Link href="/admin/login">Sign in</Link>
          </p>
          <p className="mentor-register-approval">
            Account requires approval before portal access is granted.
          </p>
        </div>
      </section>
    </div>
  );
}
