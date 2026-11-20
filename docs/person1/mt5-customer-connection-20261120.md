# Customer MT5 connection correction — 20 November 2026

The MetaTrader page had acquired separate account-management/assignment forms and engineering descriptions. The original MetaTrader CSS, logos, mentor background, branding, navigation and reusable floating fields remain unchanged. The customer screen now uses its single existing broker/account-type/login/password/exact-server form. Connection failures use fixed customer wording; raw upstream messages, error codes and internal status names are not rendered. Shared administrator components and unrelated pages are unchanged.

Confirmed application corrections:

- Pending account requests are restored through the existing authenticated, owner-scoped request list after reopening/reloading. Checking a pending request never resubmits credentials. Accounts awaiting confirmation prefill the same account identity/type before the customer re-enters their password.
- A completed assignment request remains `connected: false` evidence. The screen requires a fresh account status response with matching login, server, broker and demo/real mode before displaying connected.
- The existing connect API now rejects unsupported account types before forwarding credentials, rejects a mismatch between selected type and verified terminal mode, and returns verified accountMode. The client checks it.
- The connect route now uses the existing `pauseCopying` binding option, including reconnects to the same account. Linking an account cannot resume a retained Start preference. Journals, emergency stops, authorization and worker execution permissions are not cleared or enabled.
- Disconnect continues through the existing authenticated endpoint; it pauses copying and retains encrypted credentials required for reconciliation.

Existing integration path is reused: cookie-authenticated `/api/app/mt5-connect` → private authenticated `/observer/account-status` → existing account-bound terminal. When there is no assignment, the approved existing request/consumer path calls the separate private `/v1/provision` contract, verifies the read-only terminal response, then binds the profile. No replacement gateway, engine, worker or infrastructure was introduced.

Runtime requirements remain deployment facts, not proof of readiness: existing MT5_VPS_URL/MT5_VPS_TOKEN, complete Cloudflare service authentication where required, MT5_PROVISIONER_URL/MT5_PROVISIONER_TOKEN, and the existing account-assignment consumer flags. Real-account connections additionally require the existing MT5_LIVE_READONLY_ACCOUNTS approval and a compatible account-bound terminal. No runtime values or flags were changed. The unchanged status verifier accepts only its existing broker profiles; the broker picker is not evidence every broker is supported.

Actual broker connection: **not verified**. This session has no authorized customer session/account credentials, private VPS access, or read access to the deployed service's secret configuration. Available Render metadata and bounded log searches did not establish private relay/provisioner readiness or a current failed hop. These are UNKNOWN; no claim is made that a specific runtime setting is missing. Existing gateway routing/authentication, provisioner availability, account assignment and a fresh terminal response must be verified using the established private access before claiming an actual demo/real account connection. Do not send broker passwords through chat or logs.

Validation:

- Existing engine-integration, mt5-engine-client and mt5-preview Node suites: 12 passed, 0 failed, 0 skipped. Covers owner authentication/isolation, verified mode mismatch, approved live read-only response, disabled live rejection without forwarding credentials, reconnect pause, safe error projection, broker assets and input validation. All terminal responses mocked; no real SDK/broker calls.
- Existing MT5 browser harness, `MT5_CUSTOMER_CHECK=1`: 3 scenarios at 390×844, 320×740 and 1280×900. Single form/customer copy, private error suppression, pending reload without resubmission, awaiting-confirmation identity restoration, no connection from request completion alone, fresh proof, disconnect and demo/real type handling. These are offline fixtures, not real terminal acceptance.
- API/app TypeScript, API production build, app Vite production build and whitespace checks passed. The app used `/ea-app/` with unchanged public assets linked locally to avoid duplication. Existing bundle-size warning remains. No broad engine suite was rerun.

Raw local logs/screenshots/source manifest: `/workspace/work/mt5-customer-20261120/`. Commit/PR prepared for owner review only. Skip markers suppress automatic preview builds; no merge, production deployment, credential rotation, database reset or trading activation is authorized by this checkpoint. Future rollout requires owner approval and API before frontend because accountMode is a verified response field.
