# Remaining broker authentication requirements — 2026-11-05

No broker passwords, actual account identifiers or account-specific server values belong in Git or chat. All four profiles pass synthetic protocol/worker tests; none has authenticated broker acceptance. Exact server strings are account-specific and cannot safely be inferred from a generic broker name.

## Inputs required for every account

The authorized owner/secure provisioning system must supply: broker/legal entity, MT5 account number, exact server string shown by the broker, confirmation of DEMO account type, account type/margin mode, account currency, and authorization for login/read-only diagnostics. Supply the MT5 account password through the existing private credential mechanism, preferably an investor/read-only password for initial acceptance where supported. Portal/email passwords are not substitutes for trading credentials. Do not request live-account credentials.

The engineer then provisions a unique Unix service identity, Wine prefix, portable data directory, private display, token, journal and unused loopback API port. Existing broker preparation terminals must not be silently rebound to client accounts. Initial acceptance verifies exact SDK account/server, demo mode, terminal/data paths, symbol catalogue, current contract/filling constraints, history reads and reconnects with automated trading disabled. Server discovery/network checks do not equal successful authentication. Source account IDs beyond the existing signed-32-bit PostgreSQL connection field need a reviewed schema change before backend registration.

## Deriv

Required: MT5 login ID and server from the selected Deriv MT5 account's dashboard, its Deriv MT5 password, the exact demo account type/product and broker entity. The official help page identifies the dashboard login/server and the MT5-specific password. This is separate from assuming the Deriv website login can authenticate MT5. The existing officially sourced Deriv terminal can be reused as a verified binary source into a NEW account instance; no reinstallation of the preparation terminal is needed.

Source: [Deriv MT5 login requirements](https://deriv.com/help-centre-question/how-to-log-in-to-deriv-mt5-account).

## Exness

Required: selected account's MT5 login number, exact server from its Personal Area account card, account trading password, Demo/MT5 designation and account type/entity. The Personal Area documents where the login/server are displayed; the platform troubleshooting page lists the trading password alongside account/server. Existing official Exness binaries are available, but no authorized account binding has been provisioned.

Sources: [Exness account-card login/server](https://get.exness.help/hc/en-us/articles/360012578619-Trading-account-login-and-server-details), [Exness platform login requirements](https://get.exness.help/hc/en-us/articles/360009350051-Trading-platform-login-issues).

## XM Global

Required: MT5 account ID, exact assigned demo server and trading password from the account registration/authorized Members Area, broker legal entity/region and MT5 platform designation. XM's official troubleshooting says those credentials must match the issued registration details. An authorized official Windows MT5 installer/source still needs acceptance for this VPS: use a link obtained through the appropriate official XM entity/account portal. Do not guess a direct installer URL or substitute an MT4 binary.

Source: [XM MT4/MT5 login requirements](https://www.xm.com/help-center/technical-issues-and-errors).

## RCG Markets

Required: broker-issued MT5 demo login, exact assigned MT5 server, trading password, legal entity/account type, and confirmation that this account is MT5. A verified MT5 Windows installer must come from the broker's official site/authorized CRM or broker-issued download channel. The public platforms page reviewed here did not expose a verified MT5 installer or an account-specific demo server; no third-party server label is accepted as proof.

The official platforms page links the new CRM at my.rcgmarkets.com and legacy client portal at portal.rcgmarkets.com, distinguishing registrations before 2025-09-23. The account owner must identify the correct portal/account context. No portal login, support message or registration was performed. The earlier timeout at the bare domain does not establish broker unavailability; the official www platforms page was readable.

Source: [RCG official platforms and CRM links](https://www.rcgmarkets.com/trading/platforms).

## Current blockers and next action

All four exact account/server/password bindings remain external requirements. XM and RCG additionally lack accepted MT5 installer artifacts on this VPS. Do not claim authentication or contact anyone using email/messaging tools without explicit authorization. Once secure bindings/official artifacts are available, the engineer will perform installation/provisioning and tests; the user is not asked to execute commands. Broker-order testing remains separately approval-gated even after read-only authentication succeeds.
