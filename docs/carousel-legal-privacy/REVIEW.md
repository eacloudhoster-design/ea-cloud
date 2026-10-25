# Legal and privacy review — EA Cloud

Drafts updated 25 October 2026. Not a legal approval or compliance certification. No production deployment is authorised by this change.

## Confirmed business information

EA Cloud, South Africa. Business contact address: 123 Albatross, Thornton, Cape Town, 7460, South Africa. Support/privacy email: eacloudhoster@gmail.com. No separate Information Officer personal/residential address is published. Formal Information Officer designation and business registration details are unconfirmed.

## Administrator/legal checklist before release

- [ ] Confirm contracting legal entity and registration details; designate/register the Information Officer as applicable and confirm responsibilities. Do not publish personal address details.
- [ ] Resolve pricing conflict: subscription UI lists USD $29/month, $249/year and $599/lifetime; access-approval emails describe once-off R600 manual EFT activation. Owner proposes R600/month. Do not present the proposal as an implemented recurring plan. Confirm taxes/currency, checkout disclosures, payment evidence handling, cancellation, refunds, renewal and consumer rights before charging.
- [ ] Determine the FAIS/FSCA authorisation requirements for the actual automated/copy-trading activities and verify applicable permissions; a technology-provider description does not establish exemption.
- [ ] Finalise trading-account eligibility and verification with South African financial-services advice and broker requirements. General browsing is distinct from trading. Majority at 18 does not itself authorise trading; POPIA treatment of children's information also needs review. Do not claim minors may trade.
- [ ] Approve account, trading, request-email, support, technical-log and backup retention/deletion schedules, including processors. Technical TTLs are not business retention rules.
- [ ] Verify production providers, regions, data recipients, mentor permissions, processor agreements and POPIA section 72 transfer safeguards. Database code proves PostgreSQL, not a particular host/region. Cloudflare R2 is supported but its actual deployment must be confirmed.
- [ ] Review legacy account-password hashing and token authentication, MT5 connector transport, recoverable credential access, upstream response storage/log redaction and production secret management. The drafts deliberately make no blanket encryption/security claim. These systems were audited for wording, not changed by this PR.
- [ ] Confirm all business sale/sharing and direct-marketing practices; absence of public advertising code does not establish every offline/business disclosure. No advertising or analytics integration is enabled here.
- [ ] Approve final Terms, liability/disputes/suspension language and applicable ECTA/CPA disclosures without excluding mandatory rights.
- [ ] Before release, verify the deployed backend's EMAIL_ADDRESS / EMAIL_PASSWORD configuration privately and an authorised real delivery to eacloudhoster@gmail.com. Local tests use a test transport, not live SMTP. SMTP acceptance is not proof of inbox reading or identity verification.
- [ ] Configure PUBLIC_WEBSITE_ORIGIN on the backend and exact preview origins in PRIVACY_ALLOWED_ORIGINS if testing on a preview domain. The Pages proxy still requires the existing HTTPS BACKEND_ORIGIN. Do not use wildcard request origins.
- [ ] Assign request triage/identity-verification procedures and legal response deadlines. The public endpoint never retrieves records or automatically deletes accounts. Email delivery failure is visible and the direct email link remains available.

## Evidence behind the drafts

- `artifacts/api-server/src/routes/auth.ts`, authentication middleware and password helper: existing login/credential architecture, unchanged.
- `artifacts/api-server/src/lib/mt5-crypto.ts`, `routes/client-settings.ts` and `routes/mt5-connect.ts`: recoverable AES-256-GCM client-settings storage, disconnect clearing, legacy connector paths requiring review. No live credentials were read or exposed.
- `artifacts/api-server/src/lib/email.ts`: Gmail SMTP; existing manual activation email; new privacy mail sent only to the confirmed administrator inbox with requester reply-to and receipt UUID.
- `artifacts/ea-cloud/src/pages/app/Subscribe.tsx`: USD plan labels and registration submission; no completed online card processor verified.
- Scanner Gemini code, image-storage code, PostgreSQL schema and Pages API proxy: providers described with deployment caveats.
- `artifacts/ea-app/src/lib/{shape-preference,natural-audio-store,push-device-state}.ts`, app hooks and push-session code: browser storage inventory. Unused UI sidebar's `sidebar_state` definition is not represented as an active deployed cookie.
- Original public `index.html` loaded Google Fonts unconditionally. It is now consent-gated. The separate trading application and its storage/features are unchanged.

## Legal sources reviewed

- POPIA: https://www.justice.gov.za/legislation/acts/2013-004.pdf (including children's information and cross-border transfer considerations).
- ECTA: https://www.gov.za/sites/default/files/gcis_document/201409/a25-02.pdf
- CPA: https://www.gov.za/documents/consumer-protection-act
- Children's Act, section 17: https://www.justice.gov.za/legislation/acts/2005-038%20childrensact.pdf
- FAIS: https://www.gov.za/documents/financial-advisory-and-intermediary-services-act
- FSCA discussion of copy-trading authorisation: https://www2.fsca.co.za/Documents/FSCA%20Regulatory%20Actions%20Report%20-%2028%20June.pdf
- Regulator complaints: https://inforegulator.org.za/complaints/

These sources inform drafts; they do not verify regulatory approval, a financial-service licence, or legal suitability of any particular trading account.
