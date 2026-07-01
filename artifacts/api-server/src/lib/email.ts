import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger";

// ─── Gmail SMTP email service ─────────────────────────────────────────────────
// Reusable transactional email sender backed by Gmail's SMTP.
// Credentials are read ONLY from Replit Secrets (never hardcoded):
//   EMAIL_ADDRESS  — the Gmail account to send from
//   EMAIL_PASSWORD — a Gmail App Password (NOT the normal account password)
// NEVER log the credentials.

const SMTP_HOST = "smtp.gmail.com";
const SMTP_PORT = 465; // implicit TLS

let _transporter: Transporter | null = null;

/** True when both Gmail credentials are present in the environment. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.EMAIL_ADDRESS && process.env.EMAIL_PASSWORD);
}

function getTransporter(): { transporter: Transporter; from: string } {
  const user = process.env.EMAIL_ADDRESS?.trim();
  // Gmail App Passwords are shown as four space-separated groups
  // (e.g. "abcd efgh ijkl mnop"); SMTP auth requires the 16 chars with NO
  // spaces, so strip all whitespace defensively — a leading/trailing newline
  // or the display spaces are the most common cause of 535 BadCredentials.
  const pass = process.env.EMAIL_PASSWORD?.replace(/\s+/g, "");
  if (!user || !pass) {
    throw new Error(
      "Email not configured: EMAIL_ADDRESS and EMAIL_PASSWORD must be set in Replit Secrets",
    );
  }
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: true,
      auth: { user, pass },
      // Pool a single persistent connection so we authenticate ONCE and reuse it
      // for every message. Without this, nodemailer re-AUTHs per message and a
      // bulk send trips Gmail's "454 Too many login attempts" rate limit.
      pool: true,
      maxConnections: 1,
      maxMessages: Infinity,
      // Throttle to a safe steady rate (≤ 10 messages/sec) to stay well under
      // Gmail's sending limits during bulk runs.
      rateDelta: 1000,
      rateLimit: 10,
    });
  }
  return { transporter: _transporter, from: user };
}

interface SendArgs {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Reusable low-level send. Throws on delivery failure so callers can decide
 * whether to surface or swallow the error (most notifications are fire-and-forget).
 */
export async function sendEmail(args: SendArgs): Promise<void> {
  const { transporter, from } = getTransporter();
  try {
    const info = await transporter.sendMail({
      from: `EA Cloud <${from}>`,
      to: args.to,
      replyTo: from,
      subject: args.subject,
      text: args.text,
      html: args.html,
      // Deliverability aids: a valid List-Unsubscribe header and explicit
      // Precedence improve inbox placement for transactional/bulk mail.
      headers: {
        "List-Unsubscribe": `<mailto:${from}?subject=unsubscribe>`,
        "X-Entity-Ref-ID": String(Date.now()),
      },
    });
    logger.info(
      { messageId: info.messageId, to: args.to, subject: args.subject },
      "Email sent",
    );
  } catch (err) {
    logger.error(
      { err, to: args.to, subject: args.subject },
      "Email delivery failed",
    );
    throw err;
  }
}

