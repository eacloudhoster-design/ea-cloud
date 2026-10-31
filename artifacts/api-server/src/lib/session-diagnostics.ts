/** Known driver codes only. Never include SQL, error messages, parameters or credentials. */
export function sessionFailureInfo(error: unknown) {
  const queue: any[] = [error],
    seen = new Set<unknown>();
  const schema = new Set(["42P01", "42703"]);
  const connection = new Set([
    "08000",
    "08001",
    "08003",
    "08006",
    "53300",
    "53400",
    "57P01",
    "57P02",
    "57P03",
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EAI_AGAIN",
  ]);
  for (let i = 0; queue.length && i < 16; i++) {
    const item = queue.shift();
    if (!item || typeof item !== "object" || seen.has(item)) continue;
    seen.add(item);
    if (schema.has(item.code))
      return {
        code: "SESSION_STORAGE_SCHEMA_UNAVAILABLE",
        category: "database_schema",
        driverCode: item.code,
      };
    if (connection.has(item.code))
      return {
        code: "SESSION_STORAGE_UNAVAILABLE",
        category: "database_connection",
        driverCode: item.code,
      };
    if (["28P01", "28000"].includes(item.code))
      return {
        code: "SESSION_STORAGE_UNAVAILABLE",
        category: "database_credentials",
        driverCode: item.code,
      };
    if (item.cause) queue.push(item.cause);
    if (Array.isArray(item.errors)) queue.push(...item.errors.slice(0, 8));
  }
  return { code: "SESSION_BACKEND_FAILURE", category: "backend" };
}
export function reportSessionFailure(
  req: any,
  res: any,
  error: unknown,
  phase: "session" | "identity" | "branding" | "licence",
) {
  const detail = sessionFailureInfo(error);
  req.log?.error?.(
    { event: "app_startup_backend_failed", phase, ...detail },
    "Application startup request unavailable",
  );
  res.setHeader("Cache-Control", "no-store");
  res
    .status(503)
    .json({
      error: "Session verification is temporarily unavailable. Please retry.",
      code: detail.code,
    });
}
