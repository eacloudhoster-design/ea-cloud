import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { collectClientSizingDiagnostics, readClientBuildCommit } from "@/lib/client-sizing-diagnostics";

/** Opt-in only: seven taps on the existing Settings title, no normal layout change. */
export default function ClientSizingDiagnostics() {
  const taps = useRef({ count: 0, last: 0 });
  const dialog = useRef<HTMLDialogElement>(null);
  const generation = useRef(0);
  const [report, setReport] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (report !== null && !dialog.current?.open) dialog.current?.showModal(); }, [report]);
  const activate = () => {
    const now = Date.now();
    taps.current.count = now - taps.current.last > 1500 ? 1 : taps.current.count + 1;
    taps.current.last = now;
    if (taps.current.count < 7) return;
    taps.current.count = 0;
    const current = ++generation.current;
    const snapshot = collectClientSizingDiagnostics();
    setCopied(false);
    setReport(JSON.stringify({ ...snapshot, buildCommit: null }, null, 2));
    void readClientBuildCommit().then(buildCommit => setReport(previous => previous === null || current !== generation.current ? previous : JSON.stringify({ ...snapshot, buildCommit }, null, 2)));
  };
  return <>
    <button type="button" aria-label="Client display diagnostics" aria-description="Tap seven times to open the read-only display report" onClick={activate} style={{ font: "inherit", color: "inherit", letterSpacing: "inherit", textTransform: "inherit", background: "none", border: 0, padding: 0 }}>Settings</button>
    {report !== null && createPortal(<dialog ref={dialog} aria-label="Client display diagnostics" onCancel={() => setReport(null)} onClose={() => setReport(null)}
      style={{ position: "fixed", inset: 0, margin: "auto", width: "min(520px, calc(100% - 32px))", maxHeight: "85vh", overflow: "auto", background: "#111", color: "#fff", border: "1px solid #777", borderRadius: 12, padding: 16, fontSize: 16 }}>
      <h2 style={{ fontSize: 20, marginBottom: 8 }}>Client display diagnostics</h2>
      <p>No account information is included. The report is not uploaded.</p>
      <pre data-client-sizing-report style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", userSelect: "text", fontSize: 12, marginBlock: 16 }}>{report}</pre>
      <button type="button" onClick={() => { void navigator.clipboard?.writeText(report).then(() => setCopied(true)).catch(() => {}); }} style={{ padding: 10, border: "1px solid #777", marginRight: 8 }}>{copied ? "Copied" : "Copy report"}</button>
      <button type="button" onClick={() => setReport(null)} style={{ padding: 10, border: "1px solid #777" }}>Close</button>
    </dialog>, document.body)}
  </>;
}