// ─── Branded HTML wrapper ─────────────────────────────────────────────────────
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function brandedHtml(opts: {
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
  ctaBackground?: string;
}): string {
  const ctaBg = opts.ctaBackground ?? "linear-gradient(135deg,#e31e24,#c01820)";
  // Escape the href before interpolating it into the HTML attribute so a value
  // sourced from request input cannot break out of the attribute or inject
  // markup. Labels are template-controlled, but escape defensively too.
  const cta =
    opts.ctaLabel && opts.ctaHref
      ? `<div style="text-align:center;margin-top:8px;">
           <a href="${escapeHtml(opts.ctaHref)}" style="display:inline-block;background:${ctaBg};color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:14px;letter-spacing:1px;">${escapeHtml(opts.ctaLabel)}</a>
         </div>`
      : "";
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#080810;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080810;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#0e0e1a;border:1px solid rgba(227,30,36,0.25);border-radius:16px;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#e31e24,#1a6bff);padding:28px 32px;text-align:center;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:1px;">EA CLOUD</h1>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:2px;text-transform:uppercase;">Black by Code. Red by Choice.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px;">
            <h2 style="margin:0 0 16px;color:#fff;font-size:20px;">${escapeHtml(opts.heading)}</h2>
            <p style="margin:0 0 24px;color:rgba(255,255,255,0.6);font-size:14px;line-height:1.7;">${opts.body}</p>
            ${cta}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
            <p style="margin:0;color:rgba(255,255,255,0.25);font-size:11px;">EA Cloud &mdash; Premium AI Copy Trading Ecosystem</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Transactional emails ─────────────────────────────────────────────────────

/** Sent immediately after a mentor submits their application. */
export async function sendMentorApplicationReceivedEmail(opts: {
  toEmail: string;
  firstName: string;
}): Promise<void> {
  const message =
    "Thank you for applying to become an EA Cloud Mentor. Your application has been received and is currently under review by our team. You will receive another email once your application has been approved.";
  await sendEmail({
    to: opts.toEmail,
    subject: "Mentor Application Received",
    text: `Hi ${opts.firstName},\n\n${message}`,
    html: brandedHtml({
      heading: `Application received, ${opts.firstName}`,
      body: message,
    }),
  });
}

/** Sent when a Super Admin approves a mentor application. */
export async function sendMentorApprovedEmail(opts: {
  toEmail: string;
  firstName: string;
}): Promise<void> {
  const message =
    "Congratulations. Your application to become an EA Cloud Mentor has been approved. You can now log in and access the Mentor Portal to manage your account and subscribers.";
  await sendEmail({
    to: opts.toEmail,
    subject: "Mentor Application Approved",
    text: `Hi ${opts.firstName},\n\n${message}`,
    html: brandedHtml({
      heading: `You're approved, ${opts.firstName}!`,
      body: message,
      ctaLabel: "LOGIN TO MENTOR PORTAL",
      ctaHref:
        "https://ai-copywriter--eacloudhoster.replit.app/admin/login",
    }),
  });
}

/**
 * Personalized variant of the approval email — addresses the mentor by name and
 * references their robot (EA) name, while keeping the same subject and the
 * corrected Mentor Portal link as the standard approved template.
 */
export async function sendMentorApprovedEmailPersonalized(opts: {
  toEmail: string;
  name: string;
  robotName: string;
}): Promise<void> {
  const greetingName = opts.name.trim() || "there";
  const robot = opts.robotName.trim();
  const robotClause = robot
    ? ` Your robot "${robot}" is now live on EA Cloud.`
    : "";
  const message =
    `Congratulations, ${greetingName}. Your application to become an EA Cloud Mentor has been approved.${robotClause} ` +
    "You can now log in and access the Mentor Portal to manage your account and subscribers.";
  await sendEmail({
    to: opts.toEmail,
    subject: "Mentor Application Approved",
    text: `Hi ${greetingName},\n\n${message}`,
    html: brandedHtml({
      heading: `You're approved, ${greetingName}!`,
      body: message,
      ctaLabel: "LOGIN TO MENTOR PORTAL",
      ctaHref:
        "https://ai-copywriter--eacloudhoster.replit.app/admin/login",
    }),
  });
}

/**
 * Broadcast notice telling mentors that the EA Cloud Instagram account was
 * disabled and pointing them to the new account via a purple CTA button.
 */
export async function sendInstagramMovedEmail(opts: {
  toEmail: string;
  instagramUrl: string;
}): Promise<void> {
  const message =
    "Dear valued mentor, our Instagram account has been disabled. Follow our new account here.";
  await sendEmail({
    to: opts.toEmail,
    subject: "Our Instagram Has Moved — Follow Our New Account",
    text: `${message}\n\nFollow our new account here: ${opts.instagramUrl}`,
    html: brandedHtml({
      heading: "Our Instagram Has Moved",
      body: message,
      ctaLabel: "Follow our new account here",
      ctaHref: opts.instagramUrl,
      ctaBackground: "linear-gradient(135deg,#7c3aed,#a855f7)",
    }),
  });
}

/**
 * Bulk campaign email announcing the EA Cloud mobile app to approved mentors.
 * Personalizes the greeting with the mentor's name when available, and the CTA
 * button links to the mobile app. Subject/body/links match the approved
 * campaign copy.
 */
export async function sendMobileAppLaunchEmail(opts: {
  toEmail: string;
  mentorName: string;
}): Promise<void> {
  const name = opts.mentorName.trim() || "there";
  const appUrl = "https://ai-copywriter--eacloudhoster.replit.app/ea-app/";
  const text =
    `Hello ${name},\n\n` +
    "Congratulations! \u{1F389}\n\n" +
    "Your EA Cloud mentor account has been approved and is fully active.\n\n" +
    "You can now download the EA Cloud Mobile App and start using our automated trading ecosystem.\n\n" +
    `\u{1F4F1} Download the EA Cloud Mobile App:\n${appUrl}\n\n` +
    "Features:\n\u2705 Automated Trading\n\u2705 Client Management\n\u2705 License Management\n\u2705 Trading Account Connectivity\n\u2705 Performance Monitoring\n\u2705 Business Growth Tools\n\n" +
    "Getting Started:\n1. Open the app link above.\n2. Install the app.\n3. Log in using your mentor credentials.\n4. Start connecting clients and using EA Cloud services.\n\n" +
    "If you need assistance, reply to this email and our team will help you.\n\n" +
    "Welcome to EA Cloud.\n\nRegards,\nEA Cloud Team";
  const dim = "color:rgba(255,255,255,0.6);";
  const bodyHtml =
    "Congratulations! \u{1F389}<br><br>" +
    "Your EA Cloud mentor account has been approved and is fully active.<br><br>" +
    "You can now download the EA Cloud Mobile App and start using our automated trading ecosystem." +
    `<br><br><strong style="color:#fff;">Features</strong><br>` +
    `<span style="${dim}">\u2705 Automated Trading<br>\u2705 Client Management<br>\u2705 License Management<br>\u2705 Trading Account Connectivity<br>\u2705 Performance Monitoring<br>\u2705 Business Growth Tools</span>` +
    `<br><br><strong style="color:#fff;">Getting Started</strong><br>` +
    `<span style="${dim}">1. Open the app link below.<br>2. Install the app.<br>3. Log in using your mentor credentials.<br>4. Start connecting clients and using EA Cloud services.</span>` +
    "<br><br>If you need assistance, reply to this email and our team will help you.";
  await sendEmail({
    to: opts.toEmail,
    subject:
      "\u{1F680} You're Approved! Download the EA Cloud Mobile App & Start Automated Trading",
    text,
    html: brandedHtml({
      heading: `Welcome aboard, ${name}!`,
      body: bodyHtml,
      ctaLabel: "Download the EA Cloud Mobile App",
      ctaHref: appUrl,
      ctaBackground: "linear-gradient(135deg,#1a6bff,#0047cc)",
    }),
  });
}

/**
 * Bulk campaign email telling an approved applicant that a once-off R600
 * activation fee must be paid manually (subscriptions are temporarily down).
 * Personalizes the greeting with the recipient's name and inserts their own
 * email address as the TymeBank payment reference. Dynamic values (name, email)
 * are escaped before being interpolated into the raw-HTML body.
 */
export async function sendPaymentApprovalEmail(opts: {
  toEmail: string;
  name: string;
}): Promise<void> {
  const name = opts.name.trim() || "there";
  const ref = opts.toEmail.trim();
  const safeName = escapeHtml(name);
  const safeRef = escapeHtml(ref);

  const text =
    `Hello ${name},\n\n` +
    "Your request to access EA Cloud has been received and approved.\n\n" +
    "Before your account can be activated, a once-off activation fee of R600 is required.\n\n" +
    "Please note that EA Cloud subscriptions are currently down. As a result, payments are currently being processed manually.\n\n" +
    "=== PAYMENT DETAILS ===\n" +
    "Bank: TymeBank\n" +
    "Account Name: EA Cloud\n" +
    "Account Number: 51114399259\n" +
    "Amount: R600\n" +
    `Reference: ${ref}\n\n` +
    "=== HOW IT WORKS ===\n" +
    "1. Make an EFT payment of R600 to the TymeBank account above.\n" +
    "2. Use your email address as the payment reference.\n" +
    "3. Send proof of payment back to this email.\n" +
    "4. Once payment is confirmed your EA Cloud account will be activated.\n\n" +
    "IMPORTANT: The payment reference must match your registered email address exactly.\n\n" +
    "Kind Regards,\nEA Cloud Team";

  const dim = "color:rgba(255,255,255,0.6);";
  const label = "color:rgba(255,255,255,0.4);font-size:13px;";
  const val = "color:#fff;font-size:13px;font-weight:600;";
  const row = (l: string, v: string) =>
    `<tr><td style="${label}padding:4px 0;">${l}</td><td style="${val}padding:4px 0;text-align:right;">${v}</td></tr>`;

  const bodyHtml =
    `Hello ${safeName},<br><br>` +
    "Your request to access EA Cloud has been received and <strong style=\"color:#fff;\">approved</strong>.<br><br>" +
    `Before your account can be activated, a once-off activation fee of <strong style="color:#fff;">R600</strong> is required.<br><br>` +
    `<span style="${dim}">Please note that EA Cloud subscriptions are currently down. As a result, payments are currently being processed manually.</span>` +
    `<br><br><div style="background:rgba(255,255,255,0.03);border:1px solid rgba(227,30,36,0.25);border-radius:10px;padding:16px 20px;">` +
    `<p style="margin:0 0 10px;color:#e31e24;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Payment Details</p>` +
    `<table width="100%" cellpadding="0" cellspacing="0">` +
    row("Bank", "TymeBank") +
    row("Account Name", "EA Cloud") +
    row("Account Number", "51114399259") +
    row("Amount", "R600") +
    row("Reference", safeRef) +
    `</table></div>` +
    `<br><strong style="color:#fff;">How It Works</strong><br>` +
    `<span style="${dim}">1. Make an EFT payment of R600 to the TymeBank account above.<br>2. Use your email address as the payment reference.<br>3. Send proof of payment back to this email.<br>4. Once payment is confirmed your EA Cloud account will be activated.</span>` +
    `<br><br><span style="color:#e31e24;font-weight:600;">Important:</span> <span style="${dim}">The payment reference must match your registered email address exactly.</span>` +
    `<br><br>Kind Regards,<br>EA Cloud Team`;

  await sendEmail({
    to: opts.toEmail,
    subject: "EA Cloud Access Approval \u2013 Payment Required",
    text,
    html: brandedHtml({
      heading: `Access Approved, ${name}`,
      body: bodyHtml,
    }),
  });
}

/** Diagnostic email used by the test endpoint to verify SMTP configuration. */
export async function sendTestEmail(toEmail: string): Promise<void> {
  await sendEmail({
    to: toEmail,
    subject: "EA Cloud Email Test",
    text: "This is a test email from EA Cloud. If you received this, your Gmail SMTP configuration is working correctly.",
    html: brandedHtml({
      heading: "Email configuration works",
      body: "This is a test email from EA Cloud. If you received this, your Gmail SMTP configuration is working correctly.",
    }),
  });
}
