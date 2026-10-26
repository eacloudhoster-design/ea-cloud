import { createHash, createHmac, timingSafeEqual } from "node:crypto";
const cookieName = "ea_push_session",
  options = {
    httpOnly: true,
    secure: true,
    sameSite: "strict" as const,
    path: "/api/app/push",
  },
  duration = 30 * 86400000;
function secret() {
  const value = process.env.SESSION_SECRET;
  return value && value.length >= 16 ? value : null;
}
export function issuePushSession(
  res: any,
  clientId: number,
  token: string,
  now = Date.now(),
) {
  const key = secret();
  if (!key) return false;
  const body = Buffer.from(
    JSON.stringify({
      clientId,
      issuedAt: now,
      expiresAt: now + duration,
      tokenHash: createHash("sha256").update(token).digest("hex"),
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", key)
    .update("ea-cloud-push-v1:" + body)
    .digest("base64url");
  res.cookie(cookieName, body + "." + signature, {
    ...options,
    maxAge: duration,
  });
  return true;
}
export function clearPushSession(res: any) {
  res.clearCookie(cookieName, options);
}
export function requirePushSession(req: any, res: any, next: any) {
  if (req.verifiedSession?.kind === "client" && req.verifiedSession.id === req.clientId) { next(); return; }
  const fail = () => {
    req.log?.warn?.(
      { event: "web_push_login_required", code: "PUSH_LOGIN_REQUIRED" },
      "Fresh password login required for push setup",
    );
    return res
      .status(401)
      .json({
        error: "Sign out and sign in again to enable push notifications.",
        code: "PUSH_LOGIN_REQUIRED",
      });
  };
  try {
    const key = secret();
    if (!key) {
      res
        .status(503)
        .json({
          error: "Push session configuration is unavailable.",
          code: "PUSH_SESSION_CONFIGURATION",
        });
      return;
    }
    const value = String(req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
    if (!value || value.length > 1024) return fail();
    const [body, signature, ...rest] = decodeURIComponent(value).split(".");
    if (rest.length || !body || !signature) return fail();
    const expected = createHmac("sha256", key)
        .update("ea-cloud-push-v1:" + body)
        .digest(),
      actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return fail();
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()),
      token = String(req.headers.authorization || "").slice(7),
      now = Date.now();
    if (
      payload.clientId !== req.clientId ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= now ||
      payload.expiresAt - payload.issuedAt !== duration ||
      payload.issuedAt > now + 5000 ||
      payload.tokenHash !== createHash("sha256").update(token).digest("hex")
    )
      return fail();
    next();
  } catch {
    return fail();
  }
}
