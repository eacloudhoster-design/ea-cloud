import sourceTemplate from "./templates/intelligence-ea-v3.mq5";
import { zipSync, strToU8 } from "fflate";
import { safeFilename, mqlString, TEMPLATE_VERSION } from "./contracts";
import { broadcastInclude, backgroundInclude } from "./mql";
import { reconciliationInclude } from "./reconcile";
import { relaySource, localDelivery } from "./relay";
export const intelligenceTemplate = sourceTemplate;
export function tradingPackage(opts: {
  id: string;
  token: string;
  origin: string;
  name: string;
  manager: string;
  bitmap?: Buffer;
}) {
  const stem = safeFilename(opts.name),
    folder = stem;
  let strategy = sourceTemplate.replace(/\r\n/g, "\n");
  for (const required of [
    "DetectQuasimodoSignal",
    "OpenBuy",
    "OpenSell",
    "CalculateStops",
    "ManageTrailingStop",
    "OnInit",
    "OnDeinit",
    "OnTick",
  ])
    if (
      !new RegExp("(?:int|bool|void)\\s+" + required + "\\s*\\(").test(strategy)
    )
      throw Error("Complete Intelligence template unavailable");
  strategy = strategy
    .replace("int OnInit()", "int EAC_StrategyInit()")
    .replace(
      "void OnDeinit(const int reason)",
      "void EAC_StrategyDeinit(const int reason)",
    )
    .replace(
      'string   g_comment    = "Intelligence EA V3+";',
      () => `string   g_comment    = ${mqlString(opts.name)};`,
    )
    .replace(
      'string   g_eaName     = "Intelligence EA V3+";',
      () => `string   g_eaName     = ${mqlString(opts.name)};`,
    )
    .replace(
      'string PFX = "Intelligence EA V3+_";',
      () => `string PFX = ${mqlString(stem + "_")};`,
    )
    .replace(
      '#property description "Sugar Beck Scalper EA"',
      () =>
        `#property description ${mqlString(opts.name + " | EA Manager: " + opts.manager)}`,
    );
  let capture = broadcastInclude(opts);
  // Shared immutable replacements allow a background Service to read the outbox.
  const common = (s: string) =>
    s
      .replaceAll("FILE_ANSI,", "FILE_ANSI|FILE_COMMON,")
      .replaceAll(
        "FileMove(temp,0,EAC_file,FILE_REWRITE)",
        "FileMove(temp,FILE_COMMON,EAC_file,FILE_COMMON|FILE_REWRITE)",
      )
      .replaceAll(
        "FileMove(temp,0,EAC_state,FILE_REWRITE)",
        "FileMove(temp,FILE_COMMON,EAC_state,FILE_COMMON|FILE_REWRITE)",
      );
  // Remove the entire synchronous HTTP function, not just its invocation.
  const start = capture.indexOf("void EAC_Timer() {"),
    end = capture.indexOf("void EAC_Stop()", start);
  if (start < 0 || end < 0)
    throw Error("Broadcast integration boundary changed");
  capture = common(capture.slice(0, start) + capture.slice(end));
  capture = capture.replace(
    "CAPTURE ONLY - NO CLIENT EXECUTION",
    "TRADE SHARING - CHECK PORTAL DELIVERY",
  );
  let reconciliation = common(reconciliationInclude("12345")).replace(
    "input long SourceMagic=12345;",
    "long SourceMagic=0;",
  );
  let background = opts.bitmap ? backgroundInclude(opts.id) : "";
  background = background
    .replaceAll(
      mqlString("\\Images\\EACloud\\" + opts.id + "\\MT5_Background.bmp"),
      mqlString("MT5_Background.bmp"),
    )
    .replaceAll(
      mqlString("::Images\\EACloud\\" + opts.id + "\\MT5_Background.bmp"),
      mqlString("::MT5_Background.bmp"),
    );
  const integrations =
    `\n// EA Cloud additions: local capture only; no HTTPS on the strategy event loop.\n${capture}\n${reconciliation}\n${localDelivery}\n${background}\nint OnInit(){int status=EAC_StrategyInit();if(status!=INIT_SUCCEEDED)return status;SourceMagic=MagicNumber;EAC_Init();EAC_ReconcileInit();EventSetTimer(1);${opts.bitmap ? "EAC_Background();" : ""}return status;}\nvoid OnTimer(){EAC_Reconcile();EAC_LocalDelivery();}\nvoid OnTradeTransaction(const MqlTradeTransaction &trans,const MqlTradeRequest &request,const MqlTradeResult &result){/* Confirmed account history is reconciled on the timer. */}\nvoid OnDeinit(const int reason){EventKillTimer();EAC_Stop();EAC_StrategyDeinit(reason);${opts.bitmap ? 'ResourceFree("EAC_Background_"+EAC_ID);' : ""}}\n` +
    (opts.bitmap
      ? "void OnChartEvent(const int id,const long &l,const double &d,const string &s){if(id==CHARTEVENT_CHART_CHANGE)EAC_Background();}\n"
      : "");
  const guide = `HOW TO INSTALL ${opts.name}\nEA Manager: ${opts.manager}\nTemplate: ${TEMPLATE_VERSION}\nSource package generated; MetaEditor compilation is UNVERIFIED. This is the complete supplied Intelligence EA V3+ strategy, not a replacement strategy. Original startup trading and all trading inputs remain unchanged. Use DEMO first.\n\n1. Open desktop MetaTrader 5 → File → Open Data Folder.\n2. Copy this entire ${folder} folder into MQL5/Experts; ${opts.bitmap ? "keep MT5_Background.bmp beside " + stem + ".mq5 before compilation (embedded resource)." : "no bitmap is required."}\n3. Copy ${stem}_Relay.mq5 into MQL5/Services (create the folder if needed). This native background service handles HTTPS without blocking the trading strategy; it is not another trading/observer EA and needs no DLL.\n4. Open MetaEditor and compile BOTH ${stem}.mq5 and ${stem}_Relay.mq5 with F7. Resolve any compiler errors before proceeding.\n5. In MT5 → Tools → Options → Expert Advisors, allow WebRequest for ${opts.origin}.\n6. Under Navigator → Services, run ${stem}_Relay on the SAME MT5 terminal/account and leave it running. Keep package/token private; never run another broadcaster for the same source.\n7. Attach ${stem} to your DEMO chart and review the original strategy inputs, MagicNumber and Algo Trading permissions. Startup trading is preserved, so the original strategy may trade immediately.\n8. In EA Cloud Setup Methods, verify the exact source account and enable trade sharing only after a recent healthy FLAT/empty-outbox heartbeat. Existing/startup positions before enablement are not copied retroactively. Enabling sharing blocks this mentor's legacy webhook; confirm any external copier is stopped independently.\n9. Confirm recent EA Cloud acknowledgement and inspect actual per-client execution results. Receipt/queue acceptance is not a broker fill. Test BUY/SELL, SL/TP, partial/full closes, reconnect/restart on DEMO before live use.\n10. Retain Common/Files/EACloud_${opts.id}_<login>.jsonl, its .state and terminal globals, and the service journal on the execution VPS. Revocation/paused clients can leave existing positions unmanaged; uncertain broker submissions require manual reconciliation.\n\nAuthenticated paths: ${opts.origin}/api/robots/heartbeat and ${opts.origin}/api/robots/events. The relay contains only this robot's revocable token, never an administrator/mentor API key. Disable/revoke in EA Cloud if shared. No guaranteed latency or replay of offline completed round trips. Complete source is included; native compilation and broker operation must be validated by the operator.\n`;
  const files: Record<string, Uint8Array> = {
    [`${folder}/${stem}.mq5`]: strToU8(strategy + integrations),
    [`${folder}/${stem}_Relay.mq5`]: strToU8(relaySource(opts)),
    [`${folder}/INSTALLATION_GUIDE.txt`]: strToU8(guide),
  };
  if (opts.bitmap) files[`${folder}/MT5_Background.bmp`] = opts.bitmap;
  return {
    filename: folder + ".zip",
    bytes: Buffer.from(zipSync(files, { level: 6 })),
  };
}
