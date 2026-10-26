import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { logo } from "@/lib/branding";
import { LayoutDashboard, Settings2, User, KeyRound, Users, Settings, LogOut, Menu, X, Bot, Cable } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
  { href: "/admin/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/admin/ea-manager", icon: Bot, label: "EA Manager" },
  { href: "/admin/setup", icon: Settings2, label: "Setup Method" },
  { href: "/admin/profile", icon: User, label: "Profile" },
  { href: "/admin/licenses", icon: KeyRound, label: "Licenses" },
  { href: "/admin/clients", icon: Users, label: "Clients" },
  { href: "/admin/mt5-connections", icon: Cable, label: "MT5 Connections" },
  { href: "/admin/settings", icon: Settings, label: "Settings" },
];

export function AdminSidebar() {
  const [location] = useLocation();
  const { logout, user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-6 border-b border-white/5">
        <img src={logo} alt="EA Cloud" className="w-9 h-9 rounded-full object-cover ring-1 ring-primary/40 shadow-[0_0_12px_rgba(227,30,36,0.4)]" />
        <div>
          <span className="text-sm font-bold text-white tracking-wide">EA CLOUD</span>
          <div className="text-[10px] text-white/30 uppercase tracking-wider">Admin Portal</div>
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
                  ? "bg-primary/15 text-primary border border-primary/20 shadow-[0_0_12px_rgba(227,30,36,0.1)]"
                  : "text-white/50 hover:text-white hover:bg-white/5"
                }`}
              >
                <item.icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-primary" : "text-white/40 group-hover:text-white"}`} />
                {item.label}
                {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
              </motion.div>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/5">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">
            {user?.firstName?.[0] || "M"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-white truncate">{user?.firstName} {user?.lastName}</div>
            <div className="text-[10px] text-white/30 truncate">{user?.email}</div>
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
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 h-screen bg-[#0a0a12] border-r border-white/5 fixed left-0 top-0 z-40">
        <SidebarContent />
      </aside>

      {/* Mobile hamburger */}
      <button onClick={() => setMobileOpen(true)} className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-white/5 border border-white/10 text-white">
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} className="fixed inset-0 bg-black/60 z-40 md:hidden" />
            <motion.aside
              initial={{ x: -260 }} animate={{ x: 0 }} exit={{ x: -260 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed left-0 top-0 w-56 h-screen bg-[#0a0a12] border-r border-white/5 z-50 md:hidden"
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
