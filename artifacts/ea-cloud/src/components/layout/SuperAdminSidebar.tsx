import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { logo } from "@/lib/branding";
import { LayoutDashboard, Users, Smartphone, KeyRound, Settings, LogOut, Menu, X, ShieldCheck, Server, ListChecks, ScanLine } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
  { href: "/superadmin/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/superadmin/mentors", icon: Users, label: "Mentors" },
  { href: "/superadmin/app-access", icon: Smartphone, label: "App Access" },
  { href: "/superadmin/scanner", icon: ScanLine, label: "AI Scanner Management" },
  { href: "/superadmin/licenses", icon: KeyRound, label: "Licenses" },
  { href: "/superadmin/brokers", icon: Server, label: "Broker Whitelist" },
  { href: "/superadmin/signal-queue", icon: ListChecks, label: "Signal Queue" },
  { href: "/superadmin/settings", icon: Settings, label: "Settings" },
];

export function SuperAdminSidebar() {
  const [location] = useLocation();
  const { logout, user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-6 border-b border-purple-500/10">
        <img src={logo} alt="EA Cloud" className="w-9 h-9 rounded-full object-cover ring-1 ring-purple-500/40 shadow-[0_0_12px_rgba(168,85,247,0.4)]" />
        <div>
          <span className="text-sm font-bold text-white tracking-wide">EA CLOUD</span>
          <div className="text-[10px] text-purple-400/60 uppercase tracking-wider">Super Admin</div>
        </div>
      </div>

      <div className="px-5 py-3 border-b border-purple-500/5">
        <div className="flex items-center gap-1.5 text-[10px] text-purple-400/60 uppercase tracking-wider">
          <ShieldCheck className="w-3 h-3" />
          Master Control
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const active = location === item.href || location.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>
              <motion.div
                whileHover={{ x: 4 }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer group ${active
                  ? "bg-purple-500/15 text-purple-300 border border-purple-500/20 shadow-[0_0_12px_rgba(168,85,247,0.1)]"
                  : "text-white/50 hover:text-white hover:bg-white/5"
                }`}
              >
                <item.icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-purple-400" : "text-white/40 group-hover:text-white"}`} />
                {item.label}
                {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-400" />}
              </motion.div>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-purple-500/10">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-xs font-bold text-purple-400">
            {user?.firstName?.[0] || "S"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-white truncate">{user?.firstName} {user?.lastName}</div>
            <div className="text-[10px] text-purple-400/50 truncate">Super Admin</div>
          </div>
        </div>
        <a href="/ea-app/" className="flex items-center gap-3 px-3 py-2.5 text-sm text-white/50 hover:text-white">← Back to App</a>
        <motion.button
          whileHover={{ x: 4 }}
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </motion.button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden md:flex flex-col w-56 h-screen fixed left-0 top-0 z-40 border-r border-purple-500/10" style={{ background: "#08080f" }}>
        <SidebarContent />
      </aside>
      <button onClick={() => setMobileOpen(true)} className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300">
        <Menu className="w-5 h-5" />
      </button>
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} className="fixed inset-0 bg-black/60 z-40 md:hidden" />
            <motion.aside
              initial={{ x: -260 }} animate={{ x: 0 }} exit={{ x: -260 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed left-0 top-0 w-56 h-screen z-50 md:hidden border-r border-purple-500/10" style={{ background: "#08080f" }}
            >
              <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-4 p-1 text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
