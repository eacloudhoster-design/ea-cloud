# Isolated Wine simulation acceptance

Development tests only. This does not install or import MetaTrader5, launch a
terminal, connect to a broker, submit real orders, change production prefixes, or
clear safety holds. The existing worker and its six native acceptance scenarios
are used unchanged.

## Prerequisites

- Linux x86_64, Python 3.12, and the Docker CLI with access to the **local**
  `/var/run/docker.sock`. Run this harness as an ordinary non-root user. No daemon
  reconfiguration, root helper, system package installation or privileged
  container is needed. A Windows machine is not required for these Wine tests.
- Allow roughly 7 GiB memory for the container and at least 1 GiB free disk for
  artifacts and Docker's per-container writable copy **after** the base image is
  available. Docker VFS can need substantially more disk than overlay storage;
  avoid concurrent database/browser/container suites on small runners. Runtime
  extraction uses a 1.25 GiB tmpfs; prefix copies use a separate 4 GiB tmpfs.
- HTTPS access during acquisition to `deb.debian.org`, `www.python.org`,
  `pypi.org`/`files.pythonhosted.org` as applicable. The recorded wheel URLs go
  directly to `files.pythonhosted.org`; no dependency resolver runs. Docker's
  registry access is needed only for the pinned base image. Preserve your
  environment's normal verified TLS/proxy settings; do not disable TLS checking.

## Repeatable commands

Run from repository root. Use canonical absolute cache/evidence paths outside the
checkout; each evidence directory must be new. No credentials or `.env` files
are required or passed to the test container.

```sh
# Acquisition only; no Wine or repository application runs in this phase.
python3 tools/wine-simulation/run.py fetch --cache /absolute/dev/wine-artifacts

# Clear endpoint selectors so an inherited context cannot select a remote daemon.
env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS \
  -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
  docker --host=unix:///var/run/docker.sock pull --platform linux/amd64 \
  python:3.12-slim@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b

# Runtime phase: no network, fresh tmpfs extraction and fresh prefixes every time.
python3 tools/wine-simulation/run.py run \
  --cache /absolute/dev/wine-artifacts --evidence /absolute/dev/wine-run-001

# Independent, fast safety-boundary checks; offline, no Docker needed.
python3 tools/wine-simulation/test_harness.py
```

To prove acquisition from scratch, use an empty cache directory. To repeat runtime
validation, reuse the hash-verified archives with a new evidence directory. The
runner never reuses an installed Wine tree or initialized prefix. It refuses a
missing/corrupt/redirected artifact, root user, or an existing evidence destination.
A failed download or acceptance job is an error, never a silently skipped suite.

## Pinned runtime and relocation

`runtime.lock.json` pins the base image digest and 182 archive SHA-256 values,
including Debian Wine `10.0~repack-6` and its known-good dependency closure,
embedded Windows Python `3.12.10` AMD64, FastAPI `0.141.1`, Pydantic `2.13.4`,
Pydantic Core `2.46.4` (separate Windows/Linux wheels), and patchelf `0.19.3.0`.
`requirements.txt` for the production service is deliberately not installed: it
includes a vendor SDK. All artifact versions/URLs are explicit in the lock;
there is no `apt install`, `pip install`, latest tag resolution or floating
package selection during runtime creation. Debian archives are unpacked without
running package maintainer scripts. Pure Python wheels are shared across the two
interpreters, with platform-specific compiled wheels kept separate.

The successful diagnosis found an incomplete relocated package layout, including
`user32.dll` failing to locate `zlib1.dll`. `kernel32.dll` itself existed and loaded.
The fixture applies these corrections only under its private `/wine/install`:

1. Replace Debian's absolute-path wineserver shell dispatcher with a relative
   symlink to the extracted `wineserver64` ELF.
2. Add the data alias required by Wine's relocated `share/wine/wine/nls` lookup.
3. Expose the packaged x64 `zlib1.dll` in Wine's private Windows DLL directory.
4. Set an RPATH on the extracted ELF binaries/libraries, allowing the unchanged
   bridge's restricted environment to work without `LD_LIBRARY_PATH`,
   `WINEDLLPATH`, or a launcher shell wrapper.

No correction touches `/usr`, a host Wine installation, `$HOME/.wine`,
`/etc/ea-cloud`, the production emergency-stop mirror, or a production prefix.

## Isolation and test gates

The container is non-root, has a read-only root filesystem, no capabilities,
`no-new-privileges`, bounded memory/process count, no network, no Docker socket,
no host home/configuration/credential mounts, and no published ports. Only locked
archives and a source allowlist are mounted read-only; the evidence directory is
writable. The source snapshot contains the bridge, its existing simulation
closure and the unchanged native acceptance script. It excludes the repository's
Git metadata, `.env` files, account gateway, terminal, and vendor requirements.

The fixture clears inherited environment variables, checks that only loopback
exists, and refuses mounted EA Cloud host configuration/mirror paths. Docker
network isolation prevents external IP connectivity for native Wine processes as
well as Python. A shared `sitecustomize` additionally blocks vendor imports and
Python IPv4/IPv6 connections and UDP sends. The existing stdio worker's own guard
remains active. This is a trusted-code test fixture, not a sandbox for hostile
native binaries; do not add a real terminal/SDK or credentials.

Before the suite, the harness checks the exact Wine version, Windows Python
version/platform, SQLite/`msvcrt`/FastAPI/Pydantic imports, vendor-import rejection,
IPv4/IPv6 connection rejection, and a minimal Windows executable. The temporary
startup prefix is quiesced with scoped wineserver `-k` and `-w`, then removed.

The original six scenarios then create their own marked disposable prefixes and
exercise signed startup/default emergency stop, durable mock idempotency, Linux
and Windows ownership locks, scoped shutdown, crash/restart holds and timeout
quiescence. Recovery never clears existing holds. Only explicit expiring test
stop metadata can clear a **synthetic fixture's** stop; no host latch is changed.
The runner requires exactly six passing cases with zero errors/skips. Stage and
whole-job timeouts cause failure, with cleanup by the exact generated container
name; no global Wine process termination or container sweep occurs.

## Evidence and troubleshooting

Each run records `input-sha256.json`, `isolation.json`, startup logs,
`native-acceptance.log`, `native-counts.json`, `results.json`, `container.log` and
`evidence-sha256.json`. Keys/frames/passwords are not logged. The input manifest
covers the actual source snapshot and harness, not merely a claimed commit SHA.
See [the validation report](../../docs/mt5-integration/reproducible-wine-tests.md).

An error is not an execution grant. Do not increase worker protocol timeouts,
relax ownership validation or clear stops to make a test pass. Preserve failure
logs. `ENOSPC` while copying prefixes means the development runner needs more
storage or fewer concurrent jobs; it is not an application assertion failure.
Headless font/display and missing 32-bit helper warnings remain in logs and do
not establish graphical or 32-bit compatibility.

Public Debian mirrors may eventually remove a pinned version. Keep a copy of the
verified artifact cache in an approved development artifact store; no runtime
upgrade or hash substitution happens automatically. Docker image pull and
artifact acquisition are intentionally separate from networkless runtime tests.
Actual Microsoft Windows ACL/DACL behavior, graphical MT5, the vendor SDK and
broker execution remain outside this environment's acceptance scope.
