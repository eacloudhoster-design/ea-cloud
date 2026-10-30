import { useEffect, useRef, useState } from "react";
import { useGetProfile, useGetEas } from "@workspace/api-client-react";
import { usePortalRedirect } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Download,
  Copy,
  Loader2,
  ImagePlus,
  AlertCircle,
  X,
} from "lucide-react";
import Mt5ConnectInput from "@/components/Mt5ConnectInput";
import "./SetupMethod.css";

type Capture = {
  eventId: string;
  receivedAt: string;
  copyState?: string;
  queueStatus?: string | null;
  queueError?: string | null;
  signalId?: number | null;
  payload: {
    kind: string;
    entry: string;
    symbol: string;
    side: string;
    volume: number;
  };
};
type Config = {
  origin: string;
  legacyIngestion: string;
  strategyAvailable: boolean;
  blocker: string;
};
type Robot = {
  id: string;
  name: string;
  mode?: string;
  copyEnabled?: boolean;
  sourceMagic?: string;
  historyHealthy?: boolean;
  revokedAt: string | null;
  lastSeenAt: string | null;
  lastEventAt: string | null;
  sourceAccount: string | null;
  sourceServer: string | null;
};
const request = async (path: string, init: RequestInit = {}) => {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw Error(data.error || `Request failed (HTTP ${response.status})`);
  }
  return response;
};
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export default function SetupMethod() {
  usePortalRedirect();
  const { data: profile } = useGetProfile(),
    { data: eas } = useGetEas();
  const [config, setConfig] = useState<Config | null>(null),
    [robots, setRobots] = useState<Robot[]>([]),
    [error, setError] = useState(""),
    [listError, setListError] = useState("");
  const [open, setOpen] = useState(false),
    [eaId, setEaId] = useState(0),
    [name, setName] = useState(""),
    [manager, setManager] = useState(""),
    [sourceMagic, setSourceMagic] = useState("12345"),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [copied, setCopied] = useState(false);
  const [events, setEvents] = useState<Record<string, Capture[] | undefined>>(
    {},
  );
  const seeded = useRef(false),
    pending = useRef(false);
  useEffect(() => {
    if (profile && !seeded.current) {
      setName(profile.robotName || "");
      setManager(
        profile.mentorName ||
          [profile.firstName, profile.lastName].filter(Boolean).join(" "),
      );
      seeded.current = true;
    }
  }, [profile]);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const loadRobots = async () => {
    try {
      const data = await (await request("/api/admin/ea-builder/robots")).json();
      setRobots(data.robots);
      setListError("");
    } catch (err) {
      setListError((err as Error).message);
    }
  };
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    void request("/api/admin/ea-builder/config", { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (alive) setConfig(data);
      })
      .catch((err) => {
        if (alive) setError(err.message);
      });
    void loadRobots();
    const timer = setInterval(() => {
      if (!document.hidden) void loadRobots();
    }, 20000);
    return () => {
      alive = false;
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  const selected = eaId || eas?.[0]?.id || 0;
  const generate = async (
    purpose: "trading" | "integration-toolkit" | "existing-observer",
  ) => {
    if (pending.current) return;
    setError("");
    setMessage("");
    if (!selected || !name.trim() || !manager.trim()) {
      setError("Choose an EA and enter an EA name and manager name.");
      return;
    }
    if (file && file.size > 10 * 1024 * 1024) {
      setError("Background must be 10MB or smaller.");
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      const data = new FormData();
      data.set("eaId", String(selected));
      data.set("name", name);
      data.set("managerName", manager);
      data.set("purpose", purpose);
      data.set("sourceMagic", sourceMagic);
      if (file) data.set("background", file);
      const response = await request("/api/admin/ea-builder/package", {
        method: "POST",
        body: data,
      });
      if (!response.headers.get("Content-Type")?.includes("application/zip"))
        throw Error("The API did not return an installation package.");
      const blob = await response.blob();
      if (!blob.size) throw Error("The package is empty. Please retry.");
      download(
        blob,
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ||
          "EACloud_Integration_Toolkit.zip",
      );
      setMessage(
        "Observer package downloaded. Keep the original EA unchanged on Chart 1; install the observer on Chart 2. Copying stays disabled until verified and explicitly enabled.",
      );
      await loadRobots();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const copier = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await request("/api/admin/copier/download");
      download(
        await response.blob(),
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] || "EACloud_Copier.mq5",
      );
      setMessage(
        "Existing trade copier downloaded. Compile and test it on a demo account; download does not prove connection or execution.",
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const guide = () => {
    if (!config) return;
    download(
      new Blob(
        [
          `EA CLOUD — EXISTING TRADE COPIER INSTALLATION\n\n1. MT5 File → Open Data Folder. Place the downloaded MQ5 in MQL5/Experts.\n2. Open MetaEditor (F4), then compile the source with F7. Compilation is unverified here.\n3. Tools → Options → Expert Advisors → Allow WebRequest for listed URL: add ${config.origin}.\n4. Attach one copier to a demo account/chart. Enable its permissions as needed.\n5. The copier uses /api/signals/challenge, /register-account and /heartbeat. Ingestion is ${config.legacyIngestion}. Check Experts/Journal and verified accounts below. A configured URL is not proof of connectivity.\n6. Confirm actual trade and client execution acknowledgements before considering live use. The existing copier does not fully cover partial closes, netting reversals or SL/TP changes and lacks source-event deduplication. Never run multiple broadcasters for a source account.\n7. The legacy file contains your existing mentor API credential: keep it private. This download does not rotate/change that credential.\n8. If registration fails, check the exact broker/server whitelist and account approval; do not bypass verification. Offline events may be lost by this legacy copier.\n9. Do not attach the legacy copier alongside the new capture observer on the same account without a deliberate demo test plan.\n`,
        ],
        { type: "text/plain" },
      ),
      "EACloud_Copier_INSTALLATION_GUIDE.txt",
    );
  };
  return (
    <div className="ea-setup p-6 md:p-8">
      <h1 className="text-2xl font-bold text-primary">Setup Methods</h1>
      <p className="text-sm text-white/50 mt-2 mb-6">
        Customise MT5 branding and manage your trade-broadcasting tools.
      </p>
      {error && (
        <p role="alert" className="ea-setup-alert">
          <AlertCircle aria-hidden="true" />
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="ea-setup-status">
          {message}
        </p>
      )}
      <div className="ea-setup-options">
        <section className="ea-setup-card">
          <h2>CONNECT EXISTING EA / CREATE CUSTOM EA</h2>
          <p>
            Create your personalised MetaTrader 5 trading robot with custom
            branding and integrated EA Cloud trade broadcasting.
          </p>
          <Button onClick={() => setOpen((v) => !v)}>
            {open ? "Close customisation" : "Create EA"}
          </Button>
          {open && (
            <div className="ea-setup-form">
              <div className="ea-setup-alert" role="note">
                {config?.blocker || "Loading verified template availability…"}{" "}
                Connect Existing EA observes your compiled EX5 from a separate
                chart. Create Custom EA requires complete source; it remains
                blocked. The observer never places source-account orders.
              </div>
              <label htmlFor="setup-ea">Existing EA</label>
              <select
                id="setup-ea"
                value={selected}
                onChange={(e) => setEaId(Number(e.target.value))}
                disabled={busy}
              >
                {!eas?.length && (
                  <option value={0}>Create an EA in EA Manager first</option>
                )}
                {eas?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <Label htmlFor="setup-name">EA Name</Label>
              <Input
                id="setup-name"
                placeholder="Enter your robot name"
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
              />
              <Label htmlFor="setup-manager">EA Manager</Label>
              <Input
                id="setup-manager"
                placeholder="Enter manager name"
                maxLength={80}
                value={manager}
                onChange={(e) => setManager(e.target.value)}
                disabled={busy}
              />
              <Label htmlFor="setup-image">Upload MT5 Chart Background</Label>
              <p>
                Upload a background image for your MetaTrader 5 desktop trading
                chart.
              </p>
              <p className="text-red-200">
                This background is for MetaTrader 5 desktop only. It does not
                change your EA Cloud mobile app background.
              </p>
              <div className="ea-setup-preview">
                {preview ? (
                  <img src={preview} alt="MT5 chart background preview" />
                ) : (
                  <ImagePlus aria-label="No MT5 background selected" />
                )}
              </div>
              <input
                id="setup-image"
                type="file"
                accept=".png,.jpg,.jpeg,.bmp,image/png,image/jpeg,image/bmp"
                disabled={busy}
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  e.target.value = "";
                }}
              />
              {file && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setFile(null)}
                >
                  <X size={16} />
                  Remove background
                </Button>
              )}
              <p>
                PNG, JPG or uncompressed 24/32-bit BMP · up to 10MB/12
                megapixels. Server converts to a bounded 24-bit BMP.
              </p>
              <Label htmlFor="observer-magic">
                Verified source magic number
              </Label>
              <Input
                id="observer-magic"
                value={sourceMagic}
                onChange={(e) => setSourceMagic(e.target.value)}
                inputMode="numeric"
                disabled={busy}
              />
              <p>
                12345 is a reference only. Verify the nonzero magic on actual
                MT5 opening deals. Comments alone do not identify the strategy.
              </p>
              <Button
                disabled={busy || !config || !config.strategyAvailable}
                onClick={() => void generate("trading")}
              >
                Create Custom EA
              </Button>
              <p>
                Blocked until complete, verified strategy source is available.
              </p>
              <Button
                variant="outline"
                disabled={busy || !config}
                onClick={() => void generate("existing-observer")}
              >
                {busy ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Preparing package…
                  </>
                ) : (
                  "Connect Existing EA — download observer"
                )}
              </Button>
              <p>
                Includes custom observer branding, optional BMP and installation
                guide. Your original EX5 is not included, renamed or modified.
                MetaEditor compilation remains unverified. Start flat on a demo
                account, verify its connection, then explicitly enable copying
                below.
              </p>
            </div>
          )}
        </section>
        <section className="ea-setup-card">
          <h2>COPY TRADE</h2>
          <p>
            Download the EA Cloud trade copier to broadcast trades from your
            existing MetaTrader 5 account to connected clients.
          </p>
          <Button disabled={busy} onClick={() => void copier()}>
            <Download size={16} />
            Download Trade Copier
          </Button>
          <Button variant="outline" disabled={!config} onClick={guide}>
            Download copier guide
          </Button>
          <h3>MT5 WebRequest URL</h3>
          <code>
            {config?.origin || "Loading verified route configuration…"}
          </code>
          <Button
            variant="outline"
            disabled={!config}
            onClick={() => {
              void navigator.clipboard
                .writeText(config!.origin)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                })
                .catch(() =>
                  setError(
                    "Unable to copy. Select and copy the displayed URL.",
                  ),
                );
            }}
          >
            <Copy size={16} />
            {copied ? "Copied" : "Copy URL"}
          </Button>
          <p>
            Ingestion route:{" "}
            <code>{config?.legacyIngestion || "Loading…"}</code>. This path
            exists in the backend; production reachability has not been tested
            here.
          </p>
          <ol>
            <li>Download the existing copier and guide.</li>
            <li>Install in MQL5/Experts and compile with F7 in MetaEditor.</li>
            <li>
              Add the WebRequest origin and attach only one copier per source
              account.
            </li>
            <li>
              Verify registration and demo execution using actual
              acknowledgements.
            </li>
          </ol>
          <p>
            The legacy copier is preserved. Partial-close/reversal
            reconciliation, SL/TP coverage and source-event deduplication are
            not complete. A download or a configured URL does not mean
            Connected.
          </p>
        </section>
      </div>
      <section className="ea-setup-card mt-6">
        <h2>Observer connections</h2>
        <p>
          Heartbeat acknowledgement alone is not source-account verification or
          client execution. Copying requires a verified MT5 source and an
          explicitly enabled observer. Enqueued events show queue acceptance,
          not broker success.
        </p>
        {listError && <p role="alert">{listError}</p>}
        <Button variant="outline" onClick={() => void loadRobots()}>
          Refresh status
        </Button>
        {!robots.length && <p>No integration robots loaded.</p>}
        {robots.map((robot) => (
          <div key={robot.id} className="ea-setup-robot">
            <strong>{robot.name}</strong>
            <span>
              {robot.revokedAt
                ? "Revoked"
                : robot.lastSeenAt &&
                    Date.now() - Date.parse(robot.lastSeenAt) < 60000
                  ? robot.historyHealthy
                    ? robot.copyEnabled
                      ? "Connected · copying enabled"
                      : "Connected · waiting for enablement"
                    : "Connected · reconciliation not healthy"
                  : "Disconnected / waiting for heartbeat"}
            </span>
            <small>
              Last event:{" "}
              {robot.lastEventAt
                ? new Date(robot.lastEventAt).toLocaleString()
                : "None"}
            </small>
            <Button
              variant="outline"
              onClick={() => {
                if (events[robot.id])
                  setEvents((old) => ({ ...old, [robot.id]: undefined }));
                else
                  void request(
                    `/api/admin/ea-builder/robots/${robot.id}/events`,
                  )
                    .then((r) => r.json())
                    .then((data) =>
                      setEvents((old) => ({ ...old, [robot.id]: data.events })),
                    )
                    .catch((err) => setError(err.message));
              }}
            >
              {events[robot.id]
                ? "Hide captured events"
                : "Recent captured events"}
            </Button>
            {events[robot.id] && (
              <ul className="ea-setup-events">
                {events[robot.id]!.length ? (
                  events[robot.id]!.map((event) => (
                    <li key={event.eventId}>
                      {event.payload.kind} {event.payload.entry} ·{" "}
                      {event.payload.symbol} {event.payload.side} ·{" "}
                      {event.payload.volume} lots · received{" "}
                      {new Date(event.receivedAt).toLocaleString()} ·{" "}
                      {event.copyState || "capture_only"}
                      {event.signalId
                        ? ` · signal #${event.signalId} · ${event.queueStatus || "pending"}`
                        : ""}
                      {event.queueError ? ` · ${event.queueError}` : ""}
                    </li>
                  ))
                ) : (
                  <li>No captured events returned.</li>
                )}
              </ul>
            )}
            {robot.mode === "existing-observer" &&
              !robot.copyEnabled &&
              !robot.revokedAt && (
                <Button
                  onClick={() => {
                    if (
                      !confirm(
                        "Enable observer copying? EA Cloud will block ALL legacy webhook ingestion for this mentor to prevent duplicate copying. Verify the original EX5's external destination independently. Start flat on DEMO and verify its actual source magic first.",
                      )
                    )
                      return;
                    void request(
                      `/api/admin/ea-builder/robots/${robot.id}/enable-copy`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ confirmLegacyBlock: true }),
                      },
                    )
                      .then(loadRobots)
                      .catch((err) => setError(err.message));
                  }}
                >
                  Enable verified observer copying
                </Button>
              )}
            <Button
              disabled={!!robot.revokedAt || busy}
              variant="outline"
              onClick={() => {
                if (
                  confirm(
                    "Revoke this observer? Future updates stop; existing client positions require manual management. Legacy ingestion remains blocked if copying was enabled, to prevent duplicate execution.",
                  )
                )
                  void request(`/api/admin/ea-builder/robots/${robot.id}`, {
                    method: "DELETE",
                  })
                    .then(loadRobots)
                    .catch((err) => setError(err.message));
              }}
            >
              Revoke robot
            </Button>
          </div>
        ))}
      </section>
      <Mt5ConnectInput />
    </div>
  );
}
