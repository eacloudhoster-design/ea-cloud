// Private transport configuration; no public plaintext credential transport.
export const MT5_VPS_BASE = (process.env.MT5_VPS_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const endpoint = new URL(MT5_VPS_BASE);
if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
    (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)))) {
  throw new Error("MT5_VPS_URL requires HTTPS or loopback HTTP and no embedded credentials");
}
export function mt5Headers(): Record<string, string> {
  const token = process.env.MT5_VPS_TOKEN;
  if (!token || token.length < 32) throw new Error("MT5 VPS service credential is not configured");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}
