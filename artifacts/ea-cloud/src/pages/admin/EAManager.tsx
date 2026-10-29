import { Link } from "wouter";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePortalRedirect } from "@/contexts/AuthContext";
import { useGetEas, useCreateEa, useUpdateEa, useDeleteEa, getGetEasQueryKey } from "@workspace/api-client-react";
import type { EaInputRiskLevel } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bot, Plus, Trash2, Pencil, X, CheckCircle2, CircleDot } from "lucide-react";
import SymbolPairsManager from "./SymbolPairsManager";

const RISK_COLORS = {
  low: "text-green-400 bg-green-400/10 border-green-400/20",
  medium: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  high: "text-red-400 bg-red-400/10 border-red-400/20",
};

const SYMBOLS = ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "BTCUSD", "ETHUSD", "NAS100", "US30", "USOIL", "GBPJPY"];

type FormState = {
  name: string;
  description: string;
  symbol: string; // comma-separated
  lotSize: string;
  riskLevel: EaInputRiskLevel;
  isActive: boolean;
};

const defaultForm: FormState = {
  name: "",
  description: "",
  symbol: "XAUUSD",
  lotSize: "0.01",
  riskLevel: "medium",
  isActive: true,
};

function getSelectedSymbols(symbol: string): string[] {
  return symbol.split(",").map(s => s.trim()).filter(Boolean);
}

function toggleSymbol(current: string, sym: string): string {
  const arr = getSelectedSymbols(current);
  const idx = arr.indexOf(sym);
  if (idx === -1) {
    return [...arr, sym].join(",");
  } else {
    const next = arr.filter(s => s !== sym);
    return next.length > 0 ? next.join(",") : current; // don't allow empty
  }
}

