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
}

const connections = new Map<WebSocket, ClientConnection>();

export function createWsServer(server: import("http").Server) {
  const wss = new WebSocketServer({ server, path: "/api/ws" });

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "", `http://localhost`);
    const token = url.searchParams.get("token");

    let clientId: number | null = null;
    let mentorId: number | null = null;

    if (token) {
      try {
        const decoded = Buffer.from(token, "base64").toString();
        const [idStr, role] = decoded.split(":");
        if (role === "client" && /^[1-9]\d*$/.test(idStr) && Number.isSafeInteger(Number(idStr)) && Number(idStr) <= 2147483647) {
          const id = parseInt(idStr);
          const [client] = await db.select()
            .from(appAccessTable).where(eq(appAccessTable.id, id)).limit(1);
          const access = await resolveAppSessionAccess(client);
          if ("code" in access) { ws.close(1008, "Application session is no longer valid"); return; }
          if (client) { clientId = client.id; mentorId = access.mentorId; }
        }
      } catch {
        ws.close(1013, "Session check unavailable. Retry shortly");
        return;
      }
    }

    if (clientId !== null) {
      connections.set(ws, { ws, clientId, mentorId });
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
          const [client] = await db.select().from(appAccessTable).where(eq(appAccessTable.id, connection.clientId)).limit(1);
          const access = await resolveAppSessionAccess(client);
          if ("code" in access || access.mentorId !== connection.mentorId) { connections.delete(ws); ws.close(1008, "Application session is no longer valid"); }
        } catch { connections.delete(ws); ws.close(1013, "Session check unavailable. Retry shortly"); }
      }
    } finally { checking = false; }
  }, 20000);
  validation.unref();
  wss.on("close", () => clearInterval(validation));

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
