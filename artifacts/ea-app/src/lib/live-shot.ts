import {
  marketSchema,
  analysisSchema,
} from "../../../../lib/api-zod/src/live-shot";
export async function liveShotRequest(
  path: string,
  token: string,
  signal: AbortSignal,
  selection?: unknown,
) {
  const response = await fetch(`/api/app/scanner/live-shot/${path}`, {
    method: selection ? "POST" : "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(selection ? { "Content-Type": "application/json" } : {}),
    },
    ...(selection ? { body: JSON.stringify(selection) } : {}),
    signal: AbortSignal.any([
      signal,
      AbortSignal.timeout(selection ? 70000 : 15000),
    ]),
  });
  const raw = await response.json().catch(() => null);
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  if (!response.ok)
    throw new Error(
      body.error ||
        (response.status === 429
          ? "Too many requests. Please wait and retry."
          : "Live Shot is unavailable. Please retry."),
    );
  if (path.startsWith("candles?")) return marketSchema.parse(body);
  if (selection) return { ...body, report: analysisSchema.parse(body.report) };
  if (
    !Array.isArray(body.symbols) ||
    body.symbols.length > 5000 ||
    body.symbols.some(
      (s: unknown) => typeof s !== "string" || !s || s.length > 40,
    )
  )
    throw Error("Invalid broker symbol response.");
  return body;
}
