const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const PREFIX = "/api/storage/r2/";
const json = (error, status) =>
  Response.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );

async function authorizedUser(request, env) {
  // The API authenticates portal browsers with an HttpOnly cookie. Bearer
  // identity hints are not credentials and must never authorize an upload.
  const cookie = (request.headers.get("cookie") || "")
    .split(";").map(value => value.trim())
    .find(value => /^ea_portal_session=[a-f0-9]{64}$/.test(value));
  if (!cookie) return json("Sign in before uploading an image.", 401);
  // This handler performs writes locally, so enforce its browser origin here
  // rather than relying on the upstream read-only /auth/me request's checks.
  const browserOrigin = request.headers.get("origin");
  if ((browserOrigin && browserOrigin !== new URL(request.url).origin) ||
      request.headers.get("sec-fetch-site") === "cross-site")
    return json("Request origin is not allowed.", 403);
  let origin;
  try {
    origin = new URL(env.BACKEND_ORIGIN);
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      origin.origin === new URL(request.url).origin
    )
      throw new Error();
  } catch {
    return json("The API backend is not configured.", 503);
  }
  try {
    const response = await fetch(new URL("/api/auth/me", origin), {
      headers: { Cookie: cookie },
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    if (
      response.status === 401 ||
      response.status === 403 ||
      response.status === 404
    )
      return json("Sign in with an authorized account.", 401);
    if (!response.ok)
      return json(
        "Unable to verify your account. Please try again later.",
        502,
      );
    const user = await response.json();
    if (
      !Number.isSafeInteger(user.id) ||
      user.id < 1 ||
      !["mentor", "superadmin"].includes(user.role) ||
      user.status !== "approved"
    ) {
      return json("An approved mentor or owner account is required.", 403);
    }
    return user;
  } catch {
    return json("Unable to verify your account. Please try again later.", 502);
  }
}
const missingBucket = () =>
  json(
    "Background storage is not configured. Bind the BACKGROUND_IMAGES R2 bucket in Cloudflare Pages and redeploy.",
    503,
  );

export async function requestBackgroundUpload({ request, env }) {
  const user = await authorizedUser(request, env);
  if (user instanceof Response) return user;
  if (!env.BACKGROUND_IMAGES) return missingBucket();
  let data;
  try {
    data = await request.json();
  } catch {
    return json("Invalid upload request.", 400);
  }
  if (
    !data ||
    typeof data.name !== "string" ||
    !data.name.trim() ||
    !Number.isSafeInteger(data.size) ||
    data.size < 1
  )
    return json("Invalid upload metadata.", 400);
  if (!TYPES.has(data.contentType))
    return json("Choose a JPEG, PNG, WebP or GIF image.", 415);
  if (data.size > MAX_BYTES) return json("Image must be 10MB or smaller.", 413);
  const path = `${user.id}/${crypto.randomUUID()}`;
  return Response.json(
    {
      uploadURL: new URL(`${PREFIX}${path}`, request.url).href,
      objectPath: `/r2/${path}`,
      metadata: {
        name: data.name,
        size: data.size,
        contentType: data.contentType,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function detectedType(bytes) {
  if (
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)
  )
    return "image/png";
  if (
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return "image/jpeg";
  const ascii = new TextDecoder("ascii");
  if (
    bytes.length >= 12 &&
    ascii.decode(bytes.slice(0, 4)) === "RIFF" &&
    ascii.decode(bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  if (
    bytes.length >= 6 &&
    ["GIF87a", "GIF89a"].includes(ascii.decode(bytes.slice(0, 6)))
  )
    return "image/gif";
  return null;
}

export async function storedBackground({ request, env }) {
  const path = new URL(request.url).pathname.slice(PREFIX.length);
  if (
    !/^[1-9][0-9]*\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      path,
    )
  )
    return json("Image not found.", 404);
  const key = `backgrounds/${path}`;
  if (request.method === "PUT") {
    const user = await authorizedUser(request, env);
    if (user instanceof Response) return user;
    if (String(user.id) !== path.split("/")[0])
      return json("You cannot upload to another account.", 403);
    if (!env.BACKGROUND_IMAGES) return missingBucket();
    const type = request.headers.get("content-type")?.split(";")[0];
    if (!TYPES.has(type))
      return json("Choose a JPEG, PNG, WebP or GIF image.", 415);
    if (Number(request.headers.get("content-length")) > MAX_BYTES)
      return json("Image must be 10MB or smaller.", 413);
    const reader = request.body?.getReader();
    if (!reader) return json("An image is required.", 400);
    try {
      const chunks = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) {
          await reader.cancel();
          return json("Image must be 10MB or smaller.", 413);
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      if (detectedType(bytes) !== type)
        return json(
          "The file contents do not match the selected image format.",
          415,
        );
      const object = await env.BACKGROUND_IMAGES.put(key, bytes, {
        onlyIf: { etagDoesNotMatch: "*" },
        httpMetadata: {
          contentType: type,
          cacheControl: "public, max-age=31536000, immutable",
        },
      });
      if (!object)
        return json(
          "This upload URL has already been used. Select the image again.",
          409,
        );
      return Response.json(
        { objectPath: `/r2/${path}` },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      console.error("R2 background upload failed");
      return json(
        "Unable to store the image. Check the R2 bucket binding and try again.",
        503,
      );
    }
  }
  if (request.method !== "GET" && request.method !== "HEAD")
    return json("Method not allowed.", 405);
  if (!env.BACKGROUND_IMAGES) return missingBucket();
  try {
    const object = await env.BACKGROUND_IMAGES.get(key);
    if (!object) return json("Image not found.", 404);
    const headers = new Headers({
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    object.writeHttpMetadata(headers);
    headers.set("ETag", object.httpEtag);
    headers.set("Content-Length", String(object.size));
    return new Response(request.method === "HEAD" ? null : object.body, {
      headers,
    });
  } catch {
    console.error("R2 background read failed");
    return json("Unable to load the image. Please try again later.", 503);
  }
}
