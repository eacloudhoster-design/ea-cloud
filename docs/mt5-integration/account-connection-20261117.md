# Account-connection integration correction

Base: origin/integration/person2-final-20261117, 498545f. Original engine/safety checkpoints preserved.

The existing licensed-session form, encrypted binding, authenticated gateway, Wine read-only SDK worker, status refresh and application disconnect are already wired. A real successful proof is required before storing a connected account. This patch does not replace that pipeline.

Confirmed defect: the existing AccountBindingError/accountBindingFailure helper was unused. The connection API collapsed failures to422 and the mobile dialog discarded them. The patch connects that helper to fixed gateway codes, HTTP responses and safe client messages. The read-only relay now distinguishes missing assignment, rejected details and unavailable sessions. Vendor text/passwords are excluded. Transport failures never become successful connections. Account identity/tenant validation and execution controls are unchanged.

New account onboarding still requires the existing gated encrypted provisioning queue, private provisioner, clean worker slot, registry assignment and credential delivery. The Connect form verifies an assigned account; it cannot safely switch arbitrary users onto an existing shared terminal. No gates are enabled or deployment assignments invented here. Incorrect broker password versus incorrect broker server cannot always be distinguished by the existing worker; errors retain that uncertainty.

Validation: 3 Node tests passed (existing authenticated session/account binding plus safe-error/client checks), 5 Python relay tests passed; UI TypeScript, Python source compilation and whitespace checks passed. Full API typecheck has an unchanged baseline error at copy-engine.ts290: nullable signal.rawPayload passed to JSON.parse. No unrelated execution changes or137-test rerun.

No actual account connection was confirmed. The existing VPS/private provisioner, account-specific grant/credential reference and deployed registry were not accessible for verification. No SDK import/call, broker connection, order, provisioning activation, production configuration, deployment, push or merge occurred. Offline fixtures are not live acceptance.

The next required runtime step is approved publication and read-only verification of one owned, assigned demo account through the real private gateway. This patch is not evidence of completed live onboarding or current public API availability.
