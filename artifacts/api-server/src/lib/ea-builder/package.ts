import { reconciliationInclude } from "./reconcile";
import { zipSync, strToU8 } from "fflate";
import { backgroundInclude, broadcastInclude } from "./mql";
import { safeFilename, TEMPLATE_VERSION, mqlString } from "./contracts";
export function toolkitPackage(opts: {
  id: string;
  token: string;
  origin: string;
  name: string;
  manager: string;
  existingObserver?: boolean;
  sourceMagic?: string;
  bitmap?: Buffer;
}) {
  const stem = safeFilename(opts.name),
    folder = stem + "_Integration_Toolkit";
  let observer =
    `// CAPTURE-ONLY OBSERVER. This is NOT the SMC Blueprint trading EA.\n#property strict\n#property version "1.00"\n#property description ${mqlString(opts.name + " - capture-only integration observer; no trades")}\n#include "EACloudBroadcast.mqh"\n` +
    (opts.bitmap ? '#include "EACloudBackground.mqh"\n' : "") +
    `int OnInit(){EAC_Init();EventSetTimer(1);${opts.bitmap ? "EAC_Background();" : ""}return INIT_SUCCEEDED;}\nvoid OnTick(){}\nvoid OnTimer(){EAC_Timer();}\nvoid OnTradeTransaction(const MqlTradeTransaction &trans,const MqlTradeRequest &request,const MqlTradeResult &result){EAC_Transaction(trans);}\nvoid OnDeinit(const int reason){EventKillTimer();EAC_Stop();${opts.bitmap ? 'ResourceFree("EAC_Background_"+EAC_ID);' : ""}}\n` +
    (opts.bitmap
      ? "void OnChartEvent(const int id,const long &l,const double &d,const string &s){if(id==CHARTEVENT_CHART_CHANGE)EAC_Background();}\n"
      : "");
  if (opts.existingObserver) {
    observer = observer
      .replace(
        "int OnInit(){EAC_Init();",
        "int OnInit(){EAC_Init();EAC_ReconcileInit();",
      )
      .replace(
        "void OnTimer(){EAC_Timer();}",
        "void OnTimer(){EAC_Reconcile();EAC_Timer();}",
      )
      .replace(
        "{EAC_Transaction(trans);}",
        "{/* Account-history polling is authoritative across charts. */}",
      )
      .replace(
        '#include "EACloudBroadcast.mqh"\n',
        '#include "EACloudBroadcast.mqh"\n#include "EACloudReconcile.mqh"\n',
      );
  }
  const guide = `${opts.name} — INTEGRATION TOOLKIT\nEA Manager: ${opts.manager}\nRobot ID: ${opts.id}\nTemplate: ${TEMPLATE_VERSION}\n\nNOT A TRADING EA. Original complete SMC Blueprint/Quasimodo source is missing. No original strategy is included or claimed preserved. No startup/ForceSignal trade is generated. This observer places no orders and captured events DO NOT execute on clients.\n\n1. In MT5 File → Open Data Folder. Copy the complete MQL5 folder from this ZIP into that data folder. The observer and its includes go together under MQL5/Experts/${stem}/.\n2. ${opts.bitmap ? "Keep MQL5/Images/EACloud/" + opts.id + "/MT5_Background.bmp at the exact included path BEFORE compiling. It becomes a compiled resource." : "No background was supplied; no bitmap is required."}\n3. Open MetaEditor, open ${stem}_Observer.mq5 and press F7. Compilation has NOT been verified here; resolve errors before attaching.\n4. Use a DEMO account for validation. Tools → Options → Expert Advisors → Allow WebRequest for listed URL; add exactly ${opts.origin}. Attach the observer to one chart. The observer does not need to place orders.\n5. Its panel reports acknowledgement only after a successful API response. Capture-only acknowledgement is NOT proof of source-account ownership, strategy operation, or client execution.\n6. Keep this ZIP/source private: it contains a robot-specific capture token, not an administrator/API key. Revoke it under Setup Methods if shared. It cannot use the legacy execution webhook or another mentor's credentials.\n7. Confirmed DEAL_IN/OUT/OUT_BY/INOUT and POSITION changes are recorded separately, never automatically interpreted as executable client trades. Netting adds/reversals and partial closes require lifecycle reconciliation before execution can be enabled.\n8. Networking occurs only on the timer, with a 2-second timeout/backoff up to 30 seconds. WebRequest is synchronous and may delay this observer's event loop. Do not merge it into a trading strategy without timing/MetaEditor tests.\n9. The bounded 256-event outbox is written under MQL5/Files/${"EACloud_" + opts.id}_<login>.jsonl. The terminal must retain it for restart recovery. Disk errors, sudden crashes, or queue overflow can lose events; reconcile account history manually. Never run multiple broadcasters on one source account: deal IDs deduplicate server-side, but identical position snapshots from different broadcasters are not guaranteed duplicates.\n10. Offline events remain queued. Expired/revoked credentials will not acknowledge them. No guaranteed delivery/latency is claimed. Capture has no order/execution acknowledgement; existing legacy copier has its own execution history.\n\nAPI paths: ${opts.origin}/api/robots/heartbeat and ${opts.origin}/api/robots/events (capture only). Existing live ingestion remains ${opts.origin}/api/signals/webhook for the separately downloaded legacy copier. Do not send the capture token there.\n\nBefore a real trading EA can be generated: supply complete original strategy source and includes, verify trading inputs/conditions and any fire-on-load behavior, integrate event hooks exactly once, compile in MetaEditor, and validate lifecycle mapping, broker constraints, crash recovery and authorized client routing on DEMO.\n`;
  const files: Record<string, Uint8Array> = {
    [`${folder}/MQL5/Experts/${stem}/${stem}_Observer.mq5`]: strToU8(observer),
    [`${folder}/MQL5/Experts/${stem}/EACloudBroadcast.mqh`]: strToU8(
      broadcastInclude(opts),
    ),
    [`${folder}/INSTALLATION_GUIDE.txt`]: strToU8(guide),
    [`${folder}/STRATEGY_REQUIRED.json`]: strToU8(
      JSON.stringify(
        {
          available: false,
          template: TEMPLATE_VERSION,
          tradingInputs: {
            Timeframe: "PERIOD_CURRENT",
            LotSize: 0.01,
            SLPercent: 0.5,
            TPPercent: 1,
            MagicNumber: 12345,
            SwingStrength: 2,
            LookbackBars: 80,
            ForceSignal: 0,
          },
          fireOnLoad: "not enabled; original source required",
          displayName: opts.name,
          manager: opts.manager,
          robotId: opts.id,
          execution: false,
        },
        null,
        2,
      ),
    ),
  };
  if (opts.existingObserver) {
    const path = `${folder}/MQL5/Experts/${stem}/EACloudBroadcast.mqh`;
    let source = broadcastInclude(opts)
      .replace(
        'string body=ArraySize(EAC_queue)>0?EAC_queue[0]:"{}";',
        "string body=ArraySize(EAC_queue)>0?EAC_queue[0]:EAC_Heartbeat();",
      )
      .replace('&&StringFind(answer,"\\\"execution\\\":false")>=0', "")
      .replace(
        "Acknowledged - capture only",
        "API acknowledged; check portal execution history",
      )
      .replace(
        "CAPTURE ONLY - NO CLIENT EXECUTION",
        "SOURCE OBSERVER - NO LOCAL ORDERS",
      );
    files[`${folder}/MQL5/Experts/${stem}/${stem}_Observer.mq5`] = strToU8(
      observer
        .replace("CAPTURE-ONLY OBSERVER", "ACCOUNT OBSERVER")
        .replace(
          "capture-only integration observer; no trades",
          "account observer; no local orders",
        ),
    );
    files[path] = strToU8("string EAC_Heartbeat();\n" + source);
    files[`${folder}/INSTALLATION_GUIDE.txt`] =
      strToU8(`${opts.name} — CONNECT EXISTING EA OBSERVER
Manager: ${opts.manager}
Robot: ${opts.id}

This ZIP does NOT contain or replace the original SMC Blueprint EX5 or strategy. Never rename or modify the original EX5. Custom names and optional BMP affect this observer only.

1. Copy the complete MQL5 folder into MT5's data folder. Keep all includes beside ${stem}_Observer.mq5. ${opts.bitmap ? "Keep MQL5/Images/EACloud/" + opts.id + "/MT5_Background.bmp before compiling; the resource is embedded." : "No bitmap is required."}
2. Compile the observer with MetaEditor F7. Compilation is UNVERIFIED here. Do not activate copying until it compiles and passes DEMO tests.
3. Chart 1: retain the original compiled EX5 and its strategy settings. Chart 2: attach ONLY this observer. Allow WebRequest origin ${opts.origin}. The observer never submits source-account orders.
4. Verify SourceMagic ${opts.sourceMagic || "12345"} in ACTUAL opening deals. 12345 is a reference, not confirmed strategy identity. Comments cannot substitute for magic. Magic 0 is capture-only. Mixed-magic netting exposure fails closed.
5. In the existing mentor MT5 connection panel, successfully verify the exact source login/server. This proof expires after 24h. A heartbeat is not ownership proof.
6. Start FLAT with no eligible source positions. Drain the outbox and wait for a healthy heartbeat. Only then use Enable verified observer copying in the portal. API needs the reviewed migration and separately authenticated HTTPS observer execution bridge before this is allowed.
7. Activation blocks ALL legacy webhook ingestion for this mentor inside EA Cloud, including other legacy sources. Check the original EX5's old https://lumo-edge.replit.app/api/admin/trades destination independently. Its compiled traffic and external execution cannot be inspected or blocked by this package. Do not run two independent copiers. Never alter unknown original EX5 inputs blindly.
8. History/account positions are scanned on the timer, independently of cross-chart OnTradeTransaction delivery. Confirmed deal receipts are audits; current-position snapshots drive absolute client exposure, partial reductions, closures, reversals and SL/TP. Historical round trips completed while disconnected are audited, not replayed as stale client trades. Polling and synchronous HTTP introduce latency; no exact broker-fill replication is promised.
9. Retain MQL5/Files/EACloud_${opts.id}_<login>.jsonl, its .state file and MT5 global variables for restart recovery. Outbox is bounded at 256. Disk/history failures stop healthy status; never delete recovery files to hide a failure. One observer instance per source account only.
10. The restricted token is private source code; do not share the ZIP. Check the portal event copy state and existing execution records. HTTP receipt or enqueued status is NOT a successful client fill. Offline/rejected/uncertain outcomes must be investigated.
11. VPS keeps a persistent SQLite journal. Retrying a completed revision does not place another order. A crash/no-result in broker submission remains blocked pending MANUAL broker-history reconciliation; never delete/reset the journal to retry. Netting refuses unrelated exposure. Broker minimum/step, configured volume/open-trade caps and observer daily equity drawdown checks apply.
12. Revocation stops future updates; it does not close existing client positions. Manage those manually. Legacy ingestion remains blocked for an enabled-then-revoked observer until a separately reviewed safe handover. Source/client licence, copying settings and account connectivity must stay valid.

DEMO acceptance: BUY/SELL, partial fill, partial/full close, SL/TP, reversal, unrelated/manual trades, two clients with distinct sizing/symbols, disconnect/restart, source verification expiry, revocation, duplicate HTTP and uncertain execution. No live deployment, broker validation or strategy reconstruction is claimed.
`);
    files[`${folder}/MQL5/Experts/${stem}/EACloudReconcile.mqh`] = strToU8(
      reconciliationInclude(opts.sourceMagic || "12345"),
    );
  }
  if (opts.bitmap) {
    files[`${folder}/MQL5/Images/EACloud/${opts.id}/MT5_Background.bmp`] =
      opts.bitmap;
    files[`${folder}/MQL5/Experts/${stem}/EACloudBackground.mqh`] = strToU8(
      backgroundInclude(opts.id),
    );
  }
  return {
    bytes: Buffer.from(zipSync(files, { level: 6 })),
    filename: folder + ".zip",
  };
}
