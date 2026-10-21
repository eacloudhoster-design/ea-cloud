import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth, usePortalRedirect } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScanLine, Search, ShieldCheck, RefreshCw } from "lucide-react";

type Grant = { status: "active" | "expired" | "revoked"; creditsRemaining: number | null; expiresAt: string | null; reference: string; updatedAt: string };
type Account = { id: number; email: string; firstName: string; lastName: string; accountStatus: string; entitlement: Grant | null; access: { allowed: boolean; error?: string } };
const field = "w-full rounded-lg border border-white/15 bg-black/40 p-3 text-white";
export default function ScannerManagement() {
  usePortalRedirect();
  const { user, token } = useAuth();
  const [session, setSession] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState(""); const [page, setPage] = useState(1); const [hasMore, setHasMore] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]); const [ready, setReady] = useState<{ databaseReady: boolean; ai: { configured: boolean; error?: string } } | null>(null);
  const [editing, setEditing] = useState<Account | null>(null); const [status, setStatus] = useState<Grant["status"]>("active");
  const [credits, setCredits] = useState("10"); const [unlimited, setUnlimited] = useState(false); const [expiry, setExpiry] = useState(""); const [reference, setReference] = useState("");
  const [testFile, setTestFile] = useState<File | null>(null); const [testReport, setTestReport] = useState<{ signal: string; reasoning: string; entry: number | null; stopLoss: number | null; takeProfit: number | null } | null>(null);
  const current = useRef(0);
  useEffect(() => { current.current++; setSession(""); setAccounts([]); setEditing(null); setTestReport(null); }, [token]);
  useEffect(() => () => { current.current++; }, []);
  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`/api/superadmin/scanner/${path}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(70_000), headers: { ...init.headers, Authorization: `Bearer ${session}` } });
    const data = await response.json();
    if (!response.ok) { if (response.status === 401) setSession(""); throw new Error(data.error || "Scanner management is unavailable."); } return data;
  }, [session]);
  const refresh = useCallback(async () => {
    if (!session) return;
    const generation = ++current.current; setBusy(true); setError("");
    try { const [data, readiness] = await Promise.all([request(`users?search=${encodeURIComponent(search)}&page=${page}`), request("readiness")]); if (generation === current.current) { setAccounts(data.users); setHasMore(data.hasMore); setReady(readiness); } }
    catch (e) { if (generation === current.current) { setError((e as Error).message); setReady(null); } }
    finally { if (generation === current.current) setBusy(false); }
  }, [session, request, search, page]);
  // Search explicitly using the form; paging and session changes reload automatically.
  useEffect(() => { if (session) void refresh(); }, [session, page]);
  const unlock = async (event: FormEvent) => {
    event.preventDefault(); if (!user || busy) return; setBusy(true); setError("");
    try { const response = await fetch("/api/superadmin/scanner/session", { method: "POST", cache: "no-store", signal: AbortSignal.timeout(20_000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, password }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to verify superadmin access."); setSession(data.token); }
    catch (e) { setError((e as Error).message); } finally { setPassword(""); setBusy(false); }
  };
  const edit = (account: Account) => {
    setEditing(account); setStatus(account.entitlement?.status ?? "active"); setCredits(String(account.entitlement?.creditsRemaining ?? 10)); setUnlimited(account.entitlement ? account.entitlement.creditsRemaining === null : false);
    const date = account.entitlement?.expiresAt ? new Date(account.entitlement.expiresAt) : null;
    setExpiry(date ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16) : ""); setReference(account.entitlement?.reference ?? ""); setMessage(""); setError("");
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!editing || busy) return; setBusy(true); setError("");
    try { await request(`users/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, creditsRemaining: unlimited ? null : Number(credits), expiresAt: expiry ? new Date(expiry).toISOString() : null, reference, expectedUpdatedAt: editing.entitlement?.updatedAt ?? null }) }); setEditing(null); setMessage("Scanner access saved to PostgreSQL. Changes apply to subsequent requests immediately."); await refresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const test = async (event: FormEvent) => {
    event.preventDefault(); if (!testFile || busy) return; setBusy(true); setError(""); setTestReport(null);
    try { if (testFile.size > 2 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(testFile.type)) throw new Error("Choose a JPEG, PNG or WebP under 2 MB."); const body = new FormData(); body.append("image", testFile); body.append("strategy", "Auto"); const data = await request("test/chart", { method: "POST", body }); setTestReport(data.report); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  if (!user || user.role !== "superadmin") return null;
  return <div className="p-6 md:p-8 space-y-6 text-white">
    <header><h1 className="text-2xl font-bold text-purple-400 flex items-center gap-3"><ScanLine /> AI Scanner Management</h1><p className="text-white/50 mt-2">Manage scanner subscriptions, credits and admin grants independently of EA-hosting licences.</p></header>
    {error && <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-4">{error}</div>}
    {message && <p role="status" className="text-green-400">{message}</p>}
    {!session ? <form onSubmit={unlock} className="max-w-lg space-y-4 rounded-xl border border-purple-500/25 bg-white/5 p-6"><h2 className="font-semibold flex gap-2"><ShieldCheck /> Confirm superadmin access</h2><p className="text-sm text-white/50">Re-enter your password for {user.email}. Scanner administration uses a separate 30-minute session.</p><label className="block">Password<Input autoComplete="current-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required className={field} /></label><Button disabled={busy}>{busy ? "Verifying…" : "Unlock scanner management"}</Button></form> : <>
      <div className="flex flex-wrap gap-3 items-center text-sm"><span className={ready?.databaseReady ? "text-green-400" : "text-amber-400"}>{ready?.databaseReady ? "PostgreSQL scanner tables verified" : "Database readiness not verified"}</span><span className="text-white/50">{ready?.ai.configured ? "AI configuration present (live test below)" : ready?.ai.error ?? "AI configuration not verified"}</span><Button variant="outline" disabled={busy} onClick={() => void refresh()}><RefreshCw size={15} /> Refresh</Button><Button variant="outline" disabled={busy} onClick={async () => { try { await request("session", { method: "DELETE" }); } catch {} finally { setSession(""); setAccounts([]); setTestReport(null); } }}>Lock management</Button></div>
      <form onSubmit={e => { e.preventDefault(); if (page !== 1) setPage(1); else void refresh(); }} className="flex gap-3"><Input aria-label="Search scanner users" placeholder="Search email, name or client ID" value={search} maxLength={100} onChange={e => setSearch(e.target.value)} className={field} /><Button disabled={busy}><Search size={16} /> Search</Button></form>
      <div className="rounded-xl border border-white/10 divide-y divide-white/10">{accounts.map(account => <div key={account.id} className="p-4 flex flex-wrap gap-4 items-center"><div className="flex-1 min-w-0"><h2 className="font-semibold break-words">{account.firstName} {account.lastName}</h2><p className="text-sm text-white/50 break-all">{account.email} · #{account.id} · App: {account.accountStatus}</p><p className="text-sm text-white/70">Scanner: {account.entitlement?.status ?? "No grant"} · Credits: {account.entitlement ? account.entitlement.creditsRemaining ?? "Unlimited" : "—"} · Expires: {account.entitlement?.expiresAt ? new Date(account.entitlement.expiresAt).toLocaleString() : "No expiry"}</p><p className={`text-xs ${account.access.allowed ? "text-green-400" : "text-amber-400"}`}>{account.access.allowed ? account.entitlement?.creditsRemaining === 0 ? "Credits exhausted" : "Access active" : account.access.error}</p></div><Button variant="outline" disabled={busy} onClick={() => edit(account)}>Manage access</Button></div>)}{!accounts.length && <p className="p-6 text-white/50">{busy ? "Loading…" : "No matching app accounts."}</p>}</div>
      <div className="flex items-center gap-4"><Button disabled={busy || page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button><span>Page {page}</span><Button disabled={busy || !hasMore} onClick={() => setPage(p => p + 1)}>Next</Button></div>
      {editing && <form onSubmit={save} className="space-y-4 rounded-xl border border-purple-500/30 bg-white/5 p-6"><h2 className="text-lg font-semibold">Manage {editing.email}</h2><div className="grid sm:grid-cols-2 gap-4"><label>Status<select className={field} value={status} onChange={e => setStatus(e.target.value as Grant["status"])}><option value="active">Active / grant access</option><option value="expired">Expired</option><option value="revoked">Revoked / remove access</option></select></label><label>Scan credits (absolute remaining balance)<Input type="number" min={0} max={1000000} step={1} required={!unlimited} disabled={unlimited} value={credits} onChange={e => setCredits(e.target.value)} className={field} /></label><label>Expiration (your local time)<Input type="datetime-local" value={expiry} onChange={e => setExpiry(e.target.value)} className={field} /></label><label>Audit / subscription reference<Input value={reference} onChange={e => setReference(e.target.value)} required maxLength={300} className={field} /></label></div><label className="flex gap-2"><input type="checkbox" checked={unlimited} onChange={e => setUnlimited(e.target.checked)} /> Explicitly allow unlimited scan credits</label><p className="text-sm text-white/50">Leave expiry blank only for an indefinite grant. One credit is charged per successfully saved chart or fundamental report. Failed analyses cost no credits. Revoked access overrides credits. An already running scan may finish before an edit commits.</p><div className="flex gap-3"><Button disabled={busy}>{busy ? "Saving…" : "Save scanner access"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button></div></form>}
      <form onSubmit={test} className="space-y-4 rounded-xl border border-white/10 p-6"><h2 className="font-semibold">Superadmin scanner test</h2><p className="text-sm text-white/50">Test Gemini with your authenticated superadmin session. No client subscription or hosting licence is required. This test does not charge client credits, save a client report or submit trades.</p><input aria-label="Superadmin test chart" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setTestFile(e.target.files?.[0] ?? null)} /><Button disabled={busy || !testFile}>{busy ? "Working…" : "Analyse test chart"}</Button>{testReport && <div role="status" className="space-y-2"><strong>{testReport.signal}</strong><p>{testReport.reasoning}</p><p>Entry: {testReport.entry ?? "—"} · Stop loss: {testReport.stopLoss ?? "—"} · Take profit: {testReport.takeProfit ?? "—"}</p><p className="text-sm text-white/50">Analysis only. No order submitted.</p></div>}</form>
    </>}
  </div>;
}
