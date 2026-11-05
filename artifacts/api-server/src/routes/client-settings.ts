import { randomUUID } from "node:crypto";
import {queueBotPush, queueSymbolPush} from "../lib/web-push";
import { Router } from "express";
import { db, clientSettingsTable, appAccessTable, symbolPairsTable, clientSymbolConfigsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAppSession } from "../middlewares/app-session";
import { clientEngineStatus } from "../lib/engine-status";
import { bindClientAccount } from "../lib/bind-client-account";
import { readBoundAccount } from "../lib/mt5-account-status";
import { encryptMT5Password } from "../lib/mt5-crypto";

const router = Router();


const requireClientAuth = async (req: any, res: any, next: any) => {
  const auth = req.headers.authorization as string | undefined;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const token = auth.slice(7);
  try {
    const decoded = Buffer.from(token, "base64").toString();
    const [idStr, role] = decoded.split(":");
    if (role !== "client") { res.status(401).json({ error: "Unauthorized" }); return; }
    const id = parseInt(idStr);
    const [client] = await db.select().from(appAccessTable).where(eq(appAccessTable.id, id)).limit(1);
    if (!client) { res.status(401).json({ error: "Unauthorized" }); return; }
    req.clientId = id;
    next();
  } catch { res.status(401).json({ error: "Unauthorized" }); }
};

