import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  requestBackgroundUpload,
  storedBackground,
} from "../../functions/_lib/background-storage.js";
const originalFetch = globalThis.fetch;
const portalCookie = `ea_portal_session=${"a".repeat(64)}`;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZbN8AAAAASUVORK5CYII=",
    "base64",
  ),
);
const bucket = () => {
  const objects = new Map();
  return {
    async put(key, bytes, options) {
      assert.equal(options.onlyIf.etagDoesNotMatch, "*");
      if (objects.has(key)) return null;
      objects.set(key, { bytes, metadata: options.httpMetadata });
      return { key };
    },
    async get(key) {
      const stored = objects.get(key);
      if (!stored) return null;
      return {
        body: stored.bytes,
        size: stored.bytes.length,
        httpEtag: '"test-etag"',
        writeHttpMetadata(headers) {
          headers.set("Content-Type", stored.metadata.contentType);
        },
      };
    },
  };
};
const environment = () => ({
  BACKEND_ORIGIN: "https://backend.example",
  BACKGROUND_IMAGES: bucket(),
});
const signedIn = (user = { id: 7, role: "mentor", status: "approved" }) => {
  globalThis.fetch = async (request, options) => {
    assert.equal(String(request), "https://backend.example/api/auth/me");
    assert.equal(options.headers.Cookie, portalCookie);
    assert.equal(options.headers.Authorization, undefined);
    return Response.json(user);
  };
};
const ticket = (
  env,
  metadata = {
    name: "background.png",
    size: png.length,
    contentType: "image/png",
  },
  auth = true,
) =>
  requestBackgroundUpload({
    env,
    request: new Request(
      "https://site.example/api/storage/uploads/request-url",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(auth ? { Cookie: portalCookie } : {}),
        },
        body: JSON.stringify(metadata),
      },
    ),
  });
const upload = (env, url, body = png, type = "image/png") =>
  storedBackground({
    env,
    request: new Request(url, {
      method: "PUT",
      headers: { Cookie: portalCookie, "Content-Type": type },
      body,
    }),
  });

test("missing binding is actionable and unauthenticated requests stay denied", async () => {
  signedIn();
  assert.equal((await ticket(environment(), undefined, false)).status, 401);
  const response = await ticket({ BACKEND_ORIGIN: "https://backend.example" });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /BACKGROUND_IMAGES/);
});
test("authorization uses backend account status and role, not a decoded token", async () => {
  for (const user of [
    { id: 7, role: "mentor", status: "pending" },
    { id: 7, role: "client", status: "approved" },
  ]) {
    signedIn(user);
    assert.equal((await ticket(environment())).status, 403);
  }
  globalThis.fetch = async () =>
    Response.json({ error: "Unauthorized" }, { status: 401 });
  assert.equal((await ticket(environment())).status, 401);
});
test("upload, public GET and HEAD survive independent requests; overwrite is refused", async () => {
  signedIn();
  const env = environment();
  const meta = await (await ticket(env)).json();
  assert.match(meta.objectPath, /^\/r2\/7\//);
  assert.equal((await upload(env, meta.uploadURL)).status, 200);
  const response = await storedBackground({
    env,
    request: new Request(meta.uploadURL),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), png);
  const head = await storedBackground({
    env,
    request: new Request(meta.uploadURL, { method: "HEAD" }),
  });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.equal((await upload(env, meta.uploadURL)).status, 409);
});
test("another account cannot write the issued object path", async () => {
  signedIn();
  const env = environment();
  const meta = await (await ticket(env)).json();
  signedIn({ id: 8, role: "mentor", status: "approved" });
  assert.equal((await upload(env, meta.uploadURL)).status, 403);
});
test("metadata and upload bytes enforce image types and size, including spoofed MIME", async () => {
  signedIn();
  const env = environment();
  assert.equal(
    (await ticket(env, { name: "x", size: 10 * 1024 * 1024 + 1, contentType: "image/png" }))
      .status,
    413,
  );
  assert.equal(
    (await ticket(env, { name: "x", size: 10, contentType: "image/svg+xml" }))
      .status,
    415,
  );
  assert.equal((await ticket(env, null)).status, 400);
  assert.equal((await ticket(env, { name: "large.png", size: 10 * 1024 * 1024, contentType: "image/png" })).status, 200);
  const meta = await (await ticket(env)).json();
  assert.equal(
    (await upload(env, meta.uploadURL, "<html>bad</html>")).status,
    415,
  );
  assert.equal(
    (await upload(env, meta.uploadURL, new Uint8Array(10 * 1024 * 1024 + 1)))
      .status,
    413,
  );
});
test("invalid paths, absent objects, backend failures and bucket failures return safe errors", async () => {
  const env = environment();
  signedIn();
  assert.equal(
    (
      await storedBackground({
        env,
        request: new Request("https://site.example/api/storage/r2/invalid"),
      })
    ).status,
    404,
  );
  const meta = await (await ticket(env)).json();
  assert.equal(
    (await storedBackground({ env, request: new Request(meta.uploadURL) }))
      .status,
    404,
  );
  globalThis.fetch = async () => {
    throw new Error("private backend details");
  };
  const response = await ticket(env);
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes("private backend details"));
});

test('bucket exceptions produce safe service errors without provider details', async () => {
  signedIn();
  const env = environment();
  const meta = await (await ticket(env)).json();
  const logs = [];
  const original = console.error;
  console.error = (...args) => logs.push(args.join(' '));
  try {
    env.BACKGROUND_IMAGES.put = async () => { throw new Error('private-storage-detail'); };
    const failed = await upload(env, meta.uploadURL);
    assert.equal(failed.status, 503);
    assert.ok(!(await failed.text()).includes('private-storage-detail'));
    env.BACKGROUND_IMAGES.get = async () => { throw new Error('private-storage-detail'); };
    const read = await storedBackground({ env, request: new Request(meta.uploadURL) });
    assert.equal(read.status, 503);
    assert.ok(!logs.join(' ').includes('private-storage-detail'));
  } finally { console.error = original; }
});

test("the streamed upload accepts the requested 10MB boundary",async()=>{signedIn();const env=environment();const bytes=new Uint8Array(10*1024*1024);bytes.set(png);const metadata=await(await ticket(env,{name:"large.png",size:bytes.length,contentType:"image/png"})).json();assert.equal((await upload(env,metadata.uploadURL,bytes)).status,200);});

test("upload authorization forwards only a valid portal cookie and rejects legacy hints, client cookies and cross-site writes",async()=>{
 signedIn();const env=environment();
 const call=headers=>requestBackgroundUpload({env,request:new Request("https://site.example/api/storage/uploads/request-url",{method:"POST",headers:{"Content-Type":"application/json",...headers},body:JSON.stringify({name:"image.png",size:png.length,contentType:"image/png"})})});
 for(const headers of [{Authorization:"Bearer cookie-portal"},{Cookie:`ea_client_session=${"b".repeat(64)}`},{Cookie:"ea_portal_session=invalid"}])assert.equal((await call(headers)).status,401);
 assert.equal((await call({Cookie:`other=private; ${portalCookie}; ea_client_session=${"b".repeat(64)}`,Origin:"https://site.example"})).status,200);
 assert.equal((await call({Cookie:portalCookie,Origin:"https://attacker.example"})).status,403);
 assert.equal((await call({Cookie:portalCookie,"Sec-Fetch-Site":"cross-site"})).status,403);
});
