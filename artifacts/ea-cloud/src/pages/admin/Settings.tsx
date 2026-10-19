import { motion } from "framer-motion";
import { usePortalRedirect } from "@/contexts/AuthContext";
import { Settings, Bell, Shield, Globe, ImageIcon, Upload, X, CheckCircle2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState, useRef, useCallback } from "react";
import { useGetProfile, useUpdateProfile, getGetProfileQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

export default function AdminSettings() {
  usePortalRedirect();
  const queryClient = useQueryClient();
  const { data: profile } = useGetProfile();
  const updateProfile = useUpdateProfile();
  const { token } = useAuth();

  const [notifications, setNotifications] = useState({ email: true, newClient: true, licenseExpiry: true });
  const [security, setSecurity] = useState({ twoFactor: false });
  const [bgPreview, setBgPreview] = useState<string | null>(null);
  const [bgSaving, setBgSaving] = useState(false);
  const [bgSaved, setBgSaved] = useState(false);
  const [bgError, setBgError] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedFileRef = useRef<File | null>(null);

  const currentBg = bgPreview ?? profile?.backgroundImageUrl ?? null;

  const handleFile = useCallback((file: File) => {
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) { setBgError("Please select a JPEG, PNG, WebP or GIF image"); return; }
    if (file.size > 5 * 1024 * 1024) { setBgError("Image must be under 5MB"); return; }
    setBgError("");
    setBgSaved(false);
    selectedFileRef.current = file;
    const reader = new FileReader();
    reader.onload = (e) => setBgPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleSaveBg = async () => {
    const file = selectedFileRef.current;
    if (!file) return;
    setBgSaving(true);
    setBgError("");
    try {
      // Step 1: request an authenticated background upload endpoint
      const metaRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!metaRes.ok) {
        const err = await metaRes.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Failed to get upload URL");
      }
      const { uploadURL, objectPath } = await metaRes.json() as { uploadURL: string; objectPath: string };

      // Step 2: upload the file through the Pages R2 handler
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type, ...(token && new URL(uploadURL, window.location.href).origin === window.location.origin ? { Authorization: `Bearer ${token}` } : {}) },
        body: file,
      });
      if (!putRes.ok) {
        const error = await putRes.json().catch(() => ({}));
        throw new Error(error.error || "Upload to storage failed");
      }

      const backgroundImageUrl = `/api/storage${objectPath}`;

      // Step 3: save the persistent URL to the mentor profile
      await updateProfile.mutateAsync({ data: { backgroundImageUrl } });
      await queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
      selectedFileRef.current = null;
      setBgPreview(null);
      setBgSaved(true);
      setTimeout(() => setBgSaved(false), 3000);
    } catch (err) {
      setBgError((err as Error).message || "Failed to save background image");
    } finally {
      setBgSaving(false);
    }
  };

  const handleRemoveBg = async () => {
    setBgError("");
    setBgSaving(true);
    try {
      await updateProfile.mutateAsync({ data: { backgroundImageUrl: "" } });
      await queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
      selectedFileRef.current = null;
      setBgPreview(null);
    } catch (err) { setBgError((err as Error).message || "Failed to remove background image"); } finally {
      setBgSaving(false);
    }
  };

  return (
    <div className="p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-bold text-primary tracking-wide">Settings</h1>
        <p className="text-white/40 text-sm mt-1">Configure your portal preferences</p>
      </motion.div>

      <div className="max-w-xl space-y-5">

        {/* Background Image */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-xl border border-white/8 bg-white/3 p-6">
          <div className="flex items-center gap-2 mb-5 pb-4 border-b border-white/5">
            <ImageIcon className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-white">App Background Image</h3>
          </div>

          {/* Preview */}
          {currentBg ? (
            <div className="relative mb-4 rounded-xl overflow-hidden border border-white/8 group">
              <img src={currentBg} alt="Background preview" className="w-full h-40 object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-medium backdrop-blur-sm transition-all"
                >
                  Change
                </button>
                <button
                  onClick={handleRemoveBg}
                  className="px-3 py-1.5 rounded-lg bg-red-500/30 hover:bg-red-500/50 text-white text-xs font-medium backdrop-blur-sm transition-all flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Remove
                </button>
              </div>
            </div>
          ) : (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`mb-4 rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer flex flex-col items-center justify-center py-10 px-6 text-center ${
                isDragOver
                  ? "border-primary/60 bg-primary/5"
                  : "border-white/10 bg-white/2 hover:border-white/20 hover:bg-white/3"
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors ${isDragOver ? "bg-primary/20 border border-primary/30" : "bg-white/5 border border-white/8"}`}>
                <Upload className={`w-5 h-5 ${isDragOver ? "text-primary" : "text-white/30"}`} />
              </div>
              <p className="text-sm text-white/60 font-medium">Drop image here or click to upload</p>
              <p className="text-xs text-white/30 mt-1">PNG, JPG, WEBP · Max 5MB</p>
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />

          {bgError && <p className="text-red-400 text-xs mb-3">{bgError}</p>}

          {bgPreview && bgPreview !== profile?.backgroundImageUrl && (
            <Button
              onClick={handleSaveBg}
              disabled={bgSaving}
              className="w-full bg-primary hover:bg-primary/90 text-white gap-2 shadow-[0_0_20px_rgba(227,30,36,0.2)]"
            >
              {bgSaved
                ? <><CheckCircle2 className="w-4 h-4" /> Saved!</>
                : bgSaving ? "Saving..." : <><Upload className="w-4 h-4" /> Save Background</>
              }
            </Button>
          )}

          {bgSaved && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-green-400 text-xs text-center mt-2">
              Background saved — visible to your clients in the app
            </motion.p>
          )}
        </motion.div>

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
