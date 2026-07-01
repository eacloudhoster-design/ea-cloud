---
name: Open the port before running startup work
description: Server readiness must not depend on migrations/seeds/backfills/reconciliation succeeding
---

**Rule:** An HTTP service must bind its port (`server.listen`) BEFORE running any
startup/maintenance work (migrations, seeds, backfills, reconciliation). Never put
`listen()` inside `Promise.all([...startupTasks]).then(...)`. Run startup tasks after
listening, best-effort, and never let one failure block the others or the server.

**Why:** Autoscale/Cloud-Run promotes a deploy only after a startup probe returns HTTP
200. If `listen()` is gated behind an un-`catch`ed `Promise.all`, one rejected task
means the port never opens, the probe fails (sidecar returns 500 — backend
unreachable), and publish fails at the *promote* step even though the *build* phase was
green. Build logs look fine; the signal is `detected=0 / required port was never opened`
plus repeated `healthcheck ... returned status 500`.

**How to apply:** listen first; run best-effort tasks via `Promise.allSettled` with
per-task error logging; wrap the whole routine in try/catch so the fire-and-forget call
can't raise an unhandled rejection. Preserve correctness-critical ordering explicitly:
the signal worker starts ONLY after `reconcileOnStartup` *succeeds* (so interrupted
signals are re-queued first) — on reconcile failure, skip the worker (safe degraded
state), don't start it. Diagnose such failures with real deploy logs
(`listDeploymentBuilds`/`getDeploymentBuild` + `fetchDeploymentLogs`), not local builds.
