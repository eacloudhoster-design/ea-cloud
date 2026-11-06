// Preserve the existing backend; optionally route only MT5 management to an isolated non-trading service.
export async function onRequest({ request, env }) {
  const unavailable = (message, status = 503, code = "API_UPSTREAM_UNREACHABLE", upstreamStatus) => Response.json({ error: message, code, ...(upstreamStatus ? {upstreamStatus} : {}) }, {
    status, headers: { "Cache-Control": "no-store" },
  });
  const incoming = new URL(request.url);
  const managedPath=/^\/api\/(?:app\/(?:engine\/status|mt5-(?:connect|disconnect))|admin\/(?:mt5\/(?:status|connections|connect|disconnect)|engine\/clients(?:\/[1-9]\d*(?:\/policy)?)?))\/?$/.test(incoming.pathname);
  const management=managedPath&&Boolean(env.MT5_MANAGEMENT_ORIGIN);
  const origin=management?env.MT5_MANAGEMENT_ORIGIN:env.BACKEND_ORIGIN;
  const proxyToken=management?env.MT5_MANAGEMENT_PROXY_TOKEN:env.BACKEND_PROXY_TOKEN;
  let backend;
  try {
    backend = new URL(origin);
    if (backend.protocol !== "https:" || backend.username || backend.password ||
        backend.pathname !== "/" || backend.search || backend.hash ||
        backend.origin === new URL(request.url).origin) throw new Error("Invalid backend origin");
  } catch {
    console.warn({event:"api_proxy_failed",code:"API_BACKEND_NOT_CONFIGURED",status:503});
    return unavailable("The API backend is not configured. Please contact support.",503,"API_BACKEND_NOT_CONFIGURED");
  }
  const target = new URL(incoming.pathname + incoming.search, backend);
  if (proxyToken && (typeof proxyToken !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(proxyToken))) {
    console.warn({event:"api_proxy_failed",code:"API_BACKEND_NOT_CONFIGURED",status:503});
    return unavailable("The API gateway is not configured correctly.",503,"API_BACKEND_NOT_CONFIGURED");
  }
  const headers = new Headers(request.headers);
  // Optional private-origin authentication for an approved VPS cutover. Never
  // trust a caller-supplied token; existing hosts need no new configuration.
  headers.delete("x-ea-cloud-origin-token");
  if (proxyToken) headers.set("x-ea-cloud-origin-token", proxyToken);
  headers.delete("host");
  // Do not trust a caller-supplied forwarding chain at the API's trust boundary.
  headers.delete("forwarded");
  headers.delete("x-forwarded-for");
  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp) headers.set("x-forwarded-for", clientIp);
  headers.set("x-forwarded-proto", "https");
  headers.set("x-forwarded-host", incoming.host);
  try {
    const response = await fetch(new Request(new Request(target, request), {
      headers,
      redirect: "manual",
    }));
    // Return upgrade responses untouched so WebSockets continue to work.
    if (response.status === 101) return response;
    if (response.headers.get("content-type")?.includes("text/html")) {
      const code = response.status >= 500 || response.status === 429 ? "API_UPSTREAM_UNAVAILABLE" : "API_UPSTREAM_HTML";
      console.warn({event:"api_proxy_failed",code,status:502,upstreamStatus:response.status});
      return unavailable("The API backend returned a webpage instead of an API response.",502,code,response.status);
    }
    const result = new Response(response.body, response);
    result.headers.set("Cache-Control", "no-store");
    return result;
  } catch {
    console.warn({event:"api_proxy_failed",code:"API_UPSTREAM_UNREACHABLE",status:502});
    return unavailable("The API backend is unavailable. Please try again later.",502,"API_UPSTREAM_UNREACHABLE");
  }
}