// Get client's trading settings (create defaults if not exists)
router.get("/app/trading-controls", requireClientAuth, async (req: any, res) => {
  try {
    let [settings] = await db.select().from(clientSettingsTable)
      .where(eq(clientSettingsTable.clientId, req.clientId)).limit(1);

    if (!settings) {
      [settings] = await db.insert(clientSettingsTable)
        .values({ clientId: req.clientId }).returning();
    }
    // Never expose the encrypted password in API responses.
    const { encryptedMt5Password: _omit, ...safe } = settings;
    res.json(safe);
  } catch (err) {
    req.log.error({ err }, "GetTradingControls error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update client's trading settings
router.patch("/app/trading-controls", requireClientAuth, async (req: any, res) => {
  try {
    const {
      lotMode, fixedLotSize, riskPercent, lotMultiplier,
      maxDailyDrawdown, maxOpenTrades, maxLotSize,
      symbolFilters, copyingEnabled,
    } = req.body as Record<string, unknown>;

    const updates: Record<string, unknown> = {};
    if (lotMode !== undefined) {
      if(!["fixed","multiplier"].includes(String(lotMode))){res.status(422).json({error:"Choose fixed or multiplier sizing; verified risk-percent sizing is not available",code:"LOT_MODE_UNSUPPORTED"});return;}
      updates.lotMode=lotMode;
    }
    if (fixedLotSize !== undefined) updates.fixedLotSize = String(fixedLotSize);
    if (riskPercent !== undefined) updates.riskPercent = String(riskPercent);
    if (lotMultiplier !== undefined) updates.lotMultiplier = String(lotMultiplier);
    if (maxDailyDrawdown !== undefined) updates.maxDailyDrawdown = String(maxDailyDrawdown);
    if (maxOpenTrades !== undefined) updates.maxOpenTrades = Number(maxOpenTrades);
    if (maxLotSize !== undefined) updates.maxLotSize = String(maxLotSize);
    if (symbolFilters !== undefined) updates.symbolFilters = String(symbolFilters);
    if (copyingEnabled !== undefined) {
      if(typeof copyingEnabled!=="boolean"){res.status(400).json({error:"copyingEnabled must be boolean"});return;}
      updates.copyingEnabled = copyingEnabled;
    }

    const {settings,changed}=await db.transaction(async tx=>{
      const [existing]=await tx.select().from(clientSettingsTable).where(eq(clientSettingsTable.clientId,req.clientId)).limit(1).for("update");
      const [settings]=existing?await tx.update(clientSettingsTable).set(updates).where(eq(clientSettingsTable.clientId,req.clientId)).returning():await tx.insert(clientSettingsTable).values({clientId:req.clientId,...updates}).returning();
      return {settings,changed:typeof copyingEnabled==="boolean"&&existing?.copyingEnabled!==settings.copyingEnabled};
    });
    if(changed)await queueBotPush(req.clientId,settings.copyingEnabled?'started':'stopped',req.log,settings.updatedAt?.toISOString());

    // Never expose the encrypted password in API responses.
    const { encryptedMt5Password: _omit, ...safe } = settings;
    res.json(safe);
  } catch (err) {
    req.log.error({ err }, "UpdateTradingControls error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get the available trading pairs for this client's mentor, merged with the
// client's own broker-symbol selections + custom lot sizes. Drives the
// "Broker Symbols" config screen in the client app.
router.get("/app/symbol-configs", requireClientAuth, async (req: any, res) => {
  try {
    const [client] = await db.select({ mentorId: appAccessTable.mentorId })
      .from(appAccessTable).where(eq(appAccessTable.id, req.clientId)).limit(1);

    if (!client?.mentorId) { res.json([]); return; }

    const [pairs, configs] = await Promise.all([
      db.select().from(symbolPairsTable)
        .where(and(eq(symbolPairsTable.mentorId, client.mentorId), eq(symbolPairsTable.isActive, true))),
      db.select().from(clientSymbolConfigsTable)
        .where(eq(clientSymbolConfigsTable.clientId, req.clientId)),
    ]);

    const byPair = new Map(configs.map((c) => [c.pairName, c]));
    const merged = pairs.map((p) => {
      const cfg = byPair.get(p.pairName);
      return {
        pairName: p.pairName,
        variations: p.variations.split(",").map((s) => s.trim()).filter(Boolean),
        selectedSymbol: cfg?.selectedSymbol ?? null,
        customLotSize: cfg?.customLotSize ?? null,
      };
    });
    res.json(merged);
  } catch (err) {
    req.log.error({ err }, "GetSymbolConfigs error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Upsert the client's broker-symbol selections + per-pair custom lot sizes.
router.patch("/app/symbol-configs", requireClientAuth, async (req: any, res) => {
  try {
    const body = req.body as { configs?: unknown };
    const configs = Array.isArray(body.configs) ? body.configs : [];
    const requestedSaveId = req.get("X-Symbol-Save-Id");
    const saveId = typeof requestedSaveId === "string" && /^[a-f0-9-]{36}$/i.test(requestedSaveId)
      ? requestedSaveId.toLowerCase() : randomUUID();
    const savedPairs = new Set<string>();

    // Resolve the client's mentor and that mentor's active pairs up front so we
    // can reject any config that targets a pair the client isn't allowed to set,
    // or a selectedSymbol outside the mentor-defined variations for that pair.
    const [client] = await db.select({ mentorId: appAccessTable.mentorId })
      .from(appAccessTable).where(eq(appAccessTable.id, req.clientId)).limit(1);
    if (!client?.mentorId) { res.json([]); return; }

    const activePairs = await db.select().from(symbolPairsTable)
      .where(and(eq(symbolPairsTable.mentorId, client.mentorId), eq(symbolPairsTable.isActive, true)));
    const allowedByPair = new Map(
      activePairs.map((p) => [
        p.pairName,
        new Set([p.pairName, ...p.variations.split(",").map((s) => s.trim()).filter(Boolean)]),
      ]),
    );

    for (const raw of configs) {
      const c = raw as { pairName?: unknown; selectedSymbol?: unknown; customLotSize?: unknown };
      const pairName = typeof c.pairName === "string" ? c.pairName.trim() : "";
      if (!pairName) continue;

      // Pair must be an active pair belonging to this client's mentor.
      const allowedSymbols = allowedByPair.get(pairName);
      if (!allowedSymbols) {
        res.status(400).json({ error: `Unknown or inactive pair: ${pairName}` });
        return;
      }

      const selectedSymbol =
        c.selectedSymbol === null || c.selectedSymbol === undefined || c.selectedSymbol === ""
          ? null
          : String(c.selectedSymbol).trim();
      // selectedSymbol, when set, must be the canonical name or a defined variation.
      if (selectedSymbol !== null && !allowedSymbols.has(selectedSymbol)) {
        res.status(400).json({ error: `Symbol "${selectedSymbol}" is not a valid variation of ${pairName}` });
        return;
      }

      let customLotSize: string | null = null;
      if (!(c.customLotSize === null || c.customLotSize === undefined || c.customLotSize === "")) {
        const lot = Number(c.customLotSize);
        if (!Number.isFinite(lot) || lot <= 0) {
          res.status(400).json({ error: `Invalid custom lot size for ${pairName}` });
          return;
        }
        customLotSize = lot.toFixed(2);
      }

      const [existing] = await db.select({ id: clientSymbolConfigsTable.id })
        .from(clientSymbolConfigsTable)
        .where(and(
          eq(clientSymbolConfigsTable.clientId, req.clientId),
          eq(clientSymbolConfigsTable.pairName, pairName),
        )).limit(1);

      if (existing) {
        await db.update(clientSymbolConfigsTable)
          .set({ selectedSymbol, customLotSize })
          .where(eq(clientSymbolConfigsTable.id, existing.id));
      } else {
        await db.insert(clientSymbolConfigsTable)
          .values({ clientId: req.clientId, pairName, selectedSymbol, customLotSize });
      }
      savedPairs.add(pairName);
    }

    // Return the freshly merged view so the client can re-render immediately.

    const [pairs, saved] = await Promise.all([
      db.select().from(symbolPairsTable)
        .where(and(eq(symbolPairsTable.mentorId, client.mentorId), eq(symbolPairsTable.isActive, true))),
      db.select().from(clientSymbolConfigsTable)
        .where(eq(clientSymbolConfigsTable.clientId, req.clientId)),
    ]);
    const byPair = new Map(saved.map((c) => [c.pairName, c]));
    const merged = pairs.map((p) => {
      const cfg = byPair.get(p.pairName);
      return {
        pairName: p.pairName,
        variations: p.variations.split(",").map((s) => s.trim()).filter(Boolean),
        selectedSymbol: cfg?.selectedSymbol ?? null,
        customLotSize: cfg?.customLotSize ?? null,
      };
    });
    // Reuse the persisted values, never request labels or unsaved edits. Clears
    // are deliberately silent. Queue storage failures cannot roll back the save.
    await queueSymbolPush(req.clientId, merged.filter(c => savedPairs.has(c.pairName) && c.selectedSymbol !== null)
      .map(c => ({ pairName: c.pairName, selectedSymbol: c.selectedSymbol! })), saveId, req.log);
    res.set("X-Symbol-Save-Id", saveId).json(merged);
  } catch (err) {
    req.log.error({ err }, "UpdateSymbolConfigs error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Connect MT5 account — proxies credentials to the external MT5 backend
// (same logic as the Admin Portal route), then saves the result to the
// client's profile. Accepts both the new {login,password,server,broker}
// payload and the legacy {mt5Login,mt5Server,mt5Broker} field names.
router.post(["/app/mt5-connect","/client/mt5/connect"], requireAppSession, requireClientAuth, async (req: any, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const login = (body.login ?? body.mt5Login) as unknown;
    const password = (body.password ?? body.mt5Password) as string | undefined;
    const server = (body.server ?? body.mt5Server) as string | undefined;
    const broker = (body.broker ?? body.mt5Broker) as string | undefined;

    req.log.info(
      { clientId: req.clientId },
      "[ClientMT5] connect request received",
    );

    if (!login || !password || !server) {
      res.status(400).json({ error: "login, password, and server are required" }); return;
    }

    const loginNum = Number(login);
    if (!Number.isInteger(loginNum) || loginNum <= 0) {
      res.status(400).json({ error: "login must be a valid positive integer" }); return;
    }

    if (typeof password !== "string" || password.length > 1024 || typeof server !== "string" || server.length > 256 || !Number.isSafeInteger(loginNum)) {
      res.status(400).json({error:"Invalid account credentials"});return;
    }
    let account;
    try { account=await readBoundAccount(loginNum,server,password); }
    catch {res.status(422).json({error:"A provisioned demo account could not be verified",code:"MT5_BINDING_UNVERIFIED"});return;}
    if(account.role!=="client"){res.status(403).json({error:"A receiving client account is required"});return;}
    const balance=account.balance===null?null:String(account.balance),equity=account.equity===null?null:String(account.equity);
    const resolvedBroker=account.broker,accountName=null,mt5LoginStr=String(loginNum),connectedAt=new Date().toISOString();

    // Encrypt the password for copy-trade execution — NEVER stored in plain text.
    const encryptedMt5Password = encryptMT5Password(password);

    try {await bindClientAccount(req.clientId,{login:mt5LoginStr,server,broker:resolvedBroker},encryptedMt5Password);}
    catch(error){
      const code=error instanceof Error?error.message:"";
      if(["ACCOUNT_ALREADY_BOUND","ACCOUNT_REBIND_REQUIRES_RECONCILIATION"].includes(code)){res.status(409).json({error:"Account binding requires operator review",code});return;}
      throw error;
    }

    req.log.info(
      { clientId: req.clientId, login: loginNum, server, balance },
      "[ClientMT5] connection saved to client profile",
    );

    res.json({
      connected: true,
      status: "connected",
      login: mt5LoginStr,
      server,
      broker: resolvedBroker,
      accountName,
      balance,
      equity,
      connectedAt,
    });
  } catch (err) {
    req.log.error({ clientId:req.clientId }, "[ClientMT5] account verification or storage failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Account-owned health uses the same credential-bound status contract.
router.get("/app/mt5-health", requireAppSession, async (req: any, res) => {
  res.setHeader("Cache-Control","no-store");
  try {
    const status=await clientEngineStatus(req.clientId,true);
    res.json({mt5_initialized:status.connection.verified,connection:status.connection,copier:status.copier,observedAt:status.observedAt});
  } catch {res.status(503).json({mt5_initialized:false,code:"ENGINE_STATUS_UNAVAILABLE"});}
});

// Disconnect MT5
router.post("/app/mt5-disconnect", requireClientAuth, async (req: any, res) => {
  try {
    await db.update(clientSettingsTable)
      .set({ mt5Connected: false, copyingEnabled: false })
      .where(eq(clientSettingsTable.clientId, req.clientId));
    res.json({ connected: false, copyingEnabled:false, credentialsRetainedForReconciliation:true });
  } catch (err) {
    req.log.error({ err }, "MT5Disconnect error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
