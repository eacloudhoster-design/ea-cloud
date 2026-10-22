import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "../../artifacts/api-server/node_modules/esbuild/lib/main.js";
const bundle = await build({
  entryPoints: ["artifacts/ea-app/src/lib/home-preferences.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const {
  adjacentInterface,
  horizontalSwipe,
  readHomePreferences,
  saveHomePreferences,
  homePreferenceKey,
} = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

test("both swipe directions cycle Regular, Matrix and S2tone using the same interface identifiers", () => {
  for (const [from, next, previous] of [
    ["regular", "matrix", "s2tone"],
    ["matrix", "s2tone", "regular"],
    ["s2tone", "regular", "matrix"],
  ]) {
    assert.equal(adjacentInterface(from, "next"), next);
    assert.equal(adjacentInterface(from, "previous"), previous);
    assert.equal(
      adjacentInterface(adjacentInterface(from, "next"), "previous"),
      from,
    );
  }
});
test("only deliberate horizontal gestures pass the distance, direction and duration checks", () => {
  assert.equal(horizontalSwipe(-60, 0, 200), "next");
  assert.equal(horizontalSwipe(60, 0, 200), "previous");
  for (const args of [
    [59, 0, 100],
    [-59, 0, 100],
    [80, 60, 200],
    [30, 120, 200],
    [200, 0, 1201],
    [NaN, 0, 200],
    [80, 0, NaN],
    [80, 0, -1],
  ])
    assert.equal(horizontalSwipe(...args), null);
});
test("interface and background preferences survive storage, default safely and stay account scoped", () => {
  const data = new Map(),
    storage = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => data.set(k, v),
    };
  const key = homePreferenceKey(btoa("7:client:session")),
    other = homePreferenceKey(btoa("8:client:session"));
  assert.notEqual(key, other);
  assert.equal(homePreferenceKey("invalid"), null);
  assert.equal(homePreferenceKey(btoa("7:superadmin:session")), null);
  assert.deepEqual(readHomePreferences(storage, key), {
    interfaceStyle: "matrix",
    showBg: true,
    backgroundAnimation: "none",
  });
  for (const interfaceStyle of ["regular", "matrix", "s2tone"])
    for (const showBg of [true, false])
      for (const backgroundAnimation of [
        "none",
        "pulse",
        "glow",
        "matrix",
        "particles",
      ]) {
        assert.equal(
          saveHomePreferences(storage, key, {
            interfaceStyle,
            showBg,
            backgroundAnimation,
          }),
          true,
        );
        assert.deepEqual(readHomePreferences(storage, key), {
          interfaceStyle,
          showBg,
          backgroundAnimation,
        });
      }
  assert.deepEqual(readHomePreferences(storage, other), {
    interfaceStyle: "matrix",
    showBg: true,
    backgroundAnimation: "none",
  });
  data.set(key, "broken JSON");
  assert.deepEqual(readHomePreferences(storage, key), {
    interfaceStyle: "matrix",
    showBg: true,
    backgroundAnimation: "none",
  });
  data.set(key, JSON.stringify({ interfaceStyle: "bogus", showBg: "false" }));
  assert.deepEqual(readHomePreferences(storage, key), {
    interfaceStyle: "matrix",
    showBg: true,
    backgroundAnimation: "none",
  });
  assert.equal(
    saveHomePreferences(storage, key, {
      interfaceStyle: "bogus",
      showBg: false,
    }),
    false,
  );
  const blocked = {
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("blocked");
    },
  };
  assert.deepEqual(readHomePreferences(blocked, key), {
    interfaceStyle: "matrix",
    showBg: true,
    backgroundAnimation: "none",
  });
  assert.equal(
    saveHomePreferences(blocked, key, {
      interfaceStyle: "regular",
      showBg: false,
    }),
    false,
  );
});

test("legacy home settings retain their values and default to no extra animation", () => {
  const storage = {
    getItem: () =>
      JSON.stringify({
        interfaceStyle: "s2tone",
        showBg: false,
        backgroundAnimation: "invalid",
      }),
  };
  assert.deepEqual(readHomePreferences(storage, "client"), {
    interfaceStyle: "s2tone",
    showBg: false,
    backgroundAnimation: "none",
  });
  assert.equal(
    saveHomePreferences(
      {
        setItem() {
          throw Error("must not write");
        },
      },
      "client",
      {
        interfaceStyle: "regular",
        showBg: true,
        backgroundAnimation: "invalid",
      },
    ),
    false,
  );
});
