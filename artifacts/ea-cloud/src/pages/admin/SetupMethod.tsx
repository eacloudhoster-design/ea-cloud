import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useGetProfile, useGetEas } from "@workspace/api-client-react";
import { usePortalRedirect } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Download, Copy, Loader2, ImagePlus, X } from "lucide-react";
import Mt5ConnectInput from "@/components/Mt5ConnectInput";
import "./SetupMethod.css";
type Package = { blob: Blob; name: string };
type Robot = {
  id: string;
  name: string;
  mode: string;
  copyEnabled: boolean;
  revokedAt: string | null;
  lastSeenAt: string | null;
  historyHealthy: boolean;
};
type Receipt = {
  eventId: string;
  copyState: string;
  queueStatus?: string;
  queueError?: string;
  receivedAt: string;
  payload: { kind: string; symbol: string; side: string; volume: number };
};
async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    signal: init.signal || AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw Error(data.error || `Request failed (HTTP ${response.status}).`);
  }
  return response;
}
async function prepare(path: string, init?: RequestInit): Promise<Package> {
  const response = await request(path, init);
  if (!response.headers.get("Content-Type")?.includes("application/zip"))
    throw Error(
      "The installation package could not be prepared. Please try again.",
    );
  const blob = await response.blob();
  if (blob.size === 0)
    throw Error("The installation package is empty. Please try again.");
  return {
    blob,
    name:
      response.headers
        .get("Content-Disposition")
        ?.match(/filename="([^"]+)"/)?.[1] || "EACloud.zip",
  };
}
function download(file: Package) {
  const url = URL.createObjectURL(file.blob),
    a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const creationSteps = [
  ["Customise your EA", "Confirm your EA name and EA Manager in your profile."],
  ["Upload background", "Choose an optional MT5 chart image."],
  ["Create EA", "Generate your personalised trading robot."],
  ["Download file", "Save your EA package and installation notes."],
];
const copierSteps = [
  ["Create copier", "Generate your EA Cloud trade copier file."],
  ["Install on MT5", "Install the copier on your desktop terminal."],
  ["Configure WebRequest", "Allow the EA Cloud URL shown below."],
  ["Connect account", "Confirm your source account connection."],
  ["Start copying", "Share eligible trades with authorised clients."],
];
function Steps({ items }: { items: string[][] }) {
  return (
    <ol className="ea-setup-steps">
      {items.map(([title, text], i) => (
        <li key={title}>
          <span>{i + 1}</span>
          <div>
            <strong>{title}</strong>
            <p>{text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
export default function SetupMethod() {
  usePortalRedirect();
  const { data: profile } = useGetProfile(),
    { data: eas } = useGetEas();
  const [eaId, setEaId] = useState(0),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [origin, setOrigin] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState<"ea" | "copier" | null>(null),
    [eaPackage, setEaPackage] = useState<Package | null>(null),
    [copierPackage, setCopierPackage] = useState<Package | null>(null),
    [copied, setCopied] = useState(false),
    [robots, setRobots] = useState<Robot[]>([]),
    [receipts, setReceipts] = useState<Record<string, Receipt[]>>({});
  const selected = eaId || eas?.[0]?.id || 0,
    eaName =
      profile?.robotName?.trim() ||
      eas?.find((e) => e.id === selected)?.name ||
      "",
    manager =
      profile?.mentorName?.trim() ||
      [profile?.firstName, profile?.lastName].filter(Boolean).join(" ");
  const loadRobots = async () => {
    const data = await (await request("/api/admin/ea-builder/robots")).json();
    setRobots(data.robots);
  };
  useEffect(() => {
    const controller = new AbortController();
    void request("/api/admin/ea-builder/config", { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => setOrigin(data.origin))
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    void loadRobots().catch((e) => setError(e.message));
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => setEaPackage(null), [selected, eaName, manager, file]);
  async function generate(kind: "ea" | "copier") {
    if (busy) return;
    setError("");
    setBusy(kind);
    if (kind === "ea") setEaPackage(null);
    else setCopierPackage(null);
    try {
      if (kind === "copier") {
        setCopierPackage(
          await prepare("/api/admin/copier/download?format=zip"),
        );
        return;
      }
      if (!selected || !eaName || !manager)
        throw Error(
          "Select your EA and complete its name and manager in Profile.",
        );
      if (
        file &&
        (file.size > 10 * 1024 * 1024 ||
          !/^image\/(png|jpeg|bmp|x-ms-bmp|x-bmp)$/.test(file.type))
      )
        throw Error("Choose a PNG, JPG, JPEG or BMP image up to 10MB.");
      const data = new FormData();
      data.set("eaId", String(selected));
      data.set("name", eaName);
      data.set("managerName", manager);
      data.set("purpose", "trading");
      if (file) data.set("background", file);
      setEaPackage(
        await prepare("/api/admin/ea-builder/package", {
          method: "POST",
          body: data,
        }),
      );
      await loadRobots();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="ea-setup">
      <header className="ea-setup-header">
        <p>YOUR STRATEGY. YOUR BRAND.</p>
        <h1>Setup Methods</h1>
        <p>Create your trading EA or set up your standalone trade copier.</p>
      </header>
      {error && (
        <p className="ea-setup-alert" role="alert">
          {error}
        </p>
      )}
      <section className="ea-setup-card" aria-labelledby="create-ea-heading">
        <h2 id="create-ea-heading">CREATE YOUR TRADING EA</h2>
        <p>
          Create your personalised MetaTrader 5 trading robot with your own EA
          name, manager branding, custom chart background and integrated EA
          Cloud trade broadcasting.
        </p>
        <h3>HOW IT WORKS</h3>
        <Steps items={creationSteps} />
        <div className="ea-setup-branding">
          <div>
            <small>EA NAME</small>
            <strong>{eaName || "Add your EA name in Profile"}</strong>
          </div>
          <div>
            <small>EA MANAGER</small>
            <strong>{manager || "Add your manager name in Profile"}</strong>
          </div>
          <Link href="/admin/profile" className="ea-setup-edit">
            Edit in Profile
          </Link>
        </div>
        {(eas?.length || 0) > 1 && (
          <div className="ea-setup-form">
            <label htmlFor="setup-ea">EA registration</label>
            <select
              id="setup-ea"
              value={selected}
              disabled={!!busy}
              onChange={(e) => setEaId(Number(e.target.value))}
            >
              {eas?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {!eas?.length && (
          <p>
            <Link href="/admin/ea-manager">
              Create an EA in EA Manager first.
            </Link>
          </p>
        )}
        <h3>MT5 CHART BACKGROUND</h3>
        <p>
          Upload an image to personalise the background of your MetaTrader 5
          desktop trading chart.
        </p>
        <div className="ea-setup-upload">
          <ImagePlus />
          <label htmlFor="setup-background">
            {file ? "Replace background" : "Upload MT5 Chart Background"}
          </label>
          <input
            id="setup-background"
            type="file"
            accept=".png,.jpg,.jpeg,.bmp,image/png,image/jpeg,image/bmp"
            disabled={!!busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              e.target.value = "";
            }}
          />
          <p>
            PNG, JPG, JPEG or BMP · up to 10MB. Your client app background stays
            unchanged.
          </p>
          {preview && (
            <>
              <img
                className="ea-setup-preview"
                src={preview}
                alt="MT5 chart background preview"
              />
              <Button
                variant="outline"
                disabled={!!busy}
                onClick={() => setFile(null)}
              >
                <X size={16} />
                Remove background
              </Button>
            </>
          )}
        </div>
        <Button
          className="ea-setup-primary"
          disabled={!!busy || !origin || !selected || !eaName || !manager}
          onClick={() => void generate("ea")}
        >
          {busy === "ea" ? (
            <>
              <Loader2 className="animate-spin" />
              Creating your personalised EA...
            </>
          ) : (
            "CREATE EA"
          )}
        </Button>
        {eaPackage && (
          <div className="ea-setup-ready" role="status">
            <strong>YOUR EA IS READY</strong>
            <p>
              Your source package is ready. Compile it in MetaEditor and test it
              on DEMO before live use.
            </p>
            <Button onClick={() => download(eaPackage)}>
              <Download size={16} />
              DOWNLOAD FILE
            </Button>
          </div>
        )}
      </section>
      <div className="ea-setup-divider" aria-hidden="true" />
      <section className="ea-setup-card" aria-labelledby="copy-heading">
        <h2 id="copy-heading">COPY TRADING</h2>
        <p>
          Connect your MetaTrader 5 account to EA Cloud and automatically share
          your trades with your connected clients.
        </p>
        <h3>HOW COPY TRADING WORKS</h3>
        <Steps items={copierSteps} />
        <div className="ea-setup-url">
          <h3>EA CLOUD WEBREQUEST URL</h3>
          <code>{origin || "Loading connection details…"}</code>
          <Button
            variant="outline"
            disabled={!origin}
            onClick={() => {
              void navigator.clipboard
                .writeText(origin)
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
            COPY URL
          </Button>
          {copied && <p role="status">URL copied successfully.</p>}
          <p>
            Open MetaTrader 5 → Tools → Options → Expert Advisors → Allow
            WebRequest for listed URL, then add the URL shown above.
          </p>
        </div>
        <Button
          className="ea-setup-primary"
          disabled={!!busy || !origin}
          onClick={() => void generate("copier")}
        >
          {busy === "copier" ? (
            <>
              <Loader2 className="animate-spin" />
              Preparing your copy trading file...
            </>
          ) : (
            "CREATE COPY TRADING FILE"
          )}
        </Button>
        {copierPackage && (
          <div className="ea-setup-ready" role="status">
            <strong>YOUR COPY TRADING FILE IS READY</strong>
            <Button onClick={() => download(copierPackage)}>
              <Download size={16} />
              DOWNLOAD COPY TRADING FILE
            </Button>
          </div>
        )}
        <Mt5ConnectInput />
      </section>
      <section className="ea-setup-card ea-setup-connections">
        <h2>CONNECTIONS &amp; DELIVERY</h2>
        <p>
          Check your source connection and trade delivery here. A connection
          acknowledgement is not a confirmed client trade.
        </p>
        <Button
          variant="outline"
          onClick={() => void loadRobots().catch((e) => setError(e.message))}
        >
          Refresh status
        </Button>
        {!robots.length && <p>No EA packages created yet.</p>}
        {robots.map((robot) => (
          <div key={robot.id} className="ea-setup-robot">
            <strong>{robot.name}</strong>
            <span>
              {robot.revokedAt
                ? "Revoked"
                : !robot.lastSeenAt ||
                    Date.now() - Date.parse(robot.lastSeenAt) > 60000
                  ? "Disconnected / waiting for connection"
                  : !robot.historyHealthy
                    ? "Connected · checking history"
                    : robot.copyEnabled
                      ? "Connected · trade sharing enabled"
                      : "Connected · waiting for trade sharing"}
            </span>
            {!robot.copyEnabled &&
              !robot.revokedAt &&
              ["integrated-ea", "existing-observer"].includes(robot.mode) && (
                <Button
                  onClick={() => {
                    if (
                      !confirm(
                        "Enable trade sharing? Start flat with no queued events and verify your exact MT5 source account first. This blocks ALL legacy copier ingestion for your mentor account to prevent duplicate copying. Confirm any external copier is stopped independently.",
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
                      .catch((e) => setError(e.message));
                  }}
                >
                  Enable trade sharing
                </Button>
              )}
            <Button
              variant="outline"
              onClick={() =>
                void request(`/api/admin/ea-builder/robots/${robot.id}/events`)
                  .then((r) => r.json())
                  .then((data) =>
                    setReceipts((old) => ({ ...old, [robot.id]: data.events })),
                  )
                  .catch((e) => setError(e.message))
              }
            >
              Recent trade delivery
            </Button>
            {receipts[robot.id] && (
              <ul>
                {receipts[robot.id].length ? (
                  receipts[robot.id].map((e) => (
                    <li key={e.eventId}>
                      {e.payload.kind} · {e.payload.symbol} {e.payload.side} ·{" "}
                      {e.copyState} {e.queueStatus ? `· ${e.queueStatus}` : ""}
                      {e.queueError ? ` · ${e.queueError}` : ""}
                    </li>
                  ))
                ) : (
                  <li>No events received yet.</li>
                )}
              </ul>
            )}
            <Button
              variant="outline"
              disabled={!!robot.revokedAt}
              onClick={() => {
                if (
                  !confirm(
                    "Revoke this connection? Future updates stop; existing client positions require manual management. Legacy ingestion stays blocked if trade sharing was enabled.",
                  )
                )
                  return;
                void request(`/api/admin/ea-builder/robots/${robot.id}`, {
                  method: "DELETE",
                })
                  .then(loadRobots)
                  .catch((e) => setError(e.message));
              }}
            >
              Revoke connection
            </Button>
          </div>
        ))}
      </section>
    </div>
  );
}
