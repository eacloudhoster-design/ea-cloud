import { useEffect, useState, useCallback } from "react";

export interface TradeExecution {
  id: number;
  signalId: number;
  mentorId: number;
  clientId: number;
  signalKind: string;
  symbol: string;
  action: string | null;
  volume: string | null;
  status: "pending" | "success" | "failed" | "skipped";
  ticket: string | null;
  mentorTicket: string | null;
  retcode: number | null;
  attempts: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

const BASE = "/api";

function wsUrl(token: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${BASE}/ws?token=${encodeURIComponent(token)}`;
}

/**
 * Live copy-trade execution feed for the signed-in client.
 * - Loads the last executions via REST on mount.
 * - Subscribes to /api/ws for real-time TRADE_EXECUTION pushes, merging by id.
 * - Auto-reconnects with backoff while the token is present.
 *
 * All connection state (disposed flag, active socket, reconnect timer, attempt
 * counter) lives inside the effect closure so each token change gets an isolated
 * lifecycle — a stale effect can never reconnect with an old token or overwrite
 * newer state.
 */
export function useTradeExecutions(clientToken: string | null) {
  const [executions, setExecutions] = useState<TradeExecution[]>([]);
  const [connected, setConnected] = useState(false);

  const upsert = useCallback((row: TradeExecution) => {
    setExecutions((prev) => {
      const idx = prev.findIndex((e) => e.id === row.id);
      if (idx === -1) return [row, ...prev].slice(0, 50);
      const next = [...prev];
      next[idx] = row;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!clientToken) {
      setExecutions([]);
      setConnected(false);
      return;
    }

    let disposed = false;
    let activeWs: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    const abort = new AbortController();

    // Initial history load — ignored if this effect was torn down meanwhile.
    fetch(`${BASE}/app/executions`, {
      headers: { Authorization: `Bearer ${clientToken}` },
      signal: abort.signal,
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: TradeExecution[]) => { if (!disposed && Array.isArray(rows)) setExecutions(rows); })
      .catch(() => {});

    const scheduleReconnect = () => {
      if (disposed) return;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const delay = Math.min(1000 * 2 ** attempt, 15000);
      attempt += 1;
      reconnectTimer = setTimeout(connect, delay);
    };

    function connect() {
      if (disposed) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl(clientToken!));
      } catch {
        scheduleReconnect();
        return;
      }
      activeWs = ws;

      ws.onopen = () => { if (ws !== activeWs || disposed) return; attempt = 0; setConnected(true); };
      ws.onmessage = (ev) => {
        if (ws !== activeWs || disposed) return;
        try {
          const msg = JSON.parse(ev.data) as { type: string; execution?: TradeExecution };
          if (msg.type === "TRADE_EXECUTION" && msg.execution) upsert(msg.execution);
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => {
        if (ws !== activeWs || disposed) return; // stale/intentional close — do not reconnect
        setConnected(false);
        scheduleReconnect();
      };
      ws.onerror = () => { try { ws.close(); } catch { /* noop */ } };
    }

    connect();

    return () => {
      disposed = true;
      abort.abort();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (activeWs) {
        const ws = activeWs;
        activeWs = null; // ensures the onclose guard treats this as a stale close
        try { ws.close(); } catch { /* noop */ }
      }
    };
  }, [clientToken, upsert]);

  return { executions, connected };
}
