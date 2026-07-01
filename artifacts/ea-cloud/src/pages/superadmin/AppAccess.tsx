import { motion } from "framer-motion";
import { usePortalRedirect, useAuth } from "@/contexts/AuthContext";
import { useGetAppAccessRequests, useApproveAppAccess, useRejectAppAccess, getGetAppAccessRequestsQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Smartphone, Clock, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";

export default function SuperAdminAppAccess() {
  usePortalRedirect();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { data: requests, isLoading } = useGetAppAccessRequests();
  const approveMutation = useApproveAppAccess();
  const rejectMutation = useRejectAppAccess();
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetAppAccessRequestsQueryKey() });

  const handleApprove = async (id: number) => {
    await approveMutation.mutateAsync({ id });
    invalidate();
  };

  const handleReject = async (id: number) => {
    await rejectMutation.mutateAsync({ id });
    invalidate();
  };

  const handleRemove = async (id: number) => {
    setRemovingId(id);
    try {
      await fetch(`/api/superadmin/app-access/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      invalidate();
    } finally {
      setRemovingId(null);
      setConfirmDeleteId(null);
    }
  };

  const statusBadge = (status: string) => {
    if (status === "approved") return "bg-green-500/15 text-green-400 border-green-500/25";
    if (status === "rejected") return "bg-red-500/15 text-red-400 border-red-500/25";
    return "bg-amber-500/15 text-amber-400 border-amber-500/25";
  };

  const pending = requests?.filter(r => r.status === "pending") || [];

  return (
    <div className="p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-bold text-purple-400 tracking-wide">App Access</h1>
        <p className="text-white/40 text-sm mt-1">Manage mobile app access requests</p>
      </motion.div>

      {pending.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-4 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-400" />
          <span className="text-sm text-amber-300">{pending.length} request{pending.length > 1 ? "s" : ""} awaiting approval</span>
        </motion.div>
      )}

      {/* Pending */}
      {pending.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl border border-white/8 bg-white/3 mb-5 overflow-hidden">
          <div className="px-5 py-3 border-b border-white/5">
            <h3 className="font-semibold text-white text-sm">Pending Requests</h3>
          </div>
          <div className="divide-y divide-white/4">
            {pending.map((req, i) => (
              <motion.div key={req.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }} className="p-4 flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-sm font-bold text-amber-400 flex-shrink-0">
                  {req.firstName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">{req.firstName} {req.lastName}</div>
                  <div className="text-xs text-white/40">{req.email}</div>
                  <div className="text-[10px] text-white/25">{formatDistanceToNow(new Date(req.createdAt), { addSuffix: true })}</div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button size="sm" onClick={() => handleApprove(req.id)} disabled={approveMutation.isPending} className="h-8 px-3 bg-green-600/20 hover:bg-green-600/40 text-green-400 border border-green-500/25 text-xs gap-1">
                    <CheckCircle className="w-3 h-3" /> Approve
                  </Button>
                  <Button size="sm" onClick={() => handleReject(req.id)} disabled={rejectMutation.isPending} className="h-8 px-3 bg-red-600/15 hover:bg-red-600/30 text-red-400 border border-red-500/20 text-xs gap-1">
                    <XCircle className="w-3 h-3" /> Reject
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* All Requests */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/5">
          <h3 className="font-semibold text-white text-sm">All Requests</h3>
        </div>
        {isLoading ? (
          <div className="p-6 space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 bg-white/5 rounded animate-pulse" />)}</div>
        ) : (requests || []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-white/20">
            <Smartphone className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm">No app access requests yet</p>
          </div>
        ) : (
          <div className="divide-y divide-white/4">
            {(requests || []).map((req, i) => (
              <motion.div key={req.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}>
                <div className="p-4 flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-white/50 flex-shrink-0">
                    {req.firstName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white">{req.firstName} {req.lastName}</div>
                    <div className="text-xs text-white/40">{req.email}</div>
                    <div className="text-[10px] text-white/25 mt-0.5">{formatDistanceToNow(new Date(req.createdAt), { addSuffix: true })}</div>
                  </div>
                  <Badge className={`text-[10px] px-2 py-0.5 flex-shrink-0 ${statusBadge(req.status)}`}>{req.status}</Badge>
                  {req.copyingEnabled != null && (
                    <Badge className={`text-[10px] px-2 py-0.5 flex-shrink-0 ${req.copyingEnabled ? "bg-green-500/15 text-green-400 border-green-500/25" : "bg-amber-500/15 text-amber-400 border-amber-500/25"}`}>
                      {req.copyingEnabled ? "ACTIVE" : "PAUSED"}
                    </Badge>
                  )}

                  {confirmDeleteId === req.id ? (
                    <div className="flex gap-1.5 flex-shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleRemove(req.id)}
                        disabled={removingId === req.id}
                        className="h-7 px-2.5 bg-red-600/30 hover:bg-red-600/50 text-red-400 border border-red-500/30 text-xs"
                      >
                        {removingId === req.id ? "..." : "Confirm"}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setConfirmDeleteId(null)}
                        className="h-7 px-2.5 bg-white/5 hover:bg-white/10 text-white/50 border border-white/10 text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => setConfirmDeleteId(req.id)}
                      className="h-7 w-7 p-0 flex-shrink-0 bg-red-600/10 hover:bg-red-600/25 text-red-400/60 hover:text-red-400 border border-red-500/15 hover:border-red-500/30"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
