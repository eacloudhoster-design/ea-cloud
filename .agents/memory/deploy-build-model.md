---
name: Deployment build model & transient-failure signature
description: How publishing builds this monorepo, and how to recognize a transient infra failure vs a real build error
---

**Publish builds each deployable artifact individually via its `artifact.toml`
`[services.production].build` — it does NOT run the root `pnpm run build`.**
Confirmed from real build logs: a successful publish runs api-server (build.mjs),
ea-app (`vite build`), ea-cloud (`vite build`) and nothing else.

**Why it matters:** `pnpm run build` at the repo root fails locally because the
`mockup-sandbox` (kind=`design`, the Canvas) vite.config throws when PORT/BASE_PATH
are unset. That is a RED HERRING for deploy debugging — design/canvas artifacts have
no `[services.production]` block and are never built during publish. Do not "fix"
mockup-sandbox in response to a publish failure.

**Transient-infra failure signature (retry, do not change code):**
- Build log is very short (~14 lines), ends mid `pnpm install` (e.g. stops at
  "downloaded 5, added 2") and never reaches "Starting Build".
- Preceded by `Security scan skipped: connection lost`.
- A build with the SAME commit succeeded shortly before.
Diagnosis: network/infra hiccup during the publish, not a code/config error. Fix =
re-run Publish. (Per deployment skill: don't diagnose Replit-side infra problems.)

**How to debug a publish failure properly:** use `listDeploymentBuilds` +
`getDeploymentBuild(id)` to read the ACTUAL build logs. Trust those over a local
`pnpm run build` reproduction, which exercises a different (root-recursive) path.
