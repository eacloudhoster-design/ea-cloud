// No live credentials or external email: production router + in-memory SMTP acceptance seam.
import assert from "node:assert/strict";
import express from "express";
import { createPrivacyRouter } from "./privacy";
import { sendPrivacyRequestEmail } from "../lib/email";
const origin = "http://privacy-test.invalid";
process.env.PRIVACY_ALLOWED_ORIGINS = origin;
const messages: any[] = [];
const app = express();
app.use(express.json());
app.use(
  "/ok",
  createPrivacyRouter({
    configured: () => true,
    deliver: (request) =>
      sendPrivacyRequestEmail(request, {
        sendMail: async (mail) => {
          messages.push(mail);
          return { accepted: ["eacloudhoster@gmail.com"] };
        },
      }),
  }),
);
app.use(
  "/unconfigured",
  createPrivacyRouter({
    configured: () => false,
    deliver: async () => {
      throw new Error("must not send");
    },
  }),
);
app.use(
  "/rejected",
  createPrivacyRouter({
    configured: () => true,
    deliver: (request) =>
      sendPrivacyRequestEmail(request, {
        sendMail: async () => ({ accepted: [] }),
      }),
  }),
);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address() as { port: number };
const base = `http://127.0.0.1:${address.port}`;
const payload = {
  email: "person@example.invalid",
  kind: "deletion",
  message: "Please review deletion of my account.",
  acknowledged: true,
};
async function post(path: string, body: any = payload, requestOrigin = origin) {
  return fetch(`${base}/${path}/privacy/requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: requestOrigin },
    body: JSON.stringify(body),
  });
}
try {
  let r = await post("ok");
  assert.equal(r.status, 201);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const receipt: any = await r.json();
  assert.match(receipt.id, /^[a-f0-9-]{36}$/);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, "eacloudhoster@gmail.com");
  assert.equal(messages[0].replyTo, payload.email);
  assert.ok(messages[0].text.includes(payload.message));
  assert.ok(!messages[0].subject.includes(payload.email));
  assert.equal(
    (await post("ok", payload, "https://untrusted.invalid")).status,
    403,
  );
  assert.equal(
    (await post("ok", { ...payload, acknowledged: false })).status,
    400,
  );
  assert.equal(
    (await post("ok", { ...payload, password: "must not be accepted" })).status,
    400,
  );
  assert.equal((await post("unconfigured")).status, 503);
  assert.equal((await post("rejected")).status, 503);
  assert.equal(messages.length, 1);
  await post("ok");
  assert.equal((await post("ok")).status, 429);
  console.log(
    "PASS: actual privacy router validates origin/body, routes to confirmed inbox, requires SMTP acceptance, fails visibly, rate limits; no real email sent.",
  );
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
