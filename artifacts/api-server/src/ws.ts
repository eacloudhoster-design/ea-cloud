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
        if (role === "client") {
          const id = parseInt(idStr);
          const [client] = await db.select({ id: appAccessTable.id, mentorId: appAccessTable.mentorId })
            .from(appAccessTable).where(eq(appAccessTable.id, id)).limit(1);
          if (client) {
            clientId = client.id;
            mentorId = client.mentorId ?? null;
          }
        }
      } catch {
        // unauthenticated — allow read-only connection
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
