import { zipSync, strToU8 } from "fflate";
import { backgroundInclude, broadcastInclude } from "./mql";
import { safeFilename, TEMPLATE_VERSION, mqlString } from "./contracts";
export function toolkitPackage(opts: {
  id: string;
  token: string;
  origin: string;
  name: string;
  manager: string;
  bitmap?: Buffer;
}) {
  const stem = safeFilename(opts.name),
    folder = stem + "_Integration_Toolkit";
  const observer =
    `// CAPTURE-ONLY OBSERVER. This is NOT the SMC Blueprint trading EA.\n#property strict\n#property version "1.00"\n#property description ${mqlString(opts.name + " - capture-only integration observer; no trades")}\n#include "EACloudBroadcast.mqh"\n` +
    (opts.bitmap ? '#include "EACloudBackground.mqh"\n' : "") +
    `int OnInit(){EAC_Init();EventSetTimer(1);${opts.bitmap ? "EAC_Background();" : ""}return INIT_SUCCEEDED;}\nvoid OnTick(){}\nvoid OnTimer(){EAC_Timer();}\nvoid OnTradeTransaction(const MqlTradeTransaction &trans,const MqlTradeRequest &request,const MqlTradeResult &result){EAC_Transaction(trans);}\nvoid OnDeinit(const int reason){EventKillTimer();EAC_Stop();${opts.bitmap ? 'ResourceFree("EAC_Background_"+EAC_ID);' : ""}}\n` +
    (opts.bitmap
      ? "void OnChartEvent(const int id,const long &l,const double &d,const string &s){if(id==CHARTEVENT_CHART_CHANGE)EAC_Background();}\n"
      : "");
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
