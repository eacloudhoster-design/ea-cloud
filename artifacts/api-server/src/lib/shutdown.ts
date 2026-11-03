/** Drain once on an external shutdown; never restart or replay work. */
export function createShutdown({
  server,
  sockets,
  pool,
  stop,
  log,
  exit,
  graceMs = 25_000,
}: {
  server: { close(callback: () => void): unknown; closeAllConnections(): void };
  sockets: { clients: Iterable<{ terminate(): void }>; close(): void };
  pool: { end(): Promise<void> };
  stop: () => void;
  log: any;
  exit: () => void;
  graceMs?: number;
}) {
  let closing = false;
  return (signal: string) => {
    if (closing) return;
    closing = true;
    log.info({ event: "backend_shutdown_started", signal }, "Draining backend");
    stop();
    for (const ws of sockets.clients) ws.terminate();
    sockets.close();
    const deadline = setTimeout(() => {
      log.warn(
        { event: "backend_shutdown_deadline" },
        "Shutdown grace elapsed; unfinished work requires existing reconciliation",
      );
      server.closeAllConnections();
      exit();
    }, graceMs);
    deadline.unref();
    server.close(() => {
      void pool
        .end()
        .then(() => {
          clearTimeout(deadline);
          log.info({ event: "backend_shutdown_complete" }, "Backend drained");
        })
        .catch(() => {
          log.error(
            { event: "backend_shutdown_pool_failed" },
            "Database drain failed",
          );
          // Leave the bounded external-shutdown deadline in force.
        });
    });
  };
}
