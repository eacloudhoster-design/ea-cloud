import {
  verifyBrowserSession,
  browserSessionEvents,
} from "./lib/browser-session";
import { resolveAppSessionAccess } from "./lib/app-session-access";
import { WebSocketServer, WebSocket } from "ws";
import { type IncomingMessage } from "http";
import { db, appAccessTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./lib/logger";

interface ClientConnection {
  ws: WebSocket;
  clientId: number;
  mentorId: number | null;
  cookie: string;
  sessionHash: string;
}

const connections = new Map<WebSocket, ClientConnection>();

export function createWsServer(server: import("http").Server) {
  const wss = new WebSocketServer({ server, path: "/api/ws" });

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const principal = await verifyBrowserSession(req, "client").catch(
      () => null,
    );
    const origin = req.headers.origin;
    // WebSocket handshakes must originate from the same public host or an explicitly trusted origin.
    const sameHost =
      origin &&
      (() => {
        try {
          return new URL(origin).host === req.headers.host;
        } catch {
          return false;
        }
      })();
    const allowed = [
      process.env.PUBLIC_WEBSITE_ORIGIN,
      ...(process.env.AUTH_ALLOWED_ORIGINS || "").split(","),
    ]
      .filter(Boolean)
      .map((value) => value!.trim());
    if (!principal || (origin && !sameHost && !allowed.includes(origin))) {
      ws.close(1008, "Sign in required");
      return;
    }
    let clientId: number | null = null;
    let mentorId: number | null = null;
    try {
      const [client] = await db
        .select()
        .from(appAccessTable)
        .where(eq(appAccessTable.id, principal.id))
        .limit(1);
      const access = await resolveAppSessionAccess(client);
      if ("code" in access) {
        ws.close(1008, "Application session is no longer valid");
        return;
      }
      clientId = client.id;
      mentorId = access.mentorId;
    } catch {
      ws.close(1013, "Session check unavailable. Retry shortly");
      return;
    }

    if (clientId !== null) {
      connections.set(ws, {
        ws,
        clientId,
        mentorId,
        cookie: req.headers.cookie || "",
        sessionHash: principal.hash,
      });
      logger.info({ clientId, mentorId }, "WS client connected");
    }

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type: string };
        if (msg.type === "PING") {
          ws.send(JSON.stringify({ type: "PONG" }));
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on("close", () => {
      if (clientId !== null) {
        logger.info({ clientId }, "WS client disconnected");
      }
      connections.delete(ws);
    });

    ws.on("error", (err) => {
      logger.warn({ err }, "WS error");
      connections.delete(ws);
    });

    ws.send(JSON.stringify({ type: "CONNECTED", clientId, mentorId }));
  });

  // Revoke an already-open subscription through the same app-session policy.
  let checking = false;
  const validation = setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      for (const [ws, connection] of connections) {
        try {
          const session = await verifyBrowserSession(
            { headers: { cookie: connection.cookie } },
            "client",
          );
          if (!session) {
            connections.delete(ws);
            ws.close(1008, "Session ended");
            continue;
          }
          const [client] = await db
            .select()
            .from(appAccessTable)
            .where(eq(appAccessTable.id, connection.clientId))
            .limit(1);
          const access = await resolveAppSessionAccess(client);
          if ("code" in access || access.mentorId !== connection.mentorId) {
            connections.delete(ws);
            ws.close(1008, "Application session is no longer valid");
          }
        } catch {
          connections.delete(ws);
          ws.close(1013, "Session check unavailable. Retry shortly");
        }
      }
    } finally {
      checking = false;
    }
  }, 20000);
  validation.unref();
  const revoked = (hash: string) => {
    for (const [ws, connection] of connections)
      if (connection.sessionHash === hash) {
        connections.delete(ws);
        ws.close(1008, "Session ended");
      }
  };
  browserSessionEvents.on("revoke", revoked);
  wss.on("close", () => {
    clearInterval(validation);
    browserSessionEvents.off("revoke", revoked);
  });

  logger.info("WebSocket server initialised at /api/ws");
  return wss;
}

export function broadcastToMentorClients(mentorId: number, payload: unknown) {
  const message = JSON.stringify(payload);
  let count = 0;
  for (const [ws, conn] of connections) {
    if (conn.mentorId === mentorId && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      count++;
    }
  }
  logger.info({ mentorId, recipients: count }, "Trade signal broadcast");
}

export function broadcastToClient(clientId: number, payload: unknown) {
  const message = JSON.stringify(payload);
  let count = 0;
  for (const [ws, conn] of connections) {
    if (conn.clientId === clientId && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      count++;
    }
  }
  return count;
}

export function broadcastAll(payload: unknown) {
  const message = JSON.stringify(payload);
  for (const [ws] of connections) {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  }
}
