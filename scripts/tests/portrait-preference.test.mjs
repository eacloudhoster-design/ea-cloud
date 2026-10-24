import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "../../artifacts/api-server/node_modules/esbuild/lib/main.js";
const result = await build({
  entryPoints: ["artifacts/ea-app/src/lib/shape-preference.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const {
  portraitPreferenceKey,
  shapePreferenceKey,
  readPortraitPreference,
  nextPortraitPreference,
} = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);
const token = (id) => btoa(`${id}:client:fixture`);
test("portrait choices isolate accounts, bots and interfaces and retain previous visible shape through reload", () => {
  const map = new Map(),
    storage = { getItem: (k) => map.get(k) || null };
  const key = portraitPreferenceKey(token(7), {
      bot: "mentor:5:ea:11",
      interfaceStyle: "regular",
    }),
    legacy = shapePreferenceKey(token(7));
  map.set(legacy, "neural");
  assert.equal(readPortraitPreference(storage, key, legacy).shape, "neural");
  const hidden = nextPortraitPreference(
    { shape: "neural", previous: "neural" },
    "none",
  );
  map.set(key, JSON.stringify(hidden));
  assert.deepEqual(readPortraitPreference(storage, key, legacy), {
    shape: "none",
    previous: "neural",
  });
  for (const [user, bot, interfaceStyle] of [
    [8, "mentor:5:ea:11", "regular"],
    [7, "mentor:5:ea:12", "regular"],
    [7, "mentor:5:ea:11", "matrix"],
  ]) {
    const other = portraitPreferenceKey(token(user), { bot, interfaceStyle });
    assert.notEqual(other, key);
    assert.notEqual(
      readPortraitPreference(storage, other, shapePreferenceKey(token(user)))
        .shape,
      "none",
    );
  }
  assert.deepEqual(nextPortraitPreference(hidden, "neural"), {
    shape: "neural",
    previous: "neural",
  });
  assert.equal(
    portraitPreferenceKey("bad", { bot: "bot", interfaceStyle: "regular" }),
    null,
  );
});
test("mentor default is used before a local choice; malformed or blocked storage is safe", () => {
  const legacy = shapePreferenceKey(token(7)),
    key = portraitPreferenceKey(token(7), {
      bot: "bot",
      interfaceStyle: "regular",
    });
  const storage = { getItem: (k) => (k === legacy ? "orbit" : null) };
  assert.equal(
    readPortraitPreference(storage, key, legacy, "neural").shape,
    "neural",
  );
  assert.deepEqual(
    readPortraitPreference(
      {
        getItem: () => {
          throw Error("blocked");
        },
      },
      key,
      legacy,
      "neural",
    ),
    { shape: "neural", previous: "neural" },
  );
  for (const raw of ["invalid", "{}", '{"shape":"none","previous":"none"}'])
    assert.equal(
      readPortraitPreference({ getItem: () => raw }, key, null).shape,
      "orbit",
    );
  assert.equal(
    readPortraitPreference(
      {
        getItem: (k) =>
          k === key ? '{"shape":"none","previous":"orbit"}' : null,
      },
      key,
      legacy,
      "neural",
    ).shape,
    "none",
  );
});
