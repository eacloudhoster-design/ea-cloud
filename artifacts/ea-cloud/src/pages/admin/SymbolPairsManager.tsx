import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useGetSymbolPairs,
  useCreateSymbolPair,
  useUpdateSymbolPair,
  useDeleteSymbolPair,
  getGetSymbolPairsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Layers, Plus, Trash2, Pencil, X, Tag } from "lucide-react";

type FormState = { pairName: string; variations: string; isActive: boolean };
const defaultForm: FormState = { pairName: "", variations: "", isActive: true };

function parseVariations(v: string): string[] {
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

export default function SymbolPairsManager() {
  const queryClient = useQueryClient();
  const { data: pairs, isLoading } = useGetSymbolPairs();
  const createMutation = useCreateSymbolPair();
  const updateMutation = useUpdateSymbolPair();
  const deleteMutation = useDeleteSymbolPair();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [error, setError] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetSymbolPairsQueryKey() });

  const openCreate = () => { setEditingId(null); setForm(defaultForm); setError(""); setShowForm(true); };
  const openEdit = (p: NonNullable<typeof pairs>[0]) => {
    setEditingId(p.id);
    setForm({ pairName: p.pairName, variations: p.variations, isActive: p.isActive });
    setError("");
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(defaultForm); setError(""); };

  const handleSubmit = async () => {
    if (!form.pairName.trim()) { setError("Pair name is required"); return; }
    setError("");
    try {
      if (editingId !== null) {
        await updateMutation.mutateAsync({ id: editingId, data: { ...form } });
      } else {
        await createMutation.mutateAsync({ data: { ...form } });
      }
      invalidate();
      closeForm();
    } catch (err: unknown) {
      setError((err as { data?: { error?: string } })?.data?.error ?? "Failed to save pair");
    }
  };

  const handleDelete = async (id: number) => {
    try { await deleteMutation.mutateAsync({ id }); invalidate(); } catch { }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="mt-12">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#1a6bff]/15 border border-[#1a6bff]/30 flex items-center justify-center">
            <Layers className="w-5 h-5 text-[#1a6bff]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-wide">Broker Symbol Variations</h2>
            <p className="text-white/40 text-sm mt-0.5">Map each trading pair to the broker-specific symbol names clients can choose from</p>
          </div>
        </div>
        <Button onClick={openCreate} className="bg-[#1a6bff] hover:bg-[#1a6bff]/90 text-white gap-2 shadow-[0_0_20px_rgba(26,107,255,0.3)]">
          <Plus className="w-4 h-4" /> New Pair
        </Button>
      </motion.div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={(e) => e.target === e.currentTarget && closeForm()}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-lg bg-[#0e0e1a] border border-white/10 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#1a6bff]/15 border border-[#1a6bff]/30 flex items-center justify-center">
                    <Layers className="w-5 h-5 text-[#1a6bff]" />
                  </div>
                  <div>
                    <h2 className="font-bold text-white">{editingId ? "Edit Pair" : "New Trading Pair"}</h2>
                    <p className="text-xs text-white/40">Broker symbol configuration</p>
                  </div>
                </div>
                <button onClick={closeForm} className="text-white/30 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-white/50 uppercase tracking-wider mb-1.5 block">Pair Name *</Label>
                  <Input
                    value={form.pairName}
                    onChange={(e) => setForm((f) => ({ ...f, pairName: e.target.value }))}
                    placeholder="e.g. XAUUSD"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-[#1a6bff]/50 font-mono"
                  />
                  <p className="text-[11px] text-white/30 mt-1.5">The canonical name your signals use (matches the symbol in your trade signals).</p>
                </div>

                <div>
                  <Label className="text-xs text-white/50 uppercase tracking-wider mb-1.5 block">Broker Variations</Label>
                  <Input
                    value={form.variations}
                    onChange={(e) => setForm((f) => ({ ...f, variations: e.target.value }))}
                    placeholder="XAUUSDm, XAUUSD.m, XAUUSD"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-[#1a6bff]/50 font-mono"
                  />
                  <p className="text-[11px] text-white/30 mt-1.5">Comma-separated symbol names across brokers. Clients pick their broker's spelling from this list.</p>
                  {parseVariations(form.variations).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {parseVariations(form.variations).map((v) => (
                        <span key={v} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#1a6bff]/10 border border-[#1a6bff]/25 text-[11px] text-[#1a6bff]/80 font-mono">
                          <Tag className="w-2.5 h-2.5" /> {v}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between py-1">
                  <div>
                    <div className="text-sm text-white font-medium">Active</div>
                    <div className="text-xs text-white/40">Offer this pair to your clients</div>
                  </div>
                  <button
                    onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${form.isActive ? "bg-[#1a6bff]" : "bg-white/10"}`}
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
                <Button onClick={handleSubmit} disabled={isSaving} className="flex-1 bg-[#1a6bff] hover:bg-[#1a6bff]/90 text-white shadow-[0_0_20px_rgba(26,107,255,0.2)]">
                  {isSaving ? "Saving..." : editingId ? "Update Pair" : "Create Pair"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-[#1a6bff]/30 border-t-[#1a6bff] rounded-full animate-spin" />
        </div>
      ) : !pairs || pairs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center rounded-2xl border border-white/6 bg-white/2">
          <div className="w-14 h-14 rounded-2xl bg-[#1a6bff]/10 border border-[#1a6bff]/20 flex items-center justify-center mb-3">
            <Layers className="w-7 h-7 text-[#1a6bff]/60" />
          </div>
          <h3 className="text-white font-semibold mb-1.5">No trading pairs yet</h3>
          <p className="text-white/40 text-sm mb-5 max-w-sm">Add a pair and its broker symbol variations so clients can map them to their own broker.</p>
          <Button onClick={openCreate} className="bg-[#1a6bff] hover:bg-[#1a6bff]/90 text-white gap-2">
            <Plus className="w-4 h-4" /> Add Your First Pair
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {pairs.map((p, i) => {
            const vars = parseVariations(p.variations);
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className={`relative rounded-2xl border p-5 transition-all duration-300 ${
                  p.isActive ? "border-[#1a6bff]/20 bg-[#1a6bff]/3 hover:border-[#1a6bff]/40" : "border-white/6 bg-white/2 hover:border-white/12"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white font-mono">{p.pairName}</span>
                    {p.isActive
                      ? <span className="text-[10px] text-green-400 font-medium uppercase tracking-wider">Active</span>
                      : <span className="text-[10px] text-white/30 font-medium uppercase tracking-wider">Inactive</span>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-all">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {vars.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {vars.map((v) => (
                      <span key={v} className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[11px] text-white/60 font-mono">{v}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-white/30 text-xs italic">No variations added yet</p>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
