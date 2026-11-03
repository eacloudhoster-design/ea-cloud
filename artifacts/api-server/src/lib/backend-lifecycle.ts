import { monitorEventLoopDelay } from "node:perf_hooks";

// Observability only: never restart the process or retry a trading mutation.
export function startBackendDiagnostics(
  pool: { totalCount: number; idleCount: number; waitingCount: number },
  log: any,
  workerHealthy: () => boolean,
) {
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  const timer = setInterval(() => {
    const memory = process.memoryUsage();
    log.info(
      {
        event: "backend_lifecycle_sample",
        uptimeSeconds: Math.floor(process.uptime()),
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        externalBytes: memory.external,
        arrayBufferBytes: memory.arrayBuffers,
        eventLoopMaxMs: Math.round(delay.max / 1e6),
        pool: {
          total: pool.totalCount,
          idle: pool.idleCount,
          waiting: pool.waitingCount,
        },
        signalWorkerHealthy: workerHealthy(),
      },
      "Backend resource sample",
    );
    delay.reset();
  }, 60_000);
  timer.unref();
  return () => {
    clearInterval(timer);
    delay.disable();
  };
}
