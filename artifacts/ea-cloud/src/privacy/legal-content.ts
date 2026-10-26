export type Section = { title: string; text: string };
export const terms: Section[] = [
  {
    title: "1. Introduction",
    text: "EA Cloud is a South African technology platform for trading-related software, MT5 account connectivity, automated tools, mentor-based copy trading and account monitoring. These draft terms describe the platform; they do not establish regulatory authorisation or replace your agreement with a broker or mentor.",
  },
  {
    title: "2. Acceptance and changes",
    text: "Use the services only after reading the applicable terms and privacy information. Material contractual changes must be communicated appropriately before they apply. These documents remain drafts for administrator and legal review; publication does not certify legal approval. Contact us if you need clarification before connecting an account.",
  },
  {
    title: "3. Eligibility and age",
    text: "General browsing has no arbitrary minimum age imposed by this draft. Trading is different: before connecting an account or using trading functionality, eligibility, legal capacity, broker requirements and any necessary authority must be verified. South African majority is generally reached at 18 under section 17 of the Children’s Act; this does not by itself establish eligibility for every financial service. Minors must not assume they can trade or consent to every processing activity. Treatment of children’s information under POPIA, the verification process and any guardian involvement require legal and administrator review before enabling access.",
  },
  {
    title: "4. Account responsibilities",
    text: "Provide accurate registration and account details, keep login information private and do not share access without authority. Use a unique password and report suspected unauthorised use promptly to eacloudhoster@gmail.com. Do not send passwords or financial credentials in support messages. You are responsible for ensuring you have permission to connect and operate each trading account.",
  },
  {
    title: "5. Platform services and limitations",
    text: "The reviewed implementation includes MT5 connection forms, automated trading infrastructure, mentor/client access and copying controls, Regular, S2tone_ and Matrix interfaces, account monitoring, notifications and AI-assisted chart scanning. Availability depends on account permissions, broker connectivity and configured backend services. An implemented screen is not a promise that every deployment or plan enables that service. Planned features or prices must not be treated as available until confirmed at the point of use.",
  },
  {
    title: "6. Trading risk disclosure",
    text: "Trading involves substantial financial risk. You can lose some or all of your trading capital. Automated strategies can lose money, and historical results do not guarantee future performance. AI analysis can be incomplete or wrong and is not a guarantee or personalised suitability assessment. Broker outages, execution delays, slippage, connectivity problems and software errors can affect orders and results. You remain responsible for your decisions, permissions and risk limits. No profits or risk-free outcomes are promised.",
  },
  {
    title: "7. Mentors, brokers and other providers",
    text: "EA Cloud supplies technology. Independent mentors, strategy providers and brokers have their own responsibilities and terms. Their appearance on the platform is not proof that EA Cloud licenses, supervises or guarantees them. Check their identity, permissions, charges, credentials and applicable regulatory status independently. Describing the product as technology does not determine its legal classification. Copy-trading and related financial services can require authorisation under the Financial Advisory and Intermediary Services Act (FAIS), depending on the activity. The administrator must obtain advice on the applicable authorisations and verify them for EA Cloud and participating providers before enabling regulated services. No regulatory approval of EA Cloud is asserted in these drafts.",
  },
  {
    title:
      "8. Subscriptions, billing, refunds and cancellation — review required",
    text: "Billing rules are not finalised. The current subscription screen contains USD monthly, yearly and lifetime plan labels, while the business has separately proposed a future rand monthly price. An existing access-approval email also describes a once-off R600 manual EFT activation fee, which is different from the proposed monthly subscription. These conflicting representations do not establish a verified current recurring offer. No completed card-payment processor, automatic renewal, cancellation or refund workflow was verified in the reviewed registration code. Do not rely on a planned price or assume a charge, renewal or refund policy. Before taking payment, the administrator must reconcile pricing, currency, taxes, payment provider, renewal terms, cancellation method and refunds, and provide applicable ECTA and Consumer Protection Act disclosures and rights.",
  },
  {
    title: "9. Acceptable use",
    text: "Do not access accounts without permission, misuse credentials, disrupt infrastructure, evade access restrictions, distribute malicious software or use the platform unlawfully. Respect other users’ privacy and intellectual property. Submit only materials and trading instructions you are authorised to provide.",
  },
  {
    title: "10. Availability",
    text: "Maintenance, technical faults, network interruptions and broker or provider failures may interrupt services. Do not rely on continuous availability for managing risk. Monitor your broker account independently and use appropriate safeguards. No uninterrupted service or particular execution outcome is promised.",
  },
  {
    title: "11. Intellectual property",
    text: "EA Cloud branding, software and website materials are protected by applicable intellectual property law, subject to third-party rights and licences. Account access grants no ownership of those materials. Use them for the authorised service; do not reproduce or redistribute protected materials without permission or another lawful basis.",
  },
  {
    title: "12. Suspension and termination",
    text: "Access may need to be restricted where required by law, for material misuse, compromised account security or loss of the necessary account authority. Any suspension, notice, dispute handling, cancellation and data handling must respect applicable law and contractual rights. Detailed commercial termination procedures remain for administrator review; no unrestricted forfeiture of customer rights is created by this draft.",
  },
  {
    title: "13. Liability and governing law",
    text: "South African law is the proposed governing law, subject to legal review and any mandatory rights that apply to you. Nothing in these drafts excludes liability or consumer rights that cannot lawfully be excluded under the Consumer Protection Act, ECTA or other applicable law. No monetary liability cap, exclusive dispute forum or waiver of statutory remedies has been confirmed. Final contractual limits and dispute procedures require legal review.",
  },
  {
    title: "14. Business contact",
    text: "Business name: EA Cloud. Country: South Africa. General support and privacy enquiries: eacloudhoster@gmail.com. Business registration details are not yet confirmed.",
  },
];
export const privacy: Section[] = [
  {
    title: "Who is responsible",
    text: "EA Cloud operates from South Africa. For support or privacy enquiries, contact eacloudhoster@gmail.com. Business registration details and formal Information Officer designation are pending confirmation.",
  },
  {
    title: "Information in the reviewed implementation",
    text: "Registration and account flows process names, email addresses, account identifiers, password-derived values, roles and access/licence status. Connected services process MT5 login, server and broker details, connection credentials, trading preferences, positions and account values, activity and mentor/client associations. Support and privacy requests contain the information you send. Server request logs and browser/network requests can include technical identifiers, IP address, request path and device/browser information. Notifications use subscribed browser push endpoints and device keys. Chart analysis processes submitted chart material and analysis requests. Assistant features process supported questions and generated speech content when used. Subscription registration records the selected plan; the reviewed submission does not send the card number, expiry or CVV fields to a payment processor. Manual EFT instructions exist in access-approval emails; completed online card-payment processing is not verified and must not be inferred from those fields.",
  },
  {
    title: "Why information is processed",
    text: "Information supports account access, permissions, authorised account connections and trading operations, mentor/client management, account monitoring, requested notifications, chart analysis, support and security troubleshooting. Subscription selections support registration and access administration; the access-approval email also requests proof of manual EFT payment, which can contain transaction information. Optional public-site font requests occur only after Functional consent. The administrator must confirm the lawful justification and necessary scope for each processing activity under POPIA; consent is not assumed to justify every activity.",
  },
  {
    title: "MT5 credentials: receipt, storage, access and removal",
    text: "Credentials entered in connection forms are sent to the application backend and relevant connector to establish or operate the requested connection. The client-settings path stores a recoverable encrypted password using AES-256-GCM and a server-secret-derived key. Server-side code can decrypt it for authorised operations, so it is not inaccessible to the service operator. Disconnecting through that path clears the stored connection password and associated connection fields. Legacy mentor connector paths also exist: their transport, upstream responses, logging and provider retention need security review. Not every connector hop was verified as encrypted. Disconnecting is not a promise to erase historical trades, logs, backups or third-party records. Contact us for a deletion review; never include credentials in a privacy request.",
  },
  {
    title: "Providers and disclosures",
    text: "The reviewed deployment uses Cloudflare Pages/proxy code; image storage supports Cloudflare R2 or backend file storage. Backend records use PostgreSQL, but the database host and deployment region need confirmation. Gmail SMTP is configured in the email implementation. Chart-analysis and assistant code use Google Gemini for relevant analysis, question classification or generated speech when the corresponding provider-backed feature is used; other speech playback can run locally. Functional consent allows Google Fonts requests on the public site, exposing ordinary network metadata to Google. Broker/MT5 connectors receive details necessary for authorised connections and operations. Mentor/client features expose account information according to assigned roles; administrator permissions and access controls require ongoing review. Browser push delivery involves the browser’s push service. A complete production processor list, contracts and any other business disclosures must be confirmed. No public-site analytics or advertising integration was found in the reviewed code; no completed payment gateway was verified.",
  },
  {
    title: "Retention",
    text: "No approved blanket retention period was found for account, trade, support, server-log or backup records. Retention must be limited by service necessity, security, legal obligations and resolution of requests or disputes, with administrator-approved deletion schedules. Known technical periods include the 180-day public-site consent record and a 30-day push-session cookie. The application’s generated natural-audio clip cache has a 14-day clip TTL and bounded capacity; some browser preferences persist until cleared. These technical settings are not a company-wide retention policy. Provider retention and backup removal timing remain for review.",
  },
  {
    title: "Security and limits",
    text: "Verified measures include HTTPS requirements for the public API proxy, recoverable encryption in the client MT5 storage path, restricted push-session cookies, input validation and rate limiting on the privacy-request endpoint. Security is not guaranteed. Legacy authentication, account-password hashing, connector transport, response logging, access permissions and secret handling require administrator security review. This policy does not claim all credentials are never stored, that staff cannot access them, or that all traffic and records are encrypted. Avoid sending sensitive credentials in messages.",
  },
  {
    title: "Cross-border processing",
    text: "Cloud, email, AI, font and broker providers can process information outside South Africa. Actual locations, recipients, transfer safeguards and POPIA section 72 requirements must be verified against production contracts and configuration. Use of an international provider does not establish compliance with every international privacy law.",
  },
  {
    title: "Your rights and how to exercise them",
    text: "Subject to applicable law, you may ask for access to personal information, correction, deletion where permitted, information about disclosures, objection to relevant processing and direct marketing, or withdrawal of consent for processing based on consent. Withdrawal does not itself erase information previously collected or override necessary legal retention. Use Privacy Choices or email eacloudhoster@gmail.com. Identity and authority must be verified before account-specific disclosure or changes; submitting the public form does not retrieve data or delete an account. A request may be limited by lawful retention or other applicable requirements, which should be explained to you. The request workflow is administrator-reviewed, not automatic.",
  },
  {
    title: "Children and trading eligibility",
    text: "No arbitrary age limit is imposed for general website browsing by this draft. Processing children’s information and access to trading functionality require separate consideration of POPIA, legal capacity, applicable financial-services rules and broker conditions. A minor must not assume trading is permitted. The administrator must finalise eligibility and verification measures with legal advice before enabling such access.",
  },
  {
    title: "Complaints and changes",
    text: "First contact eacloudhoster@gmail.com. You can also contact South Africa’s Information Regulator using its official complaints channel at inforegulator.org.za/complaints/. Relevant policies may be updated after the outstanding operational and legal review; material changes should be communicated appropriately. These drafts are not a certification of POPIA or other regulatory compliance.",
  },
];
