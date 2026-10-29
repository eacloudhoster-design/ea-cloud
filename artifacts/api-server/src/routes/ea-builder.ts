import { Router } from "express";
import multer from "multer";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import {
  db,
  usersTable,
  easTable,
  robotBuildsTable,
  robotEventsTable,
} from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { webhookLimiter } from "../lib/rate-limit";
import {
  buildInput,
  robotEvent,
  STRATEGY_AVAILABLE,
  TEMPLATE_VERSION,
} from "../lib/ea-builder/contracts";
import { buildToolkit, ImageInputError } from "../lib/ea-builder/worker";
const router = Router();
let building = false;
const ORIGIN = "https://eacloudhoster.online";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 5,
    fieldSize: 512,
    parts: 7,
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
    blocker:
      "The complete original SMC Blueprint strategy and dependencies are required. The supplied fragment ends inside CreateLabel(). MetaEditor compilation and broker execution are unverified.",
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
    if (input.data.purpose === "trading") {
      res.status(409).json({
        error:
          "Trading EA generation is blocked: the complete verified original strategy is missing. No trading robot was generated.",
        code: "ORIGINAL_STRATEGY_REQUIRED",
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
      const id = randomUUID(),
        token = "eacr_" + randomBytes(32).toString("hex");
      // Build first; invalid images/archives never create a credential or database row.
      const archive = await buildToolkit(
        {
          id,
          token,
          origin: ORIGIN,
          name: input.data.name,
          manager: input.data.managerName,
        },
        req.file?.buffer,
      );
      await db.insert(robotBuildsTable).values({
        id,
        mentorId: user.id,
        eaId: ea.id,
        displayName: input.data.name,
        managerName: input.data.managerName,
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
      res.json({ events, execution: false });
    } catch (err) {
      failure(req, res, err);
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
        await tx
          .update(robotBuildsTable)
          .set({ lastSeenAt: new Date() })
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
      // Capture-only until original strategy/lifecycle reconciliation is verified.
      // Deliberately never insert into trade_signals or wake the execution worker.
      return {
        status: inserted.length ? 201 : 200,
        body: {
          received: true,
          execution: false,
          eventId: payload.eventId,
          duplicate: !inserted.length,
        },
      };
    });
    res.status(result.status).json(result.body);
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
