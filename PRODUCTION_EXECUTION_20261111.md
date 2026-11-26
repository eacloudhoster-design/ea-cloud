# Owner-authorized production execution

Current owner authorization covers source publication, existing Render/Cloudflare deployment, EA service configuration/restarts and reviewed migrations after verified backups. Prior missing conversational approval notes are superseded. Real-money orders, unverified live execution and emergency-stop removal remain prohibited.

The tested local checkpoint `3b1b90b8f511123845d69d90acf1b6cce1846709` was published through the connected GitHub integration at `4775aca6379fcf7660f15979f5076e152506f74b` on `release/ea-cloud-integration-20261111`. Exact source-tree identity was verified as `24723396d8870176806ef38353a2a0fd75bbd1d5`. The integration created a publication commit because this shell has no Git push credential; original local commits and package archives remain preserved.

A fresh consistent backup of the existing production database was restored into a separate private Unix-socket-only PostgreSQL instance. All 32 tables/577 records matched; 24 encrypted API keys were verified with the original session key. The isolated restore server was stopped. Both reviewed 20261111 migrations were then applied atomically, with the pre-existing table records fingerprinted before and after: zero mismatches. No prior migration was repeated. Receipts and exact migration hashes are in `production-evidence/`. Those applied SQL files are immutable; future schema changes require a new migration and verified backup.

Default backend startup is now migration-free management mode, including direct entry invocation when no explicit mode is set. This preserves original database/session bindings, prevents accidental signal execution during provider rollout and leaves provisioning separately gated. A private optional origin token is an additional Pages-to-management boundary, never a substitute for browser session authentication. The private VPS service uses systemd credentials and a pinned source release, binds loopback, limits memory/CPU and keeps trading disabled.

Render is discoverable but not connected. No Cloudflare management credential was found. The owner was asked only to make those secure provider connections available. Existing GitHub-linked Pages deployment is verified from its successful commit check; its pipeline can be used for the authorized source rollout once the final startup/source checks pass. Provider configuration, private transport, actual user-session acceptance and real broker verification must be recorded separately from source publication.

Production remains NO-GO for customer trading. No real-money order or emergency-stop removal is authorized. Live-account grants, simultaneous multi-account execution, new clean-image worker provisioning and actual copier acceptance still require completion/verification; flags or simulated receipts must not be described as acceptance.


## Verified public rollout and broker authentication

PR136 merged at `6119f8f210352d735734ae5e9905e011bc130503`. Existing Cloudflare Pages deployment `d583f21d-58c8-40f0-ac61-d9c05d02039d` succeeded. Public website `/`, app `/ea-app/`, `/api/healthz` and database `/api/readyz` returned200; anonymous `/api/app/me` returned401 JSON. The Pages build-info reports the merge commit. Anonymous desktop/mobile Chromium acceptance passed with no page errors. Exact Render source SHA still requires the new release diagnostic endpoint on the next rollout; HTTP readiness alone is not that proof.

All six existing broker identities freshly passed actual credential-bound read-only SDK proof. The public receipt redacts account login/server. This verifies those existing demo connections, not new customer provisioning, live-account authentication, copier orders or latency. No account data, real orders or emergency stops changed for these checks.

The private loopback management service runs a pinned `0c71aafc033d` build with original database/encryption bindings and separate origin authorization. Clean isolated worker startup exposed and corrected a missing Wine bootstrap sequence. A new fresh prefix then passed real dependency imports (Python3.13.17/MT5 SDK5.0.6231); failed prefixes and diagnostics were retained. The new source adds asynchronous provisioning, bounded supervised startup, broker admission and dynamic tenant projection, with actual clean worker provisioning still pending. No claim of full customer readiness is made.


## Real isolated worker acceptance and follow-up

PR137 deployed merge `76c18478943fa40d903806f2906447c61d980f6e`; actual public Pages build-info and backend `/api/release` both report that SHA. Backend reports management mode/executionDisabled=true. Private provisioner installed loopback10040, customer submission disabled, max one new worker. Actual request `7b690ad8-b3f0-4670-a633-6f9b20937162` passed fresh isolated bootstrap and started terminal/API but failed broker identity verification. It was stopped/retained; original controller/registry restored. Retained-worker diagnostics confirmed real SDK `-10005` IPC timeout, three15-second attempts, zero orders. No successful new-account provisioning claim is warranted.

Working broker terminals bootstrap `[Common]` login/server/password before SDK initialization. New source now uses that same sequence: root-encrypted startup credential, decrypted copy only in systemd's private0700 `/run` runtime directory, KeepPrivate=0, Experts/LiveTrading/DLL imports disabled. No broker password is written to account home or argv/environment. Control characters in credentials are rejected before INI construction. This correction awaits actual broker verification. Failed requests/slots are never automatically retried.


## Corrected official image and actual fresh provisioning PASS

Core-only binaries were insufficient; a credential-free installation of the previously SHA-pinned official JustMarkets installer supplied the broker binary/catalog/settings/license. No account database or Wine prefix was copied. Corrected retained-worker proof verified broker identity, portable paths, connection, market data and position/order reads with AutoTrading/execution false. Cold quote warmup first returned503 and then200, correctly avoiding false readiness.

Fresh request `f2aeefc9-7728-42e7-8114-b3b5a5b4a978` then passed HTTP202 acceptance → fresh isolated ss-jm002 Wine prefix → terminal/API startup → real exact demo identity → independently restarted read-only API recovery. The original owner demo controller was paused to ensure single-controller isolation, then restored after new-worker stop/retention. No customer database binding or order changed. This is operator-only actual provisioning, not customer queue/browser acceptance. Actual backend readBoundAccount source→private relay→broker SDK verification also passed; public Render-to-VPS transport is separately unverified.

The continuation supplies a separately authenticated status-only private root port and fixed hash-pinned read-only helper. Existing HTTP relay stays nonroot and cannot decrypt credentials or use its status token to provision. Shared SDK proof projection is reused. Explicit root --verify-retained can reverify a previously accepted stopped descriptor after operator restoration; it never starts, rebuilds, reallocates or retries a provisioning request. Wrong identity stops/holds; source tests cover those gates. Deployment and real proxy acceptance remain separately recorded below when completed.
