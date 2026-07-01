import { useState } from "react";
import { motion } from "framer-motion";
import { usePortalRedirect } from "@/contexts/AuthContext";
import { useGetSuperAdminMentors, useApproveMentor, useRejectMentor, useSuspendMentor, useIssueMentorStrike, useRemoveMentor, useUpdateMentorLicenseLimit, getGetSuperAdminMentorsQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, XCircle, PauseCircle, AlertTriangle, Trash2, Settings, Search, Loader2, ChevronUp, ChevronDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatDistanceToNow } from "date-fns";

type TabVal = "all" | "pending" | "approved" | "rejected";

export default function SuperAdminMentors() {
  usePortalRedirect();
  const queryClient = useQueryClient();
  const { data: mentors, isLoading } = useGetSuperAdminMentors();
  const approveMutation = useApproveMentor();
  const rejectMutation = useRejectMentor();
  const suspendMutation = useSuspendMentor();
  const strikeMutation = useIssueMentorStrike();
  const removeMutation = useRemoveMentor();
  const limitMutation = useUpdateMentorLicenseLimit();
  const [tab, setTab] = useState<TabVal>("all");
  const [search, setSearch] = useState("");
  const [limitModal, setLimitModal] = useState<{ id: number; current: number } | null>(null);
  const [newLimit, setNewLimit] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetSuperAdminMentorsQueryKey() });

  const filtered = (mentors || []).filter(m => {
    const matchTab = tab === "all" || m.status === tab;
    const matchSearch = !search || m.email.toLowerCase().includes(search.toLowerCase()) || (m.mentorName || "").toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      approved: "bg-green-500/15 text-green-400 border-green-500/25",
      pending: "bg-amber-500/15 text-amber-400 border-amber-500/25",
      rejected: "bg-red-500/15 text-red-400 border-red-500/25",
      suspended: "bg-orange-500/15 text-orange-400 border-orange-500/25",
      disabled: "bg-white/10 text-white/30 border-white/10",
    };
    return map[status] || "bg-white/10 text-white/30";
  };

  const handleAction = async (action: string, id: number) => {
    try {
      switch (action) {
        case "approve": await approveMutation.mutateAsync({ id }); break;
        case "reject": await rejectMutation.mutateAsync({ id, data: { reason: "Rejected by admin" } }); break;
        case "suspend": await suspendMutation.mutateAsync({ id }); break;
        case "strike": await strikeMutation.mutateAsync({ id, data: { reason: "Strike issued by super admin" } }); break;
        case "remove": if (confirm("Permanently remove this mentor?")) { await removeMutation.mutateAsync({ id }); } break;
      }
      invalidate();
    } catch {}
  };

  return (
    <div className="p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl font-bold text-purple-400 tracking-wide">Mentors</h1>
        <p className="text-white/40 text-sm mt-1">Manage all mentor accounts on the platform</p>
      </motion.div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <Tabs value={tab} onValueChange={v => setTab(v as TabVal)} className="flex-1">
          <TabsList className="bg-white/5 border border-white/8 p-1">
            {(["all", "pending", "approved", "rejected"] as TabVal[]).map(t => (
              <TabsTrigger key={t} value={t} className="text-xs capitalize data-[state=active]:bg-purple-600/30 data-[state=active]:text-purple-300 text-white/40">
                {t}
                {t === "pending" && (mentors?.filter(m => m.status === "pending").length || 0) > 0 && (
                  <span className="ml-1.5 w-4 h-4 rounded-full bg-amber-500/30 text-amber-400 text-[9px] flex items-center justify-center">
                    {mentors?.filter(m => m.status === "pending").length}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search mentors..." className="pl-9 bg-white/3 border-white/8 text-white placeholder:text-white/20 h-9 text-sm" />
        </div>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="rounded-xl border border-white/8 bg-white/2 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-white/5 rounded-lg animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-white/20 text-sm">No mentors found</div>
        ) : (
          <div className="divide-y divide-white/4">
            {filtered.map((mentor, i) => (
              <motion.div
                key={mentor.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="p-4 hover:bg-white/2 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-purple-500/15 border border-purple-500/25 flex items-center justify-center text-sm font-bold text-purple-400 flex-shrink-0">
                      {(mentor.firstName || mentor.email)[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white">{mentor.firstName} {mentor.lastName}</span>
                        <Badge className={`text-[10px] px-2 py-0 ${statusBadge(mentor.status)}`}>{mentor.status}</Badge>
                        {mentor.strikes > 0 && (
                          <Badge className="text-[10px] px-2 py-0 bg-red-500/15 text-red-400 border-red-500/25">
                            {mentor.strikes} strike{mentor.strikes > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-white/40 truncate">{mentor.email} · {mentor.mentorName || "No mentor name"}</div>
                      <div className="text-[10px] text-white/25 mt-0.5">
                        {mentor.totalLicenses} licenses · {mentor.activeClients} clients · Limit: {mentor.licenseLimit}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {mentor.status === "pending" && (
                      <>
                        <Button size="sm" onClick={() => handleAction("approve", mentor.id)} disabled={approveMutation.isPending} className="h-7 px-3 bg-green-600/20 hover:bg-green-600/40 text-green-400 border border-green-500/25 text-xs gap-1">
                          <CheckCircle className="w-3 h-3" /> Approve
                        </Button>
                        <Button size="sm" onClick={() => handleAction("reject", mentor.id)} disabled={rejectMutation.isPending} className="h-7 px-3 bg-red-600/15 hover:bg-red-600/30 text-red-400 border border-red-500/20 text-xs gap-1">
                          <XCircle className="w-3 h-3" /> Reject
                        </Button>
                      </>
                    )}
                    {mentor.status === "approved" && (
                      <>
                        <Button size="sm" onClick={() => handleAction("suspend", mentor.id)} disabled={suspendMutation.isPending} className="h-7 px-3 bg-orange-600/15 hover:bg-orange-600/30 text-orange-400 border border-orange-500/20 text-xs gap-1">
                          <PauseCircle className="w-3 h-3" /> Suspend
                        </Button>
                        <Button size="sm" onClick={() => handleAction("strike", mentor.id)} disabled={strikeMutation.isPending} className="h-7 px-3 bg-amber-600/15 hover:bg-amber-600/30 text-amber-400 border border-amber-500/20 text-xs gap-1">
                          <AlertTriangle className="w-3 h-3" /> Strike
                        </Button>
                      </>
                    )}
                    <Button size="sm" onClick={() => { setLimitModal({ id: mentor.id, current: mentor.licenseLimit }); setNewLimit(String(mentor.licenseLimit)); }} className="h-7 px-2 bg-blue-600/15 hover:bg-blue-600/30 text-blue-400 border border-blue-500/20 text-xs">
                      <Settings className="w-3 h-3" />
                    </Button>
                    <Button size="sm" onClick={() => handleAction("remove", mentor.id)} disabled={removeMutation.isPending} className="h-7 px-2 bg-red-600/10 hover:bg-red-600/25 text-red-500/60 hover:text-red-400 border border-red-500/10 text-xs">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* License Limit Modal */}
      <Dialog open={!!limitModal} onOpenChange={() => setLimitModal(null)}>
        <DialogContent className="bg-[#0e0e18] border border-purple-500/25 text-white">
          <DialogHeader>
            <DialogTitle className="text-purple-300">Update License Limit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-white/60 text-xs mb-2 block">Current Limit: {limitModal?.current}</Label>
              <div className="flex gap-2">
                <Input value={newLimit} onChange={e => setNewLimit(e.target.value)} type="number" min="0" className="bg-white/5 border-purple-500/25 text-white h-10" />
                <Button size="sm" onClick={() => { setNewLimit(String(Math.max(0, parseInt(newLimit || "0") - 10))); }} className="h-10 px-3 bg-white/5 border border-white/10 text-white/60">
                  <ChevronDown className="w-4 h-4" />
                </Button>
                <Button size="sm" onClick={() => { setNewLimit(String(parseInt(newLimit || "0") + 10)); }} className="h-10 px-3 bg-white/5 border border-white/10 text-white/60">
                  <ChevronUp className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <Button onClick={async () => {
              if (!limitModal) return;
              await limitMutation.mutateAsync({ id: limitModal.id, data: { limit: parseInt(newLimit) } });
              invalidate();
              setLimitModal(null);
            }} disabled={limitMutation.isPending} className="w-full bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/30">
              {limitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update Limit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
