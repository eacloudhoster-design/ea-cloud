# Private bootstrap authorization preparation

Base: `3a90c0ca23a1420288b043d537eced109df01472`, verified clean on the expected
branch. Development branch:
`feature/person2-private-bootstrap-authorization-20261110`.

## Scope and existing boundaries

The existing private session preparation has immutable metadata and no working
SDK lifecycle. Existing execution workers retain their simulation-only bindings,
NoVendor guards, authenticated request/readiness protocol, controller leases,
fencing and durable execution journals. Enrollment/export is an application-owned
private credential handoff, not authority to connect a terminal. No existing
Person 1 contract identifies an approved real-session issuer or secret provider.

The independently safe addition is an **offline preparation-only** authorization
contract and local reference consumer. It creates no issuer service, secret store,
SDK loader, new worker or execution engine. It is not imported by any execution
entry point or exposed as an HTTP/IPC route. A valid grant permits metadata
preparation only; it is explicitly NOT real-session or trading authorization.

## Exact changes

`vps-mt5-service/mt5_bootstrap_preparation.py` adds:

- An immutable private assignment: an opaque assigned gateway ID and the existing
  account-bound configuration. Its digest binds tenant/account/broker/login/server,
  terminal/journal paths and opaque credential selector. The reference ledger also
  pins the expected verifier-key fingerprint; changing assignment, configuration
  or verifier key cannot silently adopt that ledger.
- A strict grant containing protocol, purpose `prepare-readonly-metadata`, random
  authorization ID, configuration digest, assigned gateway ID, fresh startup
  challenge and issued/expiry times. Lifetime is bounded to 60 seconds, with no
  future-issued or expired grant accepted. Extra terminal/credential/SDK-access
  fields and connect/trade purposes are rejected.
- Existing `private_ipc.sign/verify` framing is reused with a distinct protocol
  body and a separately supplied private verifier key. No signing/approval issuer
  is implemented; test grants are signed only by fixtures. Production key custody,
  algorithm approval and trust establishment remain Person 1 decisions. The key
  must not be the worker IPC/service key; this separation is an operator trust
  requirement, not something inferred from a caller's identifier.
- Each consumer generates its own fresh startup challenge. A grant from an old
  consumer cannot authorize a new one. Consumed authorization-ID hashes remain
  rejected across restarts, even if the issuer signs that same ID for a new
  challenge. Acceptance commits the consumption before returning a session.
- A mandatory, private `CredentialBoundaryRequirement` ties the expected opaque
  selector to the configuration digest. Password/value fields are forbidden. It
  expresses a trusted delivery **requirement**, not proof that a secret exists or
  was delivered. No credential is read, transmitted or returned by this module.
- A private Linux reference replay ledger, using existing `StateLease` ownership
  and SQLite FULL-synchronous transactions. Provisioning requires a new private
  directory and never adopts/rebuilds existing state. A separate installation
  witness, read/write-only existing database open, identity/schema checks and
  clock highwater reject missing/corrupt/changed storage and observed rollback.
  Storage/grant capacity is bounded; there is no automatic pruning/reset.
- Safety checks default blocked and must return exact `False` to permit metadata
  preparation. Missing/unknown/exceptional state fails closed. Checks run before
  and during consumption and after commit. A stop after commit burns the grant
  without returning a session; recovery needs new approval, never replay.
- Successful consumption returns the existing `PrivateSessionPreparation` and a
  redacted receipt. The receipt says `sdk_access_authorized:false`,
  `credential_delivery_verified:false`, `financial_execution:false`. Existing
  `connect`, reads and sends remain unconditionally unavailable.

No production configuration, assignment map, worker startup, execution protocol,
SDK adapter, controller fence, stop publisher, execution journal or dependency
was changed. The reference ledger is separate preparation state, not another
account execution authority or global lock. It must not be mistaken for proof
that an independently configured host is excluded.

## Trusted versus untrusted inputs

