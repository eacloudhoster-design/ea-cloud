import { Router } from "express";
import multer from "multer";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import {
  db,
  usersTable,
  easTable,
  robotBuildsTable,
  robotEventsTable,
  tradeSignalsTable,
} from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { webhookLimiter } from "../lib/rate-limit";
import {
  buildInput,
  robotEvent,
  observerHeartbeat,
  STRATEGY_AVAILABLE,
  TEMPLATE_VERSION,
} from "../lib/ea-builder/contracts";
import { buildToolkit, ImageInputError } from "../lib/ea-builder/worker";
import {
  lockMentor,
  enableObserver,
  routeSnapshot,
} from "../lib/ea-builder/routing";
import { observerCapabilities } from "../lib/observer-vps";
import { wakeWorker } from "../lib/signal-worker";
const router = Router();
let building = false;
const ORIGIN = "https://eacloudhoster.online";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 6,
    fieldSize: 512,
    parts: 8,
  },
}).single("background");
const failure = (req: any, res: any, error: unknown) => {
  req.log?.error(
    { event: "ea_builder_failed", code: (error as any)?.code },
    "EA builder request failed",
  );
  res.status(503).json({
    error:
      "EA builder is unavailable. Verify the reviewed robot-builds migration and retry.",
  });
};
async function approved(req: AuthRequest, res: any, next: any) {
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!))
      .limit(1);
    if (
      !user ||
      user.status !== "approved" ||
      !["mentor", "superadmin"].includes(user.role) ||
      user.role !== req.userRole
    ) {
      res
        .status(403)
        .json({ error: "An approved mentor account is required." });
      return;
    }
    (req as any).builderMentor = user;
    next();
  } catch (error) {
    failure(req, res, error);
  }
}
router.get("/admin/ea-builder/config", requireAuth, approved, (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    strategyAvailable: STRATEGY_AVAILABLE,
    templateVersion: TEMPLATE_VERSION,
    origin: ORIGIN,
    legacyIngestion: ORIGIN + "/api/signals/webhook",
    toolkitExecution: false,
    existingObserverAvailable: true,
    observerExecution: "explicit_verified_activation_required",
    blocker:
      "The complete Intelligence EA V3+ source is available. Source packages require MetaEditor compilation before use.",
  });
});
router.post("/admin/ea-builder/package", requireAuth, approved, (req, res) => {
  if (building) {
    res
      .status(429)
      .json({ error: "Another package is being prepared. Retry shortly." });
    return;
  }
  building = true;
  const release = () => {
    building = false;
  };
  res.once("finish", release);
  let working = false;
  res.once("close", () => {
    if (!working) release();
  });
  upload(req, res, async (error) => {
    if (error) {
      res
        .status(400)
        .json({ error: "Upload one PNG, JPG or BMP image up to 10MB." });
      return;
    }
    const input = buildInput.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({
        error:
          "Choose an owned EA and valid EA/manager names (1–80 characters).",
      });
      return;
    }
    working = true;
    try {
      const user = (req as any).builderMentor;
      const [ea] = await db
        .select()
        .from(easTable)
        .where(
          and(eq(easTable.id, input.data.eaId), eq(easTable.mentorId, user.id)),
        )
        .limit(1);
      if (!ea) {
        res.status(404).json({ error: "EA not found in your account." });
        return;
      }
      const trading = input.data.purpose === "trading";
      const branding = trading
        ? {
            name: user.robotName?.trim() || ea.name,
            manager:
              user.mentorName?.trim() ||
              [user.firstName, user.lastName].filter(Boolean).join(" ").trim(),
          }
        : { name: input.data.name, manager: input.data.managerName };
      if (
        !buildInput.safeParse({
          ...input.data,
          name: branding.name,
          managerName: branding.manager,
        }).success
      ) {
        res
          .status(400)
          .json({
            error:
              "Add your EA name and manager name in Profile before creating your EA.",
          });
        return;
      }
      const id = randomUUID(),
        token = "eacr_" + randomBytes(32).toString("hex");
      // Build first; invalid images/archives never create a credential or database row.
      const archive = await buildToolkit(
        {
          id,
          token,
          origin: ORIGIN,
          name: branding.name,
          manager: branding.manager,
          trading,
          existingObserver: input.data.purpose === "existing-observer",
          sourceMagic: input.data.sourceMagic,
        },
        req.file?.buffer,
      );
      await db.insert(robotBuildsTable).values({
        id,
        mentorId: user.id,
        eaId: ea.id,
        displayName: branding.name,
        managerName: branding.manager,
        mode: trading
          ? "integrated-ea"
          : input.data.purpose === "existing-observer"
            ? "existing-observer"
            : "capture",
        sourceMagic: input.data.sourceMagic,
        templateVersion: TEMPLATE_VERSION,
        tokenHash: hash(token),
      });
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${archive.filename}"`,
      );
      res.send(archive.bytes);
    } catch (err) {
      if (err instanceof ImageInputError)
        res.status(400).json({ error: err.message });
      else failure(req, res, err);
    } finally {
      release();
    }
  });
});
router.get(
  "/admin/ea-builder/robots",
  requireAuth,
  approved,
  async (req: AuthRequest, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const rows = await db
        .select({
          id: robotBuildsTable.id,
          name: robotBuildsTable.displayName,
          eaId: robotBuildsTable.eaId,
          createdAt: robotBuildsTable.createdAt,
          revokedAt: robotBuildsTable.revokedAt,
          lastSeenAt: robotBuildsTable.lastSeenAt,
          lastEventAt: robotBuildsTable.lastEventAt,
          mode: robotBuildsTable.mode,
          sourceMagic: robotBuildsTable.sourceMagic,
          copyEnabled: robotBuildsTable.copyEnabled,
          inventoryCount: robotBuildsTable.inventoryCount,
          queueDepth: robotBuildsTable.queueDepth,
          historyHealthy: robotBuildsTable.historyHealthy,
          sourceAccount: robotBuildsTable.sourceAccount,
          sourceServer: robotBuildsTable.sourceServer,
        })
        .from(robotBuildsTable)
        .where(eq(robotBuildsTable.mentorId, req.userId!))
        .orderBy(desc(robotBuildsTable.createdAt))
        .limit(100);
      res.json({ robots: rows, execution: false });
    } catch (err) {
      failure(req, res, err);
    }
  },
);
router.delete(
  "/admin/ea-builder/robots/:id",
  requireAuth,
  approved,
  async (req: AuthRequest, res) => {
    try {
      const rows = await db
        .update(robotBuildsTable)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(robotBuildsTable.id, String(req.params.id)),
            eq(robotBuildsTable.mentorId, req.userId!),
          ),
        )
        .returning({ id: robotBuildsTable.id });
      if (!rows.length) {
        res.status(404).json({ error: "Robot not found." });
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      res.json({ revoked: true });
    } catch (err) {
      failure(req, res, err);
    }
  },
);
router.get(
  "/admin/ea-builder/robots/:id/events",
  requireAuth,
  approved,
  async (req: AuthRequest, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const events = await db
        .select({
          eventId: robotEventsTable.eventId,
          payload: robotEventsTable.payload,
          receivedAt: robotEventsTable.receivedAt,
          signalId: robotEventsTable.signalId,
          copyState: robotEventsTable.copyState,
        })
        .from(robotEventsTable)
        .where(
          and(
            eq(robotEventsTable.robotId, String(req.params.id)),
            eq(robotEventsTable.mentorId, req.userId!),
          ),
        )
        .orderBy(desc(robotEventsTable.receivedAt))
        .limit(20);
      const enriched = await Promise.all(
        events.map(async (event) => {
          if (!event.signalId) return { ...event, queueStatus: null };
          const [signal] = await db
            .select({
              status: tradeSignalsTable.status,
              error: tradeSignalsTable.lastError,
            })
            .from(tradeSignalsTable)
            .where(
              and(
                eq(tradeSignalsTable.id, event.signalId),
                eq(tradeSignalsTable.mentorId, req.userId!),
              ),
            )
            .limit(1);
          return {
            ...event,
            queueStatus: signal?.status || "unknown",
            queueError: signal?.error || null,
          };
        }),
      );
      res.json({ events: enriched, execution: "see_per_event_queue_status" });
    } catch (err) {
      failure(req, res, err);
    }
  },
);
router.post(
  "/admin/ea-builder/robots/:id/enable-copy",
  requireAuth,
  approved,
  async (req: AuthRequest, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.body?.confirmLegacyBlock !== true) {
      res.status(400).json({
        error: "Explicit legacy-ingestion blocking consent is required.",
      });
      return;
    }
    try {
      const capabilities = await observerCapabilities();
      if (!capabilities) {
        res.status(503).json({
          error: "Verified observer execution bridge is unavailable.",
        });
        return;
      }
      const outcome = await db.transaction(async (tx) => {
        await lockMentor(tx, req.userId!);
        const [robot] = await tx
          .select()
          .from(robotBuildsTable)
          .where(
            and(
              eq(robotBuildsTable.id, String(req.params.id)),
              eq(robotBuildsTable.mentorId, req.userId!),
            ),
          )
          .for("update")
          .limit(1);
        if (!robot) return "Robot not found.";
        return enableObserver(tx, robot, true);
      });
      if (outcome) {
        res.status(409).json({ error: outcome });
        return;
      }
      res.json({ enabled: true, legacyIngestionBlocked: true });
    } catch (error) {
      failure(req, res, error);
    }
  },
);
async function capture(req: any, res: any, event: boolean) {
  res.setHeader("Cache-Control", "no-store");
  const token = req.headers["x-ea-robot-token"];
  if (typeof token !== "string" || !/^eacr_[a-f0-9]{64}$/.test(token)) {
    res.status(401).json({ error: "Robot credential required." });
    return;
  }
  const parsed = event ? robotEvent.safeParse(req.body) : null;
  if (event && !parsed?.success) {
    res
      .status(400)
      .json({ error: "Invalid confirmed-trade event. No event was captured." });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [identity] = await tx
        .select({ mentorId: robotBuildsTable.mentorId })
        .from(robotBuildsTable)
        .where(eq(robotBuildsTable.tokenHash, hash(token)))
        .limit(1);
      if (!identity)
        return {
          status: 401,
          body: { error: "Robot credential is invalid or revoked." },
        };
      await lockMentor(tx, identity.mentorId);
      const [robot] = await tx
        .select()
        .from(robotBuildsTable)
        .where(eq(robotBuildsTable.tokenHash, hash(token)))
        .for("update")
        .limit(1);
      if (!robot || robot.revokedAt)
        return {
          status: 401,
          body: { error: "Robot credential is invalid or revoked." },
        };
      const [owner] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, robot.mentorId))
        .limit(1);
      if (
        !owner ||
        owner.status !== "approved" ||
        !["mentor", "superadmin"].includes(owner.role)
      )
        return { status: 403, body: { error: "Mentor is not approved." } };
      if (!event) {
        const heartbeat = observerHeartbeat.safeParse(req.body);
        if (
          ["existing-observer", "integrated-ea"].includes(robot.mode) &&
          !heartbeat.success
        )
          return {
            status: 400,
            body: {
              error: "Authenticated observer reconciliation metadata required.",
            },
          };
        if (
          heartbeat.success &&
          ((heartbeat.data.sourceMagic !== robot.sourceMagic &&
            !(robot.mode === "integrated-ea" && !robot.sourceAccount)) ||
            (robot.sourceAccount &&
              (robot.sourceAccount !== heartbeat.data.sourceAccount ||
                robot.sourceServer !== heartbeat.data.sourceServer)))
        )
          return {
            status: 409,
            body: { error: "Observer source binding or magic mismatch." },
          };
        if (
          heartbeat.success &&
          Number(robot.lastSequence || 0) > heartbeat.data.lastSequence
        )
          return {
            status: 409,
            body: {
              error:
                "Observer sequence moved backwards; retain recovery state.",
            },
          };
        await tx
          .update(robotBuildsTable)
          .set({
            lastSeenAt: new Date(),
            ...(heartbeat.success
              ? {
                  lastHeartbeatAt: new Date(),
                  sourceMagic: heartbeat.data.sourceMagic,
                  sourceAccount: heartbeat.data.sourceAccount,
                  sourceServer: heartbeat.data.sourceServer,
                  inventoryCount: heartbeat.data.inventoryCount,
                  queueDepth: heartbeat.data.queueDepth,
                  lastSequence: String(heartbeat.data.lastSequence),
                  historyHealthy: heartbeat.data.historyHealthy,
                }
              : {}),
          })
          .where(eq(robotBuildsTable.id, robot.id));
        return {
          status: 200,
          body: { received: true, execution: false, robotId: robot.id },
        };
      }
      const payload = parsed!.success ? parsed!.data : null;
      if (!payload) throw Error("Invalid event");
      if (
        robot.sourceAccount &&
        (robot.sourceAccount !== payload.sourceAccount ||
          robot.sourceServer !== payload.sourceServer)
      )
        return {
          status: 409,
          body: {
            error:
              "This robot is bound to a different source account. Generate a separate toolkit.",
          },
        };
      if (
        payload.kind === "SNAPSHOT" &&
        (!["existing-observer", "integrated-ea"].includes(robot.mode) ||
          payload.sourceMagic !== robot.sourceMagic)
      )
        return {
          status: 409,
          body: { error: "Observer source magic mismatch." },
        };
      const inserted = await tx
        .insert(robotEventsTable)
        .values({
          id: randomUUID(),
          robotId: robot.id,
          mentorId: robot.mentorId,
          sourceAccount: payload.sourceAccount,
          sourceServer: payload.sourceServer,
          eventId: payload.eventId,
          payload,
        })
        .onConflictDoNothing()
        .returning({ id: robotEventsTable.id });
      if (!inserted.length) {
        const [prior] = await tx
          .select()
          .from(robotEventsTable)
          .where(
            and(
              eq(robotEventsTable.mentorId, robot.mentorId),
              eq(robotEventsTable.sourceAccount, payload.sourceAccount),
              eq(robotEventsTable.sourceServer, payload.sourceServer),
              eq(robotEventsTable.eventId, payload.eventId),
            ),
          )
          .limit(1);
        if (
          !prior ||
          !Object.entries(payload).every(
            ([key, value]) =>
              (prior.payload as Record<string, unknown>)[key] === value,
          )
        )
          return {
            status: 409,
            body: {
              error: "Event identifier already exists with different data.",
            },
          };
      }
      await tx
        .update(robotBuildsTable)
        .set({
          lastSeenAt: new Date(),
          lastEventAt: new Date(),
          sourceAccount: payload.sourceAccount,
          sourceServer: payload.sourceServer,
        })
        .where(eq(robotBuildsTable.id, robot.id));
      let routing = { state: "capture_only", signalId: null as number | null };
      if (inserted.length) {
        routing = await routeSnapshot(tx, robot, payload, inserted[0].id);
        await tx
          .update(robotEventsTable)
          .set({ copyState: routing.state, signalId: routing.signalId })
          .where(eq(robotEventsTable.id, inserted[0].id));
      }
      return {
        status: inserted.length ? 201 : 200,
        body: {
          received: true,
          execution: !!routing.signalId,
          eventId: payload.eventId,
          duplicate: !inserted.length,
          copyState: routing.state,
        },
        wake: !!routing.signalId,
      };
    });
    res.status(result.status).json(result.body);
    if ("wake" in result && result.wake) wakeWorker(req.log);
  } catch (err) {
    failure(req, res, err);
  }
}
router.post("/robots/heartbeat", webhookLimiter, (req, res) => {
  void capture(req, res, false);
});
router.post("/robots/events", webhookLimiter, (req, res) => {
  void capture(req, res, true);
});
export default router;
