// Pages serves both frontends; the existing Node service owns all API routes.
export async function onRequest({ request, env }) {
  const unavailable = (message, status = 503) => Response.json({ error: message }, {
    status, headers: { "Cache-Control": "no-store" },
  });
  let backend;
  try {
    backend = new URL(env.BACKEND_ORIGIN);
    if (backend.protocol !== "https:" || backend.username || backend.password ||
        backend.pathname !== "/" || backend.search || backend.hash ||
        backend.origin === new URL(request.url).origin) throw new Error("Invalid backend origin");
  } catch {
    return unavailable("The API backend is not configured. Please contact support.");
  }
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, backend);
  const headers = new Headers(request.headers);
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
      return unavailable("The API backend returned a webpage instead of an API response.", 502);
    }
    const result = new Response(response.body, response);
    result.headers.set("Cache-Control", "no-store");
    return result;
  } catch {
    return unavailable("The API backend is unavailable. Please try again later.", 502);
  }
}