export default function EAManager() {
  usePortalRedirect();
  const queryClient = useQueryClient();
  const { data: eas, isLoading } = useGetEas();
  const createMutation = useCreateEa();
  const updateMutation = useUpdateEa();
  const deleteMutation = useDeleteEa();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [error, setError] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetEasQueryKey() });

  const openCreate = () => { setEditingId(null); setForm(defaultForm); setError(""); setShowForm(true); };
  const openEdit = (ea: NonNullable<typeof eas>[0]) => {
    setEditingId(ea.id);
    setForm({
      name: ea.name,
      description: ea.description ?? "",
      symbol: ea.symbol,
      lotSize: ea.lotSize,
      riskLevel: ea.riskLevel as EaInputRiskLevel,
      isActive: ea.isActive,
    });
    setError("");
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(defaultForm); setError(""); };

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError("EA name is required"); return; }
    if (editingId !== null && !form.symbol) { setError("Select at least one symbol"); return; }
    setError("");
    try {
      if (editingId !== null) {
        await updateMutation.mutateAsync({ id: editingId, data: { ...form } });
      } else {
        await createMutation.mutateAsync({ data: { name: form.name, description: form.description, isActive: form.isActive } });
      }
      invalidate();
      closeForm();
    } catch (err: unknown) {
      setError((err as { data?: { error?: string } })?.data?.error ?? "Failed to save EA");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMutation.mutateAsync({ id });
      invalidate();
    } catch { }
  };

  const handleToggle = async (ea: NonNullable<typeof eas>[0]) => {
    try {
      await updateMutation.mutateAsync({ id: ea.id, data: { isActive: !ea.isActive } });
      invalidate();
    } catch { }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const selectedSymbols = getSelectedSymbols(form.symbol);

  return (
    <div className="p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-wide">EA Manager</h1>
          <p className="text-white/40 text-sm mt-1">Create and manage your Expert Advisors</p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-primary hover:bg-primary/90 text-white gap-2 shadow-[0_0_20px_rgba(227,30,36,0.3)]"
        >
          <Plus className="w-4 h-4" /> New EA
        </Button>
      </motion.div>

      {/* Create / Edit Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={(e) => e.target === e.currentTarget && closeForm()}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              role="dialog"
              aria-modal="true"
              aria-label={editingId !== null ? "Edit EA" : "Create New EA"}
              className="w-full max-w-lg bg-[#0e0e1a] border border-white/10 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-bold text-white">{editingId ? "Edit EA" : "Create New EA"}</h2>
                    <p className="text-xs text-white/40">Expert Advisor configuration</p>
                  </div>
                </div>
                <button aria-label="Close EA form" onClick={closeForm} className="text-white/30 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-white/50 uppercase tracking-wider mb-1.5 block">EA Name *</Label>
                  <Input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Gold Scalper Pro"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-primary/50"
                  />
                </div>

                <div>
                  <Label className="text-xs text-white/50 uppercase tracking-wider mb-1.5 block">Description</Label>
                  <Input
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Short description of your EA strategy"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-primary/50"
                  />
                </div>

                {editingId !== null && <>
                {/* Multi-symbol selector */}
                <div>
                  <Label className="text-xs text-white/50 uppercase tracking-wider mb-2 block">
                    Trading Symbols
                    <span className="ml-2 text-primary/70 normal-case">({selectedSymbols.length} selected)</span>
                  </Label>
                  <div className="grid grid-cols-5 gap-2">
                    {SYMBOLS.map(sym => {
                      const isSelected = selectedSymbols.includes(sym);
                      return (
                        <button
                          key={sym}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, symbol: toggleSymbol(f.symbol, sym) }))}
                          className={`py-2 px-1 rounded-lg text-[11px] font-semibold text-center transition-all border ${
                            isSelected
                              ? "bg-[#1a6bff]/20 border-[#1a6bff]/60 text-[#1a6bff] shadow-[0_0_8px_rgba(26,107,255,0.25)]"
                              : "bg-white/3 border-white/8 text-white/30 hover:border-white/20 hover:text-white/60"
                          }`}
                        >
                          {sym}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-white/50 uppercase tracking-wider mb-1.5 block">Lot Size</Label>
                  <Input
                    value={form.lotSize}
                    onChange={e => setForm(f => ({ ...f, lotSize: e.target.value }))}
                    placeholder="0.01"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-primary/50"
                  />
                </div>

                <div>
                  <Label className="text-xs text-white/50 uppercase tracking-wider mb-1.5 block">Risk Level</Label>
                  <div className="flex gap-2">
                    {(["low", "medium", "high"] as EaInputRiskLevel[]).map(level => (
                      <button
                        key={level}
                        onClick={() => setForm(f => ({ ...f, riskLevel: level }))}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider border transition-all ${
                          form.riskLevel === level
                            ? RISK_COLORS[level]
                            : "border-white/8 text-white/30 bg-white/3 hover:border-white/20 hover:text-white/50"
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>

                </>}

                <div className="flex items-center justify-between py-1">
                  <div>
                    <div className="text-sm text-white font-medium">Active Status</div>
                    <div className="text-xs text-white/40">Enable this EA to run on client accounts</div>
                  </div>
                  <button
                    aria-label="Active Status"
                    aria-pressed={form.isActive}
                    onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${form.isActive ? "bg-primary" : "bg-white/10"}`}
                  >
                    <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${form.isActive ? "translate-x-5" : ""}`} />
                  </button>
                </div>
              </div>

              {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

              <div className="flex gap-3 mt-6">
                <Button variant="outline" onClick={closeForm} className="flex-1 border-white/10 text-white/60 hover:text-white hover:bg-white/5">
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isSaving}
                  className="flex-1 bg-primary hover:bg-primary/90 text-white shadow-[0_0_20px_rgba(227,30,36,0.2)]"
                >
                  {isSaving ? "Saving..." : editingId ? "Update EA" : "Create EA"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* EA List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : !eas || eas.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
            <Bot className="w-8 h-8 text-primary/60" />
          </div>
          <h3 className="text-white font-semibold mb-2">No EAs yet</h3>
          <p className="text-white/40 text-sm mb-6 max-w-xs">Create your first Expert Advisor to start managing copy trading signals for your clients.</p>
          <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 text-white gap-2">
            <Plus className="w-4 h-4" /> Create Your First EA
          </Button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {eas.map((ea, i) => {
            const syms = getSelectedSymbols(ea.symbol);
            return (
              <motion.div
                key={ea.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className={`relative rounded-2xl border p-5 transition-all duration-300 group ${
                  ea.isActive
                    ? "border-primary/20 bg-primary/3 hover:border-primary/40 hover:bg-primary/5"
                    : "border-white/6 bg-white/2 hover:border-white/12"
                }`}
              >
                {/* Status indicator */}
                <div className="absolute top-4 right-4 flex items-center gap-1.5">
                  {ea.isActive
                    ? <><div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /><span className="text-[10px] text-green-400 font-medium uppercase tracking-wider">Active</span></>
                    : <><div className="w-1.5 h-1.5 rounded-full bg-white/20" /><span className="text-[10px] text-white/30 font-medium uppercase tracking-wider">Inactive</span></>
                  }
                </div>

                {/* Icon + name */}
                <div className="flex items-start gap-3 mb-4 pr-20">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${ea.isActive ? "bg-primary/15 border border-primary/30" : "bg-white/5 border border-white/8"}`}>
                    <Bot className={`w-5 h-5 ${ea.isActive ? "text-primary" : "text-white/30"}`} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-white text-sm truncate">{ea.name}</h3>
                    {ea.description && <p className="text-white/40 text-xs mt-0.5 line-clamp-1">{ea.description}</p>}
                  </div>
                </div>

                {/* Symbols row */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {syms.map(sym => (
                    <div key={sym} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#1a6bff]/10 border border-[#1a6bff]/25 text-[11px] text-[#1a6bff]/80 font-medium">
                      <CircleDot className="w-2.5 h-2.5" />
                      {sym}
                    </div>
                  ))}
                </div>

                <Link href={`/admin/profile?ea=${ea.id}#app-background-images`} className="mb-4 inline-block text-sm text-primary hover:underline">Manage app background images in Profile</Link>

                {/* Stats row */}
                <div className="flex items-center gap-3 mb-4 text-xs">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/4 border border-white/6">
                    <span className="text-white/40">Lot</span>
                    <span className="text-white/70 font-mono">{ea.lotSize}</span>
                  </div>
                  <div className={`px-2.5 py-1 rounded-lg border text-[10px] font-semibold uppercase tracking-wider ${RISK_COLORS[ea.riskLevel as keyof typeof RISK_COLORS]}`}>
                    {ea.riskLevel}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-3 border-t border-white/5">
                  <button
                    onClick={() => handleToggle(ea)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      ea.isActive
                        ? "bg-green-400/10 text-green-400 hover:bg-green-400/20 border border-green-400/20"
                        : "bg-white/5 text-white/40 hover:bg-white/10 border border-white/8 hover:text-white/70"
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {ea.isActive ? "Enabled" : "Disabled"}
                  </button>
                  <div className="flex gap-1 ml-auto">
                    <button
                      onClick={() => openEdit(ea)}
                      className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-all"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(ea.id)}
                      className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <SymbolPairsManager />
    </div>
  );
}
