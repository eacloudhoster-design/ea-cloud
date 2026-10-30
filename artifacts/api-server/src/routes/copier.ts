import {zipSync,strToU8} from "fflate";
import {safeFilename} from "../lib/ea-builder/contracts";
import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getRawApiKeyForEmbed } from "../lib/api-key";

const router = Router();

// ─── Mentor auth helper ────────────────────────────────────────────────────────
const getMentorFromBearer = async (authHeader: string | undefined) => {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const decoded = Buffer.from(authHeader.slice(7), "base64").toString();
    const [idStr, role] = decoded.split(":");
    if (role !== "mentor" && role !== "superadmin") return null;
    const id = parseInt(idStr, 10);
    const [mentor] = await db
      .select({
        id: usersTable.id,
        apiKey: usersTable.apiKey,
        apiKeyEncrypted: usersTable.apiKeyEncrypted,
        webhookUrl: usersTable.webhookUrl,
        robotName: usersTable.robotName,
        mentorName: usersTable.mentorName,
        firstName: usersTable.firstName,
        status: usersTable.status,
      })
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);
    return mentor ?? null;
  } catch {
    return null;
  }
};

// ─── MQ5 EA template ──────────────────────────────────────────────────────────
// The EA performs a 3-step handshake on init:
//   1. POST /signals/challenge  → server validates broker server + issues nonce
//   2. POST /signals/register-account + nonce → cryptographic proof of live account
//   3. POST /signals/heartbeat every 60 s → keeps verification alive
const buildMq5 = (opts: {
  apiKey: string;
  baseUrl: string;
  eaName: string;
  mentorDisplayName: string;
  generatedDate: string;
}) => {
  const { apiKey, baseUrl, eaName, mentorDisplayName, generatedDate } = opts;
  return `//+------------------------------------------------------------------+
//|  EA Cloud Auto Trade Copier v3.00                                |
//|  Mentor : ${mentorDisplayName.padEnd(50)}|
//|  EA Name: ${eaName.padEnd(50)}|
//|  Generated: ${generatedDate.padEnd(47)}|
//|  CONFIDENTIAL — Do not share this file                           |
//+------------------------------------------------------------------+
#property copyright "EA Cloud Platform"
#property link      "https://eacloud.com"
#property version   "3.00"
#property description "EA Cloud Auto Trade Copier — challenge-verified signal forwarding"

//--- Embedded credentials (pre-filled — do not modify)
string EA_CLOUD_API_KEY  = "${apiKey}";
string EA_CLOUD_BASE_URL = "${baseUrl}";
string EA_CLOUD_EA_NAME  = "${eaName}";

//--- User-configurable inputs
input bool   EnableCopier  = true;   // Enable/Disable trade forwarding
input bool   EnableLogging = true;   // Show log messages in Experts tab

//+------------------------------------------------------------------+
//| Initialisation — 3-step challenge-response verification          |
//+------------------------------------------------------------------+
int OnInit()
  {
   if(EA_CLOUD_API_KEY == "" || EA_CLOUD_BASE_URL == "")
     {
      Alert("EA Cloud: Missing credentials. Please re-download the EA from your EA Cloud portal.");
      return(INIT_FAILED);
     }

   Print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
   Print("EA Cloud Auto Trade Copier v3.00");
   Print("Mentor  : ${mentorDisplayName}");
   Print("EA Name : ${eaName}");
   Print("Account : ", (string)AccountInfoInteger(ACCOUNT_LOGIN), " @ ", AccountInfoString(ACCOUNT_SERVER));
   Print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

   string mt5Login  = (string)AccountInfoInteger(ACCOUNT_LOGIN);
   string mt5Server = AccountInfoString(ACCOUNT_SERVER);
   string headers   = "Content-Type: application/json\\r\\nX-API-Key: " + EA_CLOUD_API_KEY;

   //--- Step 1: Request a challenge nonce from EA Cloud
   string nonce = RequestChallenge(mt5Login, mt5Server, headers);
   if(nonce == "")
     {
      Print("EA Cloud ERROR: Could not obtain verification challenge. Will retry on next candle.");
      EventSetTimer(60);
      return(INIT_SUCCEEDED); // Don't block — retry via heartbeat
     }

   //--- Step 2: Register account with the nonce (proves EA is live on this account)
   bool verified = RegisterAccount(mt5Login, mt5Server, nonce, headers);
   if(verified)
      Print("EA Cloud: Account verified via challenge-response. ✓ Signals are active.");
   else
      Print("EA Cloud WARNING: Verification failed. Signals will not be forwarded until verified.");

   EventSetTimer(60); // Heartbeat every 60 s
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
//| Step 1 — Request a nonce challenge from the server               |
//+------------------------------------------------------------------+
string RequestChallenge(string mt5Login, string mt5Server, string headers)
  {
   string url  = EA_CLOUD_BASE_URL + "/signals/challenge";
   string body = "{\\"mt5Login\\":\\"" + mt5Login + "\\","
               + "\\"mt5Server\\":\\"" + mt5Server + "\\"}";

   char postData[]; StringToCharArray(body, postData, 0, StringLen(body));
   char resp[];     string resHeaders;

   int code = WebRequest("POST", url, headers, 8000, postData, resp, resHeaders);
   if(code == 201)
     {
      string respStr = CharArrayToString(resp);
      if(EnableLogging) Print("EA Cloud Challenge: ", respStr);
      // Extract nonce from JSON: find "nonce":"<value>"
      int start = StringFind(respStr, "\\"nonce\\":\\"");
      if(start < 0) return "";
      start += 9;
      int end = StringFind(respStr, "\\"", start);
      if(end <= start) return "";
      return StringSubstr(respStr, start, end - start);
     }
   else if(code == -1)
      Print("EA Cloud: Add '", EA_CLOUD_BASE_URL, "' to Tools → Options → Expert Advisors → Allow WebRequest.");
   else
      Print("EA Cloud Challenge failed HTTP ", code, ". Check your broker server is on the approved list.");
   return "";
  }

//+------------------------------------------------------------------+
//| Step 2 — Register account + submit nonce to complete challenge   |
//+------------------------------------------------------------------+
bool RegisterAccount(string mt5Login, string mt5Server, string nonce, string headers)
  {
   string url  = EA_CLOUD_BASE_URL + "/signals/register-account";
   string body = "{\\"mt5Login\\":\\"" + mt5Login + "\\","
               + "\\"mt5Server\\":\\"" + mt5Server + "\\","
               + "\\"nonce\\":\\"" + nonce + "\\","
               + "\\"mt5Name\\":\\"" + AccountInfoString(ACCOUNT_NAME) + "\\","
               + "\\"mt5Currency\\":\\"" + AccountInfoString(ACCOUNT_CURRENCY) + "\\","
               + "\\"mt5Balance\\":\\"" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + "\\","
               + "\\"mt5Leverage\\":\\"" + (string)AccountInfoInteger(ACCOUNT_LEVERAGE) + "\\"" + "}";

   char postData[]; StringToCharArray(body, postData, 0, StringLen(body));
   char resp[];     string resHeaders;

   int code = WebRequest("POST", url, headers, 8000, postData, resp, resHeaders);
   if(EnableLogging)
      Print("EA Cloud Register → HTTP ", code, " | ", CharArrayToString(resp));
   return(code == 201 || code == 200);
  }

//+------------------------------------------------------------------+
//| Deinitialisation                                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   Print("EA Cloud Copier stopped. Reason: ", reason);
  }

//+------------------------------------------------------------------+
//| Heartbeat — keeps verification alive; retries challenge if needed|
//+------------------------------------------------------------------+
void OnTimer()
  {
   if(!EnableCopier) return;

   string mt5Login  = (string)AccountInfoInteger(ACCOUNT_LOGIN);
   string mt5Server = AccountInfoString(ACCOUNT_SERVER);
   string headers   = "Content-Type: application/json\\r\\nX-API-Key: " + EA_CLOUD_API_KEY;

   string url  = EA_CLOUD_BASE_URL + "/signals/heartbeat";
   string body = "{\\"mt5Login\\":\\"" + mt5Login + "\\","
               + "\\"mt5Server\\":\\"" + mt5Server + "\\"}";

   char postData[]; StringToCharArray(body, postData, 0, StringLen(body));
   char resp[];     string resHeaders;

   int code = WebRequest("POST", url, headers, 3000, postData, resp, resHeaders);

   // If account not found (404), the EA needs to re-verify
   if(code == 404)
     {
      Print("EA Cloud: Account registration lost — re-verifying...");
      string nonce = RequestChallenge(mt5Login, mt5Server, headers);
      if(nonce != "") RegisterAccount(mt5Login, mt5Server, nonce, headers);
     }
  }

//+------------------------------------------------------------------+
//| Trade transaction handler — fires on every deal fill             |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction& trans,
                        const MqlTradeRequest&     request,
                        const MqlTradeResult&      result)
  {
   if(!EnableCopier) return;
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD) return;

   ulong dealTicket = trans.deal;
   if(dealTicket <= 0) return;
   if(!HistoryDealSelect(dealTicket)) return;

   long   entry    = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
   string symbol   = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
   long   dealType = HistoryDealGetInteger(dealTicket, DEAL_TYPE);
   double lots     = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
   double price    = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
   double sl       = HistoryDealGetDouble(dealTicket, DEAL_SL);
   double tp       = HistoryDealGetDouble(dealTicket, DEAL_TP);
   long   posId    = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
   int    digits   = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);

   string signalStr, typeStr;
   if(entry == DEAL_ENTRY_IN)
     { signalStr = "OPEN";  typeStr = (dealType == DEAL_TYPE_BUY) ? "BUY" : "SELL"; }
   else if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY)
     { signalStr = "CLOSE"; typeStr = (dealType == DEAL_TYPE_BUY) ? "BUY" : "SELL"; }
   else return;

   string payload = "{\\"signal\\":\\"" + signalStr + "\\","
                  + "\\"symbol\\":\\"" + symbol + "\\","
                  + "\\"orderType\\":\\"" + typeStr + "\\","
                  + "\\"lots\\":" + DoubleToString(lots, 2) + ","
                  + "\\"openPrice\\":" + DoubleToString(price, digits) + ","
                  + "\\"stopLoss\\":" + DoubleToString(sl, digits) + ","
                  + "\\"takeProfit\\":" + DoubleToString(tp, digits) + ","
                  + "\\"ticket\\":\\"" + (string)posId + "\\","
                  + "\\"eaId\\":" + (string)AccountInfoInteger(ACCOUNT_LOGIN) + ","
                  + "\\"comment\\":\\"" + EA_CLOUD_EA_NAME + " | EA CLOUD\\"" + "}";

   SendSignal(payload);
  }

//+------------------------------------------------------------------+
//| HTTP POST helper for trade signals                               |
//+------------------------------------------------------------------+
void SendSignal(string payload)
  {
   string url     = EA_CLOUD_BASE_URL + "/signals/webhook";
   string headers = "Content-Type: application/json\\r\\nX-API-Key: " + EA_CLOUD_API_KEY;

   char  postData[]; StringToCharArray(payload, postData, 0, StringLen(payload));
   char  resp[];     string resHeaders;

   int code = WebRequest("POST", url, headers, 5000, postData, resp, resHeaders);

   if(EnableLogging)
      Print("EA Cloud Signal → HTTP ", code, " | ", payload);
  }

//+------------------------------------------------------------------+
//| Tick (required stub)                                             |
//+------------------------------------------------------------------+
void OnTick() {}
//+------------------------------------------------------------------+
`;
};