Private trusted bootstrap management must supply the expected assignment, verifier
key, credential-reference requirement, clock and account-scoped safety callback.
Only the signed grant frame is an untrusted input to `consume`. Execution requests
cannot set any of those private dependencies, change the configured terminal or
select credentials. Python callers with control over the trusted process/key are
outside this boundary; this is not a sandbox against malicious same-process code.

The key is kept in process memory, not persisted in the ledger. Stored records
contain binding/authorization/frame hashes and observation times, not plaintext
credentials, grants, MACs or account configuration. Rejections expose static
codes rather than input values or underlying validation/storage exception text.
No authorization input or secret is logged by the module. The private returned
session still contains its private configuration; only its redacted receipt is
suitable for application logs, not the configuration/grant/key objects.

## Validation

Final result: **184 Python tests passed, 0 failed, 0 skipped**, including 16 new
cases. The focused 16-case run also passed and is included in that total. Python
source compilation and whitespace checks passed.

See `evidence/private-bootstrap-authorization-20261110/` for final logs/counts and
source hashes. Sixteen new focused cases cover valid bootstrap, missing/unsigned/
wrong-key grants, expiry, future issuance, excessive lifetime, account/gateway/
challenge conflicts, replay, consumer restart, key/assignment changes, competing
local consumers, deleted/corrupt ledger state, missing credential requirements,
secret-free errors/receipts/storage, stop-state preservation, post-commit stop,
clock rollback, provisioning refusal and continued exclusion from execution IPC.

Consumer close/reopen tests validate reference bootstrap recovery. Existing
private IPC, shared leases, cached evidence, independent worker processes and
history recovery regressions cover the unchanged worker controls separately.
This does not claim the new contract is wired into an execution worker or tested
on native Windows. No SDK, broker, browser, production service or secret provider
was used. No unrelated Node/UI/Wine tests were rerun; their runtime sources and
source-closure membership are unchanged by these two new standalone files.

## Remaining decisions and infrastructure

1. **Person 1 issuer/trust policy:** who approves a specific real account/session;
   trusted issuer identity, verification algorithm/key provisioning, separation
   from IPC credentials, rotation/revocation, approval audit and permitted scopes.
   The HMAC format here is a reference preparation contract, not a selected
   production approval service or permission to connect a broker.
2. **Assignment authority:** establish how the opaque gateway ID maps to the
   approved application assignment, private origin and one durable execution
   domain. A caller-supplied ID or local ledger is not remote gateway attestation.
   Copies/restored snapshots/independent roots cannot establish global replay or
   controller exclusion; deployment and approved handover must prevent them.
3. **Credential delivery:** implement an approved private provider/OS channel,
   configuration/credential-reference binding, ACL checks, rotation, memory/log
   handling and terminal binding. The reference requirement verifies no actual
   secret delivery. No secret-management infrastructure was invented here.
4. **Runtime/bootstrap wiring:** approve the real-demo bootstrap/result protocol,
   trusted account-specific stop/hold callback and Windows x64 runtime/terminal/
   Python/official SDK/NumPy profile. This consumer's reference ledger deliberately
   refuses non-Linux hosts; native Windows storage/ACL/locking acceptance remains
   unimplemented/unverified. No actual terminal or SDK is available through it.
5. **Time and recovery:** approve the trusted clock, grant lifetime, restart
   challenge handoff, ledger durability/backup rules and failure review policy.
   Local highwater checks are not a globally trusted clock or protection against
   privileged restoration of matching ledger/witness snapshots. Interrupted or
   lost acceptance requires a fresh grant; no grant/hold reset is automatic.
6. Real SDK loading, initialization (which can authenticate using saved settings),
   read-only collection and all financial operations stay blocked until separately
   implemented and authorized. A preparation grant can never be reused as that
   authority. Controller leases/fencing and final emergency-stop checks remain
   independently mandatory; this grant does not mint an execution lease.

Ready for GitHub review as a bounded preparation contract after local validation,
not production bootstrap or real MT5 acceptance. No push, merge, deployment,
production configuration changes, real SDK calls, broker connections, orders,
trading activation or removal of emergency-stop protections occurred.
