import { motion } from "framer-motion";
import { usePortalRedirect } from "@/contexts/AuthContext";
import { Bell, Shield, Globe } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useState } from "react";

export default function AdminSettings() {
  usePortalRedirect();
  const [notifications, setNotifications] = useState({ email: true, newClient: true, licenseExpiry: true });
  const [security, setSecurity] = useState({ twoFactor: false });

  return (
    <div className="p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-bold text-primary tracking-wide">Settings</h1>
        <p className="text-white/40 text-sm mt-1">Configure your portal preferences</p>
      </motion.div>

      <div className="max-w-xl space-y-5">

        {/* Notifications */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl border border-white/8 bg-white/3 p-6">
          <div className="flex items-center gap-2 mb-5 pb-4 border-b border-white/5">
            <Bell className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-white">Notifications</h3>
          </div>
          <div className="space-y-4">
            {[
              { key: "email", label: "Email notifications", desc: "Receive updates via email" },
              { key: "newClient", label: "New client alerts", desc: "Notify when a client joins" },
              { key: "licenseExpiry", label: "License expiry alerts", desc: "Notify 7 days before expiry" },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between py-1">
                <div>
                  <Label className="text-sm text-white font-medium">{item.label}</Label>
                  <p className="text-xs text-white/40 mt-0.5">{item.desc}</p>
                </div>
                <Switch
                  checked={notifications[item.key as keyof typeof notifications]}
                  onCheckedChange={v => setNotifications(n => ({ ...n, [item.key]: v }))}
                />
              </div>
            ))}
          </div>
        </motion.div>

        {/* Security */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-xl border border-white/8 bg-white/3 p-6">
          <div className="flex items-center gap-2 mb-5 pb-4 border-b border-white/5">
            <Shield className="w-4 h-4 text-blue-400" />
            <h3 className="font-semibold text-white">Security</h3>
          </div>
          <div className="flex items-center justify-between py-1">
            <div>
              <Label className="text-sm text-white font-medium">Two-factor authentication</Label>
              <p className="text-xs text-white/40 mt-0.5">Add an extra layer of security</p>
            </div>
            <Switch checked={security.twoFactor} onCheckedChange={v => setSecurity(s => ({ ...s, twoFactor: v }))} />
          </div>
        </motion.div>

        {/* Platform */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="rounded-xl border border-white/8 bg-white/3 p-6">
          <div className="flex items-center gap-2 mb-5 pb-4 border-b border-white/5">
            <Globe className="w-4 h-4 text-green-400" />
            <h3 className="font-semibold text-white">Platform</h3>
          </div>
          <div className="text-sm text-white/50 py-2">
            <div className="flex justify-between py-1.5 border-b border-white/5">
              <span>Platform Version</span><span className="text-white">v2.0.0</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-white/5">
              <span>Role</span><span className="text-primary">Mentor</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span>Support</span><span className="text-blue-400">support@eacloud.com</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
