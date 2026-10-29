import MentorModeArtwork from "@/components/MentorModeArtwork";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePortalRedirect } from "@/contexts/AuthContext";
import { useGetProfile, useUpdateProfile } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Copy, Check, RefreshCw, ShieldCheck, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetProfileQueryKey } from "@workspace/api-client-react";

// Fixed EA Cloud server endpoint — identical for every mentor, shown read-only.
const WEBHOOK_URL = `${window.location.origin}/api`;

export default function AdminProfile() {
  usePortalRedirect();
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useGetProfile();
  const updateMutation = useUpdateProfile();
  const [saved, setSaved] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedHook, setCopiedHook] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenError, setRegenError] = useState("");
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [newRawKey, setNewRawKey] = useState<string | null>(null); // shown once after regen
  const [copiedNew, setCopiedNew] = useState(false);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", mentorName: "",
    robotName: "", robotTagline: "", webhookUrl: "",
  });
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (profile) {
      setForm({
        firstName: profile.firstName || "",
        lastName: profile.lastName || "",
        email: profile.email || "",
        phone: profile.phone || "",
        mentorName: profile.mentorName || "",
        robotName: profile.robotName || "",
        robotTagline: profile.robotTagline || "",
        webhookUrl: profile.webhookUrl || "",
      });
      setApiKey(profile.apiKey || "");
    }
  }, [profile]);

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({ data: form });
      queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {}
  };

  const copyToClipboard = (text: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerate = async () => {
    setRegenLoading(true);
    setRegenError("");
    try {
      const token = "cookie-portal";
      const res = await fetch("/api/admin/regenerate-api-key", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to regenerate key");
      }
      const { apiKey: rawKey, apiKeyPrefix: prefix } = await res.json();
      setApiKey(prefix); // store prefix for future display
      setNewRawKey(rawKey); // show full key once
      queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
      setShowRegenConfirm(false);
    } catch (err: unknown) {
      setRegenError((err as Error).message || "Failed");
    } finally {
      setRegenLoading(false);
    }
  };

  const field = (label: string, key: keyof typeof form, opts?: { type?: string; placeholder?: string; readOnly?: boolean }) => (
    <div>
      <Label className="text-white/60 text-xs mb-1.5 block uppercase tracking-wider">{label}</Label>
      <Input
        type={opts?.type || "text"}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        placeholder={opts?.placeholder}
        readOnly={opts?.readOnly}
        className="bg-white/4 border-white/10 text-white placeholder:text-white/20 focus:border-primary/50 h-10 text-sm"
      />
    </div>
  );

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  );

  return (
    <div className="p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-bold text-primary tracking-wide">Profile Settings</h1>
        <p className="text-white/40 text-sm mt-1">Manage your mentor profile and EA configuration</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 items-start gap-6">
        {/* Personal Info */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl border border-white/8 bg-white/3 p-6">
          <div className="flex items-center gap-2 mb-5 pb-4 border-b border-white/5">
            <div className="w-1 h-5 bg-primary rounded-full" />
            <h3 className="font-semibold text-white">Personal Information</h3>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {field("First Name", "firstName", { placeholder: "John" })}
              {field("Last Name", "lastName", { placeholder: "Doe" })}
            </div>
            {field("Email Address", "email", { type: "email", readOnly: true, placeholder: "you@example.com" })}
            {field("Phone Number", "phone", { placeholder: "+1 234 567 8900" })}
            {field("Mentor Name", "mentorName", { placeholder: "Your trading handle" })}
          </div>
        </motion.div>

        {/* Branding & Assets */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="min-w-0 rounded-xl border border-white/8 bg-white/3 p-6">
          <div className="flex items-center gap-2 mb-5 pb-4 border-b border-white/5">
            <div className="w-1 h-5 bg-blue-400 rounded-full" />
            <h3 className="font-semibold text-white">Branding & Assets</h3>
          </div>
          <div className="space-y-4">
            {field("EA Name (Displayed on App)", "robotName", { placeholder: "SMC Blueprint EA" })}
            {field("Main Text (Top of Home Page)", "robotTagline", { placeholder: "@your_handle" })}

            <MentorModeArtwork />
          </div>
        </motion.div>

        {/* API Credentials */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="rounded-xl border border-white/8 bg-white/3 p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-5 pb-4 border-b border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 bg-[#00ff88] rounded-full" />
              <h3 className="font-semibold text-white">API Credentials</h3>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#00ff88]/10 border border-[#00ff88]/20">
              <ShieldCheck className="w-3.5 h-3.5 text-[#00ff88]" />
              <span className="text-[#00ff88] text-xs font-medium">System-managed</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* API Key — read-only */}
            <div>
              <Label className="text-white/60 text-xs mb-1.5 block uppercase tracking-wider">API Key</Label>
              <p className="text-white/30 text-[11px] mb-2 leading-relaxed">
                Auto-generated and tied exclusively to your account. Used by your MT5 EA to send signals.
              </p>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center h-10 px-3 rounded-md border border-white/10 bg-white/2 font-mono text-xs text-white/70 truncate select-all">
                  {apiKey || <span className="text-white/20 italic">Generating…</span>}
                </div>
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(apiKey, setCopiedKey)} disabled={!apiKey}
                  className="h-10 border-white/10 bg-white/5 text-white/60 hover:text-white flex-shrink-0 w-10 p-0">
                  {copiedKey ? <Check className="w-4 h-4 text-[#00ff88]" /> : <Copy className="w-4 h-4" />}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowRegenConfirm(true)} disabled={regenLoading}
                  title="Regenerate API Key"
                  className="h-10 border-white/10 bg-white/5 text-white/60 hover:text-amber-400 hover:border-amber-400/30 flex-shrink-0 w-10 p-0">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>

              {/* One-time raw key reveal after regeneration */}
              <AnimatePresence>
                {newRawKey && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="mt-3 p-3 rounded-lg border border-[#00ff88]/25 bg-[#00ff88]/6">
                    <div className="flex items-start gap-2 mb-2">
                      <ShieldCheck className="w-4 h-4 text-[#00ff88] flex-shrink-0 mt-0.5" />
                      <p className="text-[#00ff88] text-xs font-semibold">New API key generated — copy it now</p>
                    </div>
                    <p className="text-white/40 text-[11px] mb-2">This key will <span className="text-amber-300">never be shown again</span>. Store it securely and paste it into your MT5 EA.</p>
                    <div className="flex gap-2">
                      <div className="flex-1 flex items-center h-9 px-3 rounded border border-[#00ff88]/20 bg-black/30 font-mono text-xs text-[#00ff88] truncate select-all">
                        {newRawKey}
                      </div>
                      <Button size="sm" variant="outline" onClick={() => { copyToClipboard(newRawKey, setCopiedNew); }}
                        className="h-9 w-9 p-0 border-[#00ff88]/20 bg-[#00ff88]/5 text-[#00ff88] hover:bg-[#00ff88]/15 flex-shrink-0">
                        {copiedNew ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                    <button onClick={() => setNewRawKey(null)} className="mt-2 text-white/30 text-[11px] hover:text-white/60 transition-colors">
                      I've saved it — dismiss
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Regenerate confirmation */}
              <AnimatePresence>
                {showRegenConfirm && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                    className="mt-3 p-3 rounded-lg border border-amber-500/25 bg-amber-500/8">
                    <div className="flex items-start gap-2 mb-3">
                      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                      <p className="text-amber-300 text-xs leading-relaxed">
                        This will <span className="font-semibold">invalidate your current key immediately</span>. Your MT5 EA will stop working until you re-download and reinstall the new copier file.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleRegenerate} disabled={regenLoading}
                        className="h-8 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs gap-1.5">
                        {regenLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        {regenLoading ? "Regenerating…" : "Yes, regenerate"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowRegenConfirm(false)}
                        className="h-8 text-white/40 hover:text-white text-xs">
                        Cancel
                      </Button>
                    </div>
                    {regenError && <p className="text-red-400 text-xs mt-2">{regenError}</p>}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Webhook URL — fixed EA Cloud server endpoint, same for every mentor (read-only) */}
            <div>
              <Label className="text-white/60 text-xs mb-1.5 block uppercase tracking-wider">Webhook URL</Label>
              <p className="text-white/30 text-[11px] mb-2 leading-relaxed">
                EA Cloud server endpoint. Pre-filled in your downloaded MQ5 file.
              </p>
              <div className="flex gap-2">
                <Input value={WEBHOOK_URL} readOnly
                  className="bg-white/2 border-white/10 text-white/70 h-10 text-sm font-mono text-xs flex-1 select-all" />
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(WEBHOOK_URL, setCopiedHook)}
                  className="h-10 border-white/10 bg-white/5 text-white/60 hover:text-white flex-shrink-0 w-10 p-0">
                  {copiedHook ? <Check className="w-4 h-4 text-[#00ff88]" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-6">
        <Button onClick={handleSave} disabled={updateMutation.isPending}
          className="bg-primary hover:bg-primary/90 text-white px-8 h-11 font-semibold shadow-[0_0_20px_rgba(227,30,36,0.3)] gap-2">
          {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> :
            saved ? <><Check className="w-4 h-4" />Saved</> :
              <><Save className="w-4 h-4" />Save Changes</>}
        </Button>
      </motion.div>
    </div>
  );
}
