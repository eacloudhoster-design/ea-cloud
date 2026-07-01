import { motion } from "framer-motion";
import { usePortalRedirect } from "@/contexts/AuthContext";
import { ShieldCheck, Globe, Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useState } from "react";

export default function SuperAdminSettings() {
  usePortalRedirect();
  const [notifs, setNotifs] = useState({ newMentor: true, appRequest: true, strikes: true });

  return (
    <div className="p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-bold text-purple-400 tracking-wide">Settings</h1>
        <p className="text-white/40 text-sm mt-1">Configure super admin portal preferences</p>
      </motion.div>
      <div className="max-w-xl space-y-5">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl border border-purple-500/15 bg-purple-950/10 p-6">
          <div className="flex items-center gap-2 mb-5 pb-4 border-b border-purple-500/10">
            <Bell className="w-4 h-4 text-purple-400" />
            <h3 className="font-semibold text-white">Notifications</h3>
          </div>
          <div className="space-y-4">
            {[
              { key: "newMentor", label: "New mentor registrations" },
              { key: "appRequest", label: "App access requests" },
              { key: "strikes", label: "Mentor strike threshold alerts" },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between py-1">
                <Label className="text-sm text-white/80">{item.label}</Label>
                <Switch checked={notifs[item.key as keyof typeof notifs]} onCheckedChange={v => setNotifs(n => ({ ...n, [item.key]: v }))} />
              </div>
            ))}
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-xl border border-purple-500/15 bg-purple-950/10 p-6">
          <div className="flex items-center gap-2 mb-5 pb-4 border-b border-purple-500/10">
            <ShieldCheck className="w-4 h-4 text-purple-400" />
            <h3 className="font-semibold text-white">Platform Info</h3>
          </div>
          <div className="text-sm text-white/50 space-y-2">
            <div className="flex justify-between py-1 border-b border-white/5"><span>Version</span><span className="text-white">v2.0.0</span></div>
            <div className="flex justify-between py-1 border-b border-white/5"><span>Access Level</span><span className="text-purple-400">Super Admin</span></div>
            <div className="flex justify-between py-1"><span>Support</span><span className="text-blue-400">dev@eacloud.com</span></div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
