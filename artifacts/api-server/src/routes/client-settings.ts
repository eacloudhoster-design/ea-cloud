import {queueBotPush} from "../lib/web-push";
import { Router } from "express";
import { db, clientSettingsTable, appAccessTable, symbolPairsTable, clientSymbolConfigsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { encryptMT5Password } from "../lib/mt5-crypto";

const router = Router();

const EXTERNAL_MT5_BASE = "http://102.214.9.67:8000";
const EXTERNAL_MT5_URL = `${EXTERNAL_MT5_BASE}/connect-mt5`;

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
    if (lotMode !== undefined) updates.lotMode = lotMode;
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
    if(changed)await queueBotPush(req.clientId,settings.copyingEnabled?'started':'stopped');

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
    res.json(merged);
  } catch (err) {
    req.log.error({ err }, "UpdateSymbolConfigs error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Connect MT5 account — proxies credentials to the external MT5 backend
// (same logic as the Admin Portal route), then saves the result to the
// client's profile. Accepts both the new {login,password,server,broker}
// payload and the legacy {mt5Login,mt5Server,mt5Broker} field names.
router.post("/app/mt5-connect", requireClientAuth, async (req: any, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const login = (body.login ?? body.mt5Login) as unknown;
    const password = (body.password ?? body.mt5Password) as string | undefined;
    const server = (body.server ?? body.mt5Server) as string | undefined;
    const broker = (body.broker ?? body.mt5Broker) as string | undefined;

    req.log.info(
      { clientId: req.clientId, login, server, broker, hasPassword: Boolean(password) },
      "[ClientMT5] connect request received",
    );

    if (!login || !password || !server) {
      res.status(400).json({ error: "login, password, and server are required" }); return;
    }

    const loginNum = Number(login);
    if (!Number.isInteger(loginNum) || loginNum <= 0) {
      res.status(400).json({ error: "login must be a valid positive integer" }); return;
    }

    // ── Forward to external MT5 backend ──────────────────────────────────────
    let externalData: Record<string, unknown> = {};
    let externalStatus = 0;
    let connected = false;

    try {
      const payload = { login: loginNum, password, server };
      req.log.info(
        { url: EXTERNAL_MT5_URL, payload: { login: loginNum, server, hasPassword: true } },
        "[ClientMT5] forwarding to external MT5 backend",
      );

      const externalRes = await fetch(EXTERNAL_MT5_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });

      externalStatus = externalRes.status;
      externalData = (await externalRes.json().catch(() => ({}))) as Record<string, unknown>;
      // The external backend can return HTTP 200 with {success:false} on a failed
      // login, so a 2xx alone is not enough — also honour explicit failure flags.
      connected =
        externalRes.ok &&
        externalData.success !== false &&
        externalData.status !== "failed" &&
        externalData.connected !== false;

      req.log.info(
        { externalStatus, connected, externalData },
        "[ClientMT5] external MT5 backend response",
      );
    } catch (fetchErr: unknown) {
      const message = (fetchErr as Error)?.message ?? "Connection timeout";
      req.log.warn({ fetchErr: message }, "[ClientMT5] external MT5 backend unreachable");
      res.status(502).json({ error: `MT5 backend unreachable: ${message}` });
      return;
    }

    // ── Failure: return the exact backend error message + details ────────────
    if (!connected) {
      const backendError =
        (externalData.error as string) ||
        (externalData.message as string) ||
        (externalData.detail as string) ||
        (externalData.msg as string) ||
        "Connection failed";
      // Surface the raw MT5 diagnostic (e.g. mt5.last_error()) if the backend
      // provides it, so the client can see the real initialization failure.
      const details = externalData.details ?? externalData.last_error ?? null;
      req.log.info(
        { externalStatus, backendError, details },
        "[ClientMT5] connection rejected by backend",
      );
      res.status(422).json({ error: backendError, details });
      return;
    }

    // ── Success: extract account details (handles both flat and nested shapes)
    // The external backend may return either flat fields or an `account` object:
    //   { success:true, account:{ login, balance, equity, server, broker, account_name } }
    const account =
      (externalData.account as Record<string, unknown> | undefined) ?? externalData;

    const pick = (...keys: string[]): unknown => {
      for (const k of keys) {
        if (account[k] !== undefined && account[k] !== null) return account[k];
        if (externalData[k] !== undefined && externalData[k] !== null) return externalData[k];
      }
      return undefined;
    };

    const balanceRaw = pick("balance");
    const balance = balanceRaw !== undefined ? String(balanceRaw) : null;
    const equityRaw = pick("equity");
    const equity = equityRaw !== undefined ? String(equityRaw) : null;
    const resolvedBroker =
      (pick("broker") as string | undefined) ?? broker ?? null;
    const accountName = (pick("account_name", "accountName", "name") as string | undefined) ?? null;
    const mt5LoginStr = String(loginNum);
    const connectedAt = new Date().toISOString();

    // Encrypt the password for copy-trade execution — NEVER stored in plain text.
    const encryptedMt5Password = encryptMT5Password(password);

    let [existing] = await db.select({ id: clientSettingsTable.id })
      .from(clientSettingsTable).where(eq(clientSettingsTable.clientId, req.clientId)).limit(1);

    if (existing) {
      await db.update(clientSettingsTable)
        .set({ mt5Login: mt5LoginStr, mt5Server: server, mt5Broker: resolvedBroker, encryptedMt5Password, mt5Connected: true })
        .where(eq(clientSettingsTable.clientId, req.clientId));
    } else {
      await db.insert(clientSettingsTable)
        .values({ clientId: req.clientId, mt5Login: mt5LoginStr, mt5Server: server, mt5Broker: resolvedBroker, encryptedMt5Password, mt5Connected: true });
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
    req.log.error({ err }, "[ClientMT5] MT5Connect error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// MT5 service health check — proxies to the external MT5 backend's /mt5-health
// endpoint so the client can diagnose terminal/initialization status. The
// external (Python/MetaTrader5) service must implement GET /mt5-health.
router.get("/app/mt5-health", requireClientAuth, async (req: any, res) => {
  try {
    const externalRes = await fetch(`${EXTERNAL_MT5_BASE}/mt5-health`, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });
    const data = await externalRes.json().catch(() => ({}));
    req.log.info({ externalStatus: externalRes.status, data }, "[ClientMT5] mt5-health response");
    res.status(externalRes.ok ? 200 : 502).json(data);
  } catch (err: unknown) {
    const message = (err as Error)?.message ?? "unreachable";
    req.log.warn({ err: message }, "[ClientMT5] mt5-health unreachable");
    res.status(502).json({
      terminal_installed: null,
      terminal_running: null,
      mt5_initialized: false,
      last_error: `MT5 backend unreachable: ${message}`,
    });
  }
});

// Disconnect MT5
router.post("/app/mt5-disconnect", requireClientAuth, async (req: any, res) => {
  try {
    await db.update(clientSettingsTable)
      .set({ mt5Connected: false, mt5Login: null, mt5Server: null, mt5Broker: null, encryptedMt5Password: null })
      .where(eq(clientSettingsTable.clientId, req.clientId));
    res.json({ connected: false });
  } catch (err) {
    req.log.error({ err }, "MT5Disconnect error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
