import { useState } from "react";
import { motion } from "framer-motion";
import { usePortalRedirect } from "@/contexts/AuthContext";
import { useGetLicenses, useCreateLicense, useUpdateLicense, getGetLicensesQueryKey, LicenseInputDuration } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Copy, Check, RefreshCw, Ban, Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

const durations = [
  { value: "1month", label: "1 Month" },
  { value: "3months", label: "3 Months" },
  { value: "6months", label: "6 Months" },
  { value: "1year", label: "1 Year" },
  { value: "3years", label: "3 Years" },
];

export default function AdminLicenses() {
  usePortalRedirect();
  const queryClient = useQueryClient();
  const { data: licenses, isLoading, refetch } = useGetLicenses();
  const createMutation = useCreateLicense();
  const updateMutation = useUpdateLicense();
  const [form, setForm] = useState({ clientName: "", clientEmail: "", duration: "1month" });
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    if (!form.clientName || !form.clientEmail) { setError("All fields required"); return; }
    setError("");
    try {
      await createMutation.mutateAsync({ data: { ...form, duration: form.duration as LicenseInputDuration } });
      queryClient.invalidateQueries({ queryKey: getGetLicensesQueryKey() });
      setForm({ clientName: "", clientEmail: "", duration: "1month" });
    } catch (err: unknown) {
      setError((err as { data?: { error?: string } })?.data?.error || "Failed to generate license");
    }
  };

  const handleDeactivate = async (id: number) => {
    await updateMutation.mutateAsync({ id, data: { status: "inactive" } });
    queryClient.invalidateQueries({ queryKey: getGetLicensesQueryKey() });
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const filtered = licenses?.filter(l =>
    l.clientEmail.toLowerCase().includes(search.toLowerCase()) ||
    l.clientName.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <div className="p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-bold text-primary tracking-wide">Generate License</h1>
        <p className="text-white/40 text-sm mt-1">Create and manage client license keys</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Create License */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl border border-white/8 bg-white/3 p-6">
          <h3 className="font-semibold text-white mb-5">Create New License</h3>
          <div className="space-y-4">
            <div>
              <Label className="text-white/60 text-xs mb-1.5 block uppercase tracking-wider">Client Name</Label>
              <Input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} placeholder="John Doe" className="bg-white/4 border-white/10 text-white placeholder:text-white/20 h-10" />
            </div>
            <div>
              <Label className="text-white/60 text-xs mb-1.5 block uppercase tracking-wider">Client Email</Label>
              <Input type="email" value={form.clientEmail} onChange={e => setForm(f => ({ ...f, clientEmail: e.target.value }))} placeholder="client@example.com" className="bg-white/4 border-white/10 text-white placeholder:text-white/20 h-10" />
            </div>
            <div>
              <Label className="text-white/60 text-xs mb-2 block uppercase tracking-wider">Duration</Label>
              <div className="grid grid-cols-3 gap-2 mb-2">
                {durations.slice(0, 3).map(d => (
                  <button
                    key={d.value}
                    onClick={() => setForm(f => ({ ...f, duration: d.value }))}
                    className={`py-2 px-3 rounded-lg text-xs font-medium transition-all duration-200 border ${form.duration === d.value ? "border-primary bg-primary/20 text-primary shadow-[0_0_10px_rgba(227,30,36,0.2)]" : "border-white/10 bg-white/3 text-white/50 hover:border-white/20 hover:text-white"}`}
                  >{d.label}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {durations.slice(3).map(d => (
                  <button
                    key={d.value}
                    onClick={() => setForm(f => ({ ...f, duration: d.value }))}
                    className={`py-2 px-3 rounded-lg text-xs font-medium transition-all duration-200 border ${form.duration === d.value ? "border-primary bg-primary/20 text-primary shadow-[0_0_10px_rgba(227,30,36,0.2)]" : "border-white/10 bg-white/3 text-white/50 hover:border-white/20 hover:text-white"}`}
                  >{d.label}</button>
                ))}
              </div>
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <Button onClick={handleGenerate} disabled={createMutation.isPending} className="w-full h-11 bg-gradient-to-r from-[#1a6bff] to-primary hover:opacity-90 text-white font-bold tracking-wider shadow-[0_0_20px_rgba(26,107,255,0.3)] gap-2">
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> GENERATE KEY</>}
            </Button>
          </div>
        </motion.div>

        {/* License List */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-xl border border-white/8 bg-white/3 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white">Recent Licenses</h3>
            <button onClick={() => refetch()} className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/5 transition-all">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by email..." className="pl-9 bg-white/4 border-white/10 text-white placeholder:text-white/20 h-9 text-sm" />
          </div>
          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1 custom-scroll">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 bg-white/5 rounded-lg animate-pulse" />
              ))
            ) : filtered.length === 0 ? (
              <div className="text-center text-white/20 py-10 text-sm">No licenses found</div>
            ) : filtered.map((license) => (
              <motion.div
                key={license.id}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                className="p-3 rounded-lg border border-white/6 bg-white/2 hover:border-white/12 transition-all"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-white">{license.clientEmail}</span>
                  <Badge className={`text-[10px] px-2 py-0.5 ${license.status === "active" ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>
                    {license.duration}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-[10px] text-primary/70 font-mono flex-1 truncate">{license.key}</code>
                  <button onClick={() => copyKey(license.key)} className="p-1 text-white/30 hover:text-white transition-colors">
                    {copiedKey === license.key ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                  {license.status === "active" && (
                    <button onClick={() => handleDeactivate(license.id)} className="p-1 text-white/30 hover:text-red-400 transition-colors">
                      <Ban className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className="text-[10px] text-white/25 mt-1">
                  {license.expiresAt ? `Expires: ${format(new Date(license.expiresAt), "MMM d, yyyy")}` : "No expiry"}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
