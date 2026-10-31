// Public, read-only probes. No cookies, credentials, private bodies or environment values.
const pages = "https://ea-cloud-website.pages.dev",
  api = "https://ea-cloud-api.onrender.com";
for (const [name, url] of [
  ["pages_health", pages + "/api/healthz"],
  ["render_health", api + "/api/healthz"],
  ["anonymous_session", pages + "/api/app/me"],
  ["pages_build", pages + "/build-info.json"],
]) {
  const start = Date.now();
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(65000),
      redirect: "manual",
      cache: "no-store",
      credentials: "omit",
    });
    let data;
    try {
      data = await r.json();
    } catch {}
    const code = [
      "API_BACKEND_NOT_CONFIGURED",
      "API_UPSTREAM_UNREACHABLE",
      "API_UPSTREAM_HTML",
      "API_UPSTREAM_UNAVAILABLE",
      "SESSION_STORAGE_SCHEMA_UNAVAILABLE",
      "SESSION_STORAGE_UNAVAILABLE",
      "SESSION_BACKEND_FAILURE",
    ].includes(data?.code)
      ? data.code
      : undefined;
    console.log(
      JSON.stringify({
        probe: name,
        status: r.status,
        elapsedMs: Date.now() - start,
        code,
        commit:
          name === "pages_build" && /^[a-f0-9]{40}$/.test(data?.commit)
            ? data.commit
            : undefined,
        expectedAnonymous401:
          name === "anonymous_session" ? r.status === 401 : undefined,
      }),
    );
  } catch {
    console.log(
      JSON.stringify({
        probe: name,
        status: "network_or_timeout",
        elapsedMs: Date.now() - start,
      }),
    );
  }
}
