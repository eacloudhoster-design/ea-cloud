import { useState } from "react";
import { motion } from "framer-motion";
import { usePortalRedirect } from "@/contexts/AuthContext";
import { useGetClients } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, User, Wifi, WifiOff } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function AdminClients() {
  usePortalRedirect();
  const { data: clients, isLoading } = useGetClients();
  const [search, setSearch] = useState("");

  const filtered = clients?.filter(c =>
    c.email.toLowerCase().includes(search.toLowerCase()) ||
    (c.licenseKey || "").toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <div className="p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-bold text-primary tracking-wide">My Clients</h1>
        <p className="text-white/40 text-sm mt-1">View and manage clients using your license keys</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="relative mb-5 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by Email or License Key..." className="pl-10 bg-white/3 border-white/8 text-white placeholder:text-white/20 h-10" />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 bg-white/5 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-white/20">
            <User className="w-12 h-12 mb-4 opacity-30" />
            <p className="font-medium text-white/30">No clients found.</p>
            <p className="text-sm mt-1">Clients who use your License Keys will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left text-[11px] text-white/30 uppercase tracking-wider px-5 py-3 font-medium">Client</th>
                  <th className="text-left text-[11px] text-white/30 uppercase tracking-wider px-4 py-3 font-medium hidden sm:table-cell">License Key</th>
                  <th className="text-left text-[11px] text-white/30 uppercase tracking-wider px-4 py-3 font-medium hidden md:table-cell">Broker</th>
                  <th className="text-left text-[11px] text-white/30 uppercase tracking-wider px-4 py-3 font-medium">Status</th>
                  <th className="text-left text-[11px] text-white/30 uppercase tracking-wider px-4 py-3 font-medium">Copy Trading</th>
                  <th className="text-left text-[11px] text-white/30 uppercase tracking-wider px-4 py-3 font-medium hidden lg:table-cell">Last Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/4">
                {filtered.map((client, i) => (
                  <motion.tr
                    key={client.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="hover:bg-white/2 transition-colors group"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-white/50">
                          {client.email[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">{client.firstName || ""} {client.lastName || ""}</div>
                          <div className="text-xs text-white/40">{client.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 hidden sm:table-cell">
                      <code className="text-xs text-primary/60 font-mono">{client.licenseKey || "—"}</code>
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <span className="text-sm text-white/50">{client.connectedBroker || "—"}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        {client.status === "active"
                          ? <><Wifi className="w-3 h-3 text-green-400" /><Badge className="bg-green-500/15 text-green-400 border-green-500/25 text-[10px]">Active</Badge></>
                          : <><WifiOff className="w-3 h-3 text-white/30" /><Badge className="bg-white/5 text-white/40 border-white/10 text-[10px]">Inactive</Badge></>
                        }
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      {client.copyingEnabled == null
                        ? <span className="text-white/20 text-xs">—</span>
                        : client.copyingEnabled
                          ? <Badge className="bg-green-500/15 text-green-400 border-green-500/25 text-[10px]">ACTIVE</Badge>
                          : <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/25 text-[10px]">PAUSED</Badge>}
                    </td>
                    <td className="px-4 py-3.5 hidden lg:table-cell">
                      <span className="text-xs text-white/30">
                        {client.lastActive ? formatDistanceToNow(new Date(client.lastActive), { addSuffix: true }) : "Never"}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
