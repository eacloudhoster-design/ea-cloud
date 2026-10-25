import "../styles/PublicTypography.css";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { legalLinks } from "../privacy/legal-links";
import { terms, privacy } from "../privacy/legal-content";
import { usePrivacy } from "../privacy/PrivacyProvider";
import "./Legal.css";
const email = "eacloudhoster@gmail.com";
const descriptions: Record<string, string> = {
  "/legal/terms":
    "Platform responsibilities, trading risks and contractual matters awaiting review.",
  "/legal/privacy":
    "How information is handled, provider disclosures and your privacy rights.",
  "/legal/cookies":
    "A code-based inventory of cookies, browser storage and optional resources.",
  "/legal/cookie-settings":
    "Choose which optional resources this browser may load.",
  "/legal/privacy-choices":
    "Withdraw optional consent or send an administrator-reviewed privacy request.",
};
const titles: Record<string, string> = {
  terms: "EA CLOUD – TERMS OF SERVICE",
  privacy: "EA CLOUD – PRIVACY POLICY",
  cookies: "EA CLOUD – COOKIE POLICY",
  "cookie-settings": "EA CLOUD – COOKIE PREFERENCES",
  "privacy-choices": "YOUR PRIVACY CHOICES",
};
const storage = [
  [
    "ea-cloud:privacy-consent:v1",
    "EA Cloud",
    "Remember public-site privacy choices",
    "Necessary",
    "180 days",
    "First-party localStorage",
  ],
  [
    "token / app_token / appClientToken",
    "EA Cloud",
    "Account access for respective portals/application",
    "Necessary when signing in",
    "Until sign-out or browser clearing; no browser TTL",
    "First-party localStorage",
  ],
  [
    "ea_push_session",
    "EA Cloud",
    "Authenticate registered app push-session operations",
    "Necessary when used",
    "30 days",
    "First-party HttpOnly, Secure, SameSite=Strict cookie; /api/app/push",
  ],
  [
    "ea-cloud:client:{id}:home-appearance / :bot-font",
    "EA Cloud",
    "User-requested app appearance and fonts",
    "Functional app preference",
    "Until cleared",
    "First-party localStorage",
  ],
  [
    "ea-cloud:client:{id}:robot-shape and :bot:{bot}:interface:{interface}",
    "EA Cloud",
    "User-requested app shape per bot/interface",
    "Functional app preference",
    "Until cleared",
    "First-party localStorage",
  ],
  [
    "ea-cloud:client:{id}:visual-ea / :ea:{id}:visual-mode",
    "EA Cloud",
    "User-requested app visual mode",
    "Functional app preference",
    "Until cleared",
    "First-party localStorage",
  ],
  [
    "ea-cloud:floating-robot-position / ea-cloud:robot-panel-window",
    "EA Cloud",
    "Remember app assistant geometry",
    "Functional app preference",
    "Until cleared",
    "First-party localStorage",
  ],
  [
    "ea-cloud-push-device",
    "EA Cloud / browser push provider",
    "Device registration and push key state after opt-in",
    "Necessary for requested notifications",
    "Until removed/cleared; provider retention needs review",
    "First-party IndexedDB; delivery uses browser push service",
  ],
  [
    "ea-cloud-natural-audio",
    "EA Cloud",
    "Cache generated app voice clips and voice metadata",
    "Functional app cache",
    "Clips: 14-day TTL; bounded 32MB/96 clips; metadata until cleared",
    "First-party IndexedDB",
  ],
  [
    "Google Fonts stylesheet/font resources (not an EA Cloud cookie name)",
    "Google",
    "Optional public-site Inter font; sends network metadata",
    "Functional, consent-controlled",
    "Browser/provider HTTP cache rules; provider retention needs review",
    "Third-party requests",
  ],
];
function Preferences() {
  const { consent, save, error } = usePrivacy();
  const [functional, setFunctional] = useState(consent?.functional ?? false),
    [notice, setNotice] = useState("");
  useEffect(() => setFunctional(consent?.functional ?? false), [consent]);
  const persist = (value: boolean) => {
    if (save(value)) {
      setFunctional(value);
      setNotice(
        "Preferences saved. Future optional font loading follows this choice.",
      );
    }
  };
  return (
    <section className="legal-card">
      <h2>Your browser preferences</h2>
      <p>
        These controls cover this public website. Necessary sign-in storage and
        preferences explicitly requested inside the separate trading application
        are not deleted. No analytics or advertising integration was found in
        the reviewed public-site code.
      </p>
      {[
        {
          label: "Strictly Necessary",
          checked: true,
          disabled: true,
          detail:
            "Always active: security, account access when requested and remembering privacy choices.",
        },
        {
          label: "Functional",
          checked: functional,
          disabled: false,
          detail:
            "Allow the optional Inter font from Google Fonts. Without consent a system font is used; the locally bundled Orbitron heading remains available.",
        },
        {
          label: "Analytics",
          checked: false,
          disabled: true,
          detail:
            "Not installed. No analytics resources are enabled by Accept All.",
        },
        {
          label: "Marketing",
          checked: false,
          disabled: true,
          detail:
            "Not installed. No advertising resources are enabled by Accept All.",
        },
      ].map((item) => (
        <label className="privacy-switch" key={item.label}>
          <span>
            <strong>{item.label}</strong>
            <small>{item.detail}</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-label={item.label}
            checked={item.checked}
            disabled={item.disabled}
            onChange={(e) => setFunctional(e.target.checked)}
          />
        </label>
      ))}
      <div className="legal-actions">
        <button onClick={() => persist(true)}>Accept All</button>
        <button onClick={() => persist(false)}>Reject Optional</button>
        <button onClick={() => persist(functional)}>Save Preferences</button>
      </div>
      <p role="status">{notice}</p>
      {error && <p role="alert">{error}</p>}
      <p>
        Choices are saved on this browser for 180 days. You can withdraw here at
        any time. Withdrawal stops future optional loading and removes its
        stylesheet; a completed network request cannot be recalled. Previously
        collected provider data may require a separate deletion request.
        Clearing browser storage, an expired record or a new consent version may
        prompt you again.
      </p>
      <Link href="/legal/privacy-choices">Make a privacy request</Link>
    </section>
  );
}
function Choices() {
  const { save, error } = usePrivacy();
  const [status, setStatus] = useState(""),
    [failure, setFailure] = useState(false),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    setBusy(true);
    setStatus("");
    setFailure(false);
    try {
      const response = await fetch("/api/privacy/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          kind: data.get("kind"),
          message: data.get("message"),
          acknowledged: data.get("acknowledged") === "on",
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error || "Delivery was not confirmed. Please email us directly.",
        );
      setStatus(`${body.message} Reference: ${body.id}`);
      form.reset();
    } catch (e) {
      setFailure(true);
      setStatus(
        e instanceof Error
          ? e.message
          : "Delivery was not confirmed. Your message remains in the form. Please email us directly.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="legal-card">
        <h2>Marketing, sharing and consent</h2>
        <p>
          No advertising pixels or public-site analytics integration were found
          in the reviewed code. This is not a claim that every business
          disclosure has been audited. Ask us about recipients, object to direct
          marketing or request restrictions that apply to your circumstances. We
          do not infer that EA Cloud sells information.
        </p>
        <button
          onClick={() => {
            if (save(false)) {
              setFailure(false);
              setStatus(
                "Optional public-site consent withdrawn. No advertising integration is enabled.",
              );
            }
          }}
        >
          Withdraw optional tracking consent
        </button>
        {error && <p role="alert">{error}</p>}
        <p>
          For an objection to marketing-related sharing, select that request
          below. An administrator must review the request and any applicable
          legal limits.
        </p>
      </section>
      <form className="legal-card privacy-form" onSubmit={submit}>
        <h2>Send a privacy request</h2>
        <p>
          Requests go to <a href={`mailto:${email}`}>{email}</a>. This form does
          not disclose account records or automatically delete anything. The
          administrator must verify your identity and authority through an
          appropriate channel before acting. Do not include passwords, trading
          credentials, payment-card details or identity documents.
        </p>
        <label>
          Your email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
          />
        </label>
        <label>
          Request type
          <select name="kind">
            <option value="access">Access my personal information</option>
            <option value="correction">Correct my information</option>
            <option value="deletion">Request deletion</option>
            <option value="marketing_objection">
              Object to marketing-related sharing or processing
            </option>
            <option value="privacy_question">
              Privacy question / disclosure information
            </option>
          </select>
        </label>
        <label>
          Message
          <textarea
            name="message"
            minLength={10}
            maxLength={2000}
            rows={5}
            required
          />
        </label>
        <label className="privacy-confirm">
          <input name="acknowledged" type="checkbox" required />I understand
          that identity verification and administrator review are required, and
          I have not included credentials.
        </label>
        <button disabled={busy} type="submit">
          {busy ? "Sending request…" : "Send privacy request"}
        </button>
        <p>
          Submission is confirmed only after the configured email service
          accepts the message. If delivery is unavailable, the form reports an
          error and retains your message. You can always{" "}
          <a href={`mailto:${email}?subject=EA%20Cloud%20privacy%20request`}>
            email the privacy contact directly
          </a>
          .
        </p>
        <p role={failure ? "alert" : "status"} aria-live="polite">
          {status}
        </p>
      </form>
    </>
  );
}
export default function Legal({ page }: { page?: string }) {
  const valid = !page || Boolean(titles[page]);
  const title = page
    ? titles[page] || "LEGAL PAGE NOT FOUND"
    : "EA CLOUD – LEGAL & PRIVACY";
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} | EA Cloud`;
    window.scrollTo(0, 0);
    return () => {
      document.title = previous;
    };
  }, [title]);
  return (
    <main id="public-content" className="legal-page">
      <div className="legal-shell">
        <p className="legal-eyebrow">EA CLOUD / LEGAL &amp; PRIVACY</p>
        <h1>{title}</h1>
        <p className="legal-subtitle">
          {page === "privacy-choices"
            ? "Take control of how your personal information is used."
            : "Transparency, security and control over your information."}
        </p>
        <p className="legal-date">
          Last updated: <time dateTime="2026-10-25">25 October 2026</time>
        </p>
        <nav className="legal-nav" aria-label="Legal pages">
          <Link href="/legal" aria-current={!page ? "page" : undefined}>
            Overview
          </Link>
          {legalLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.href === `/legal/${page}` ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <aside className="legal-review">
          <strong>Draft for administrator and legal review</strong>
          <p>
            Business registration, Information Officer designation, trading
            eligibility verification, final billing rules, retention schedules
            and production provider safeguards remain unconfirmed. These pages
            are not legally approved or a regulatory-compliance certification.
          </p>
        </aside>
        {!page && (
          <>
            <div className="legal-grid">
              {legalLinks.map((item) => (
                <Link className="legal-card" key={item.href} href={item.href}>
                  <h2>{item.label} →</h2>
                  <p>{descriptions[item.href]}</p>
                </Link>
              ))}
            </div>
            <section className="legal-card">
              <h2>Contact EA Cloud</h2>
              <p>
                South Africa · Business address: 123 Albatross, Thornton, Cape
                Town, 7460, South Africa.
              </p>
              <a href={`mailto:${email}`}>{email}</a>
              <p>
                No Information Officer has been formally designated. Use this
                email for privacy enquiries. Business registration details are
                pending confirmation.
              </p>
            </section>
          </>
        )}
        {(page === "terms" || page === "privacy") &&
          (page === "terms" ? terms : privacy).map((section) => (
            <section className="legal-card" key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.text}</p>
            </section>
          ))}
        {page === "privacy" && (
          <section className="legal-card">
            <h2>Regulator and legal references</h2>
            <p>
              <a
                href="https://inforegulator.org.za/complaints/"
                target="_blank"
                rel="noreferrer"
              >
                Information Regulator complaints
              </a>{" "}
              ·{" "}
              <a
                href="https://www.justice.gov.za/legislation/acts/2013-004.pdf"
                target="_blank"
                rel="noreferrer"
              >
                POPIA
              </a>{" "}
              ·{" "}
              <a
                href="https://www.gov.za/sites/default/files/gcis_document/201409/a25-02.pdf"
                target="_blank"
                rel="noreferrer"
              >
                ECTA
              </a>{" "}
              ·{" "}
              <a
                href="https://www.gov.za/documents/consumer-protection-act"
                target="_blank"
                rel="noreferrer"
              >
                Consumer Protection Act
              </a>{" "}
              ·{" "}
              <a
                href="https://www.justice.gov.za/legislation/acts/2005-038%20childrensact.pdf"
                target="_blank"
                rel="noreferrer"
              >
                Children’s Act
              </a>
            </p>
          </section>
        )}
        {page === "cookies" && (
          <>
            <section className="legal-card">
              <h2>Cookies and similar technologies</h2>
              <p>
                Cookies are small browser records sent with matching requests.
                LocalStorage and IndexedDB retain browser data without being
                cookies. HTTP caches can retain downloaded files. Necessary
                technologies support requested access, security and privacy
                choices. Functional technologies remember preferences or load
                optional fonts. No analytics or marketing integration was found
                in the reviewed public-site code; those categories are inactive.
              </p>
              <p>
                The inventory distinguishes public-site controls from the
                separate trading application. User-requested application
                preferences, authentication and notifications are not removed by
                rejecting public-site optional fonts. Use application settings,
                disconnect/sign-out and browser controls as appropriate;
                clearing storage can sign you out or remove preferences.
              </p>
            </section>
            <section className="legal-card">
              <h2>Reviewed technology inventory</h2>
              <div
                className="legal-table-scroll"
                tabIndex={0}
                aria-label="Scrollable storage inventory"
              >
                <table>
                  <thead>
                    <tr>
                      {[
                        "Name",
                        "Provider",
                        "Purpose",
                        "Category",
                        "Retention",
                        "Scope",
                      ].map((x) => (
                        <th key={x}>{x}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {storage.map((row) => (
                      <tr key={row[0]}>
                        {row.map((cell, i) => (
                          <td key={i}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="legal-card">
              <h2>Control and withdrawal</h2>
              <p>
                Public-site optional Google Fonts loading is blocked until
                Functional consent and removed when that consent is withdrawn.
                Analytics and marketing controls show inactive because no
                corresponding integration is installed. Consent is
                browser-specific and is not automatic erasure of previous
                provider records. Browser settings can remove stored data. New
                optional technologies require an updated inventory and
                appropriate consent gating before activation.
              </p>
              <Link href="/legal/cookie-settings">Open Cookie Settings</Link>
            </section>
          </>
        )}
        {page === "cookie-settings" && <Preferences />}
        {page === "privacy-choices" && <Choices />}
        {!valid && <p>Choose a page from the legal navigation above.</p>}
      </div>
    </main>
  );
}
