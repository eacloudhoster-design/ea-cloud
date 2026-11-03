import { sessionFailureInfo } from "./session-diagnostics";

/** Never log the wrapped Drizzle error: it can contain SQL and parameters. */
export function reportPortalAuthFailure(
  req: any,
  res: any,
  error: unknown,
  phase: "login" | "restore",
) {
  const detail = sessionFailureInfo(error);
  req.log?.error?.(
    { event: "portal_auth_unavailable", phase, ...detail },
    "Portal authentication service unavailable",
  );
  res.setHeader("Cache-Control", "no-store");
  res
    .status(503)
    .json({
      error:
        "The authentication service is temporarily unavailable. Please retry.",
      code: detail.code,
    });
}