// ─── GET /api/admin/copier/download ───────────────────────────────────────────
// Returns a personalised MQ5 EA file. Embeds the decrypted raw API key so the EA
// can authenticate against the hash-based webhook.
router.get("/admin/copier/download", async (req: any, res) => {
  try {
    const mentor = await getMentorFromBearer(req.headers.authorization);
    if (!mentor) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (mentor.status !== "approved") {
      res.status(403).json({ error: "Your account must be approved before downloading the EA." }); return;
    }

    if (!mentor.apiKey) {
      res.status(422).json({ error: "No API key on record. Please regenerate your API key on the Profile page." }); return;
    }

    // Decrypt the raw key to embed in the MQ5 file
    const rawApiKey = await getRawApiKeyForEmbed(mentor.id);
    if (!rawApiKey) {
      res.status(422).json({
        error: "API key cannot be embedded (it was issued before encryption was available). Please regenerate your API key on the Profile page, then re-download.",
      }); return;
    }

    const host     = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
    const protocol = "https";
    const baseUrl  = req.query.format==="zip"?"https://eacloudhoster.online/api":`${protocol}://${host}/api`;

    const eaName      = mentor.robotName || mentor.mentorName || "EA Cloud Copier";
    const displayName = mentor.mentorName || mentor.firstName?.trim() || "Mentor";
    const today       = new Date().toISOString().split("T")[0];

    const mq5Content = buildMq5({
      apiKey: rawApiKey,
      baseUrl,
      eaName,
      mentorDisplayName: displayName,
      generatedDate: today,
    });

    const filename = `EACloud_Copier_${eaName.replace(/[^a-zA-Z0-9]/g, "_")}.mq5`;
    res.setHeader("Cache-Control","no-store");
    if(req.query.format==="zip"){
      const folder=safeFilename(eaName)+"_Copier";
      const guide=`HOW TO INSTALL ${eaName} COPY TRADING\n\n1. Open desktop MT5 → File → Open Data Folder.\n2. Copy ${filename} into MQL5/Experts.\n3. Open MetaEditor and compile with F7; compilation remains unverified here.\n4. Add https://eacloudhoster.online under Tools → Options → Expert Advisors → Allow WebRequest.\n5. Attach the copier to ONE chart on your DEMO source account.\n6. Confirm the existing server whitelist/account verification requirements in EA Cloud.\n7. Enable the required permissions and inspect Experts/Journal plus actual client execution history.\n8. Never run this legacy copier alongside enabled integrated trade sharing for the same mentor. The backend blocks this legacy webhook while that route is enabled.\n9. Keep this source private: it contains the existing mentor copier credential.\n10. Test your DEMO account before live use. This preserves the existing copier; its partial-close, reversal, SL/TP and offline-recovery limitations remain.\n\nAuthenticated ingestion: https://eacloudhoster.online/api/signals/webhook. Configuration and receipt alone do not prove a broker fill.\n`;
      res.setHeader("Content-Type","application/zip");res.setHeader("Content-Disposition",`attachment; filename="${folder}.zip"`);
      res.send(Buffer.from(zipSync({[folder+"/"+filename]:strToU8(mq5Content),[folder+"/INSTALLATION_GUIDE.txt"]:strToU8(guide)})));return;
    }
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(mq5Content);
  } catch (err) {
    req.log.error({ err }, "CopierDownload error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
