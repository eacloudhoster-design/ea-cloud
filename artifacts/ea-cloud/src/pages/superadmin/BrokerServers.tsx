import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePortalRedirect } from "@/contexts/AuthContext";
import {
  useGetPublicBrokerServers,
  useSuperAdminListBrokerServers,
  useSuperAdminAddBrokerServer,
  useSuperAdminUpdateBrokerServer,
  useSuperAdminDeleteBrokerServer,
  getGetPublicBrokerServersQueryKey,
  getSuperAdminListBrokerServersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, ShieldCheck, Server, Wifi, WifiOff, Search, Loader2 } from "lucide-react";

type ServerType = "live" | "demo";
type FilterTab = "all" | "live" | "demo";

interface FormState {
  brokerName: string;
  serverName: string;
  serverType: ServerType;
}

const BROKER_OPTIONS = ["Exness", "JustMarkets", "Profin Wealth", "RCGMarkets"];

export default function SuperAdminBrokerServers() {
  usePortalRedirect();
  const queryClient = useQueryClient();
  const { data: servers = [], isLoading } = useSuperAdminListBrokerServers();

  const addMutation = useSuperAdminAddBrokerServer();
  const updateMutation = useSuperAdminUpdateBrokerServer();
  const deleteMutation = useSuperAdminDeleteBrokerServer();

  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<(typeof servers)[0] | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState>({ brokerName: "", serverName: "", serverType: "live" });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getSuperAdminListBrokerServersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetPublicBrokerServersQueryKey() });
  };

  const filtered = servers.filter(s => {
    const matchTab = filterTab === "all" || s.serverType === filterTab;
    const matchSearch = !search ||
      s.brokerName.toLowerCase().includes(search.toLowerCase()) ||
      s.serverName.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  // Group by broker
  const grouped = filtered.reduce<Record<string, typeof servers>>((acc, s) => {
    if (!acc[s.brokerName]) acc[s.brokerName] = [];
    acc[s.brokerName].push(s);
    return acc;
  }, {});

  const handleAdd = async () => {
    if (!form.brokerName || !form.serverName) return;
    await addMutation.mutateAsync({ data: form });
    setAddOpen(false);
    setForm({ brokerName: "", serverName: "", serverType: "live" });
    invalidate();
  };

  const handleUpdate = async () => {
    if (!editItem) return;
    await updateMutation.mutateAsync({ id: editItem.id, data: { brokerName: editItem.brokerName, serverName: editItem.serverName, serverType: editItem.serverType, isActive: editItem.isActive } });
    setEditItem(null);
    invalidate();
  };

  const handleToggle = async (id: number, isActive: boolean) => {
    await updateMutation.mutateAsync({ id, data: { isActive: !isActive } });
    invalidate();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this server from the whitelist?")) return;
    await deleteMutation.mutateAsync({ id });
    invalidate();
  };

  const liveCount = servers.filter(s => s.serverType === "live" && s.isActive).length;
  const demoCount = servers.filter(s => s.serverType === "demo" && s.isActive).length;
  const inactiveCount = servers.filter(s => !s.isActive).length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <ShieldCheck className="w-6 h-6 text-purple-400" />
          <h1 className="text-2xl font-bold text-white">Broker Whitelist</h1>
        </div>
        <p className="text-white/40 text-sm">Manage approved MT5 brokers and servers. Only whitelisted servers can connect to EA Cloud.</p>
      </motion.div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Live Servers", value: liveCount, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
          { label: "Demo Servers", value: demoCount, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
          { label: "Disabled", value: inactiveCount, color: "text-white/40", bg: "bg-white/5 border-white/10" },
        ].map(stat => (
          <div key={stat.label} className={`rounded-xl p-4 border ${stat.bg} bg-white/3`}>
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-white/40 text-sm mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search broker or server…"
            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30"
          />
        </div>
        <Tabs value={filterTab} onValueChange={v => setFilterTab(v as FilterTab)}>
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger value="all" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">All</TabsTrigger>
            <TabsTrigger value="live" className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-300">Live</TabsTrigger>
            <TabsTrigger value="demo" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300">Demo</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          onClick={() => setAddOpen(true)}
          className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30"
        >
          <Plus className="w-4 h-4 mr-2" /> Add Server
        </Button>
      </div>

      {/* Server list grouped by broker */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-20 text-white/30">
          <Server className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No servers found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([brokerName, brokerServers]) => (
            <motion.div
              key={brokerName}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-white/8 bg-white/3 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-400" />
                  <span className="font-semibold text-white">{brokerName}</span>
                  <span className="text-white/30 text-sm">({brokerServers.length} servers)</span>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className="text-green-400">{brokerServers.filter(s => s.serverType === "live").length} live</span>
                  <span className="text-white/20">·</span>
                  <span className="text-blue-400">{brokerServers.filter(s => s.serverType === "demo").length} demo</span>
                </div>
              </div>
              <div className="divide-y divide-white/5">
                {brokerServers.map(server => (
                  <div key={server.id} className="px-4 py-3 flex items-center justify-between group hover:bg-white/3 transition-colors">
                    <div className="flex items-center gap-3">
                      <Server className={`w-4 h-4 flex-shrink-0 ${server.isActive ? "text-white/40" : "text-white/15"}`} />
                      <span className={`text-sm font-mono ${server.isActive ? "text-white" : "text-white/25 line-through"}`}>
                        {server.serverName}
                      </span>
                      <Badge className={`text-[10px] px-1.5 py-0 border ${
                        server.serverType === "live"
                          ? "bg-green-500/15 text-green-400 border-green-500/25"
                          : "bg-blue-500/15 text-blue-400 border-blue-500/25"
                      }`}>
                        {server.serverType}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleToggle(server.id, server.isActive)}
                        className={`p-1.5 rounded-lg transition-colors ${server.isActive ? "hover:bg-amber-500/10 text-amber-400/60 hover:text-amber-400" : "hover:bg-green-500/10 text-white/20 hover:text-green-400"}`}
                        title={server.isActive ? "Disable" : "Enable"}
                      >
                        {server.isActive ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => setEditItem({ ...server })}
                        className="p-1.5 rounded-lg hover:bg-purple-500/10 text-white/30 hover:text-purple-300 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(server.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-[#0d0d18] border border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-purple-400" /> Add Server to Whitelist
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-white/60 text-xs uppercase tracking-wider">Broker</Label>
              <div className="relative">
                <select
                  value={form.brokerName}
                  onChange={e => setForm(f => ({ ...f, brokerName: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2.5 text-sm bg-white/5 border border-white/10 text-white appearance-none focus:outline-none focus:border-purple-500/50"
                >
                  <option value="">Select broker or type below</option>
                  {BROKER_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <Input
                value={form.brokerName}
                onChange={e => setForm(f => ({ ...f, brokerName: e.target.value }))}
                placeholder="Or type broker name…"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/60 text-xs uppercase tracking-wider">Server Name</Label>
              <Input
                value={form.serverName}
                onChange={e => setForm(f => ({ ...f, serverName: e.target.value }))}
                placeholder="e.g. Exness-MT5Real"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/60 text-xs uppercase tracking-wider">Server Type</Label>
              <div className="flex gap-2">
                {(["live", "demo"] as ServerType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setForm(f => ({ ...f, serverType: t }))}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${form.serverType === t
                      ? t === "live" ? "bg-green-500/20 border-green-500/40 text-green-300" : "bg-blue-500/20 border-blue-500/40 text-blue-300"
                      : "bg-white/5 border-white/10 text-white/40"
                    }`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <Button
              onClick={handleAdd}
              disabled={!form.brokerName || !form.serverName || addMutation.isPending}
              className="w-full bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/30"
            >
              {addMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Add to Whitelist
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <AnimatePresence>
        {editItem && (
          <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
            <DialogContent className="bg-[#0d0d18] border border-white/10 text-white max-w-md">
              <DialogHeader>
                <DialogTitle className="text-white flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-purple-400" /> Edit Server
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-1.5">
                  <Label className="text-white/60 text-xs uppercase tracking-wider">Broker</Label>
                  <Input
                    value={editItem.brokerName}
                    onChange={e => setEditItem(ei => ei ? { ...ei, brokerName: e.target.value } : null)}
                    className="bg-white/5 border-white/10 text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/60 text-xs uppercase tracking-wider">Server Name</Label>
                  <Input
                    value={editItem.serverName}
                    onChange={e => setEditItem(ei => ei ? { ...ei, serverName: e.target.value } : null)}
                    className="bg-white/5 border-white/10 text-white font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/60 text-xs uppercase tracking-wider">Server Type</Label>
                  <div className="flex gap-2">
                    {(["live", "demo"] as ServerType[]).map(t => (
                      <button
                        key={t}
                        onClick={() => setEditItem(ei => ei ? { ...ei, serverType: t } : null)}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${editItem.serverType === t
                          ? t === "live" ? "bg-green-500/20 border-green-500/40 text-green-300" : "bg-blue-500/20 border-blue-500/40 text-blue-300"
                          : "bg-white/5 border-white/10 text-white/40"
                        }`}
                      >
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditItem(null)} className="flex-1 border-white/10 text-white/60 bg-transparent hover:bg-white/5">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleUpdate}
                    disabled={updateMutation.isPending}
                    className="flex-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/30"
                  >
                    {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>
    </div>
  );
}
