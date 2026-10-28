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
  adjacentControlPanel,
  horizontalSwipe,
  readHomePreferences,
  saveHomePreferences,
  homePreferenceKey,
} = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

test("both swipe directions cycle Regular, Matrix, S2tone and Lumo using the same interface identifiers", () => {
  for (const [from, next, previous] of [
    ["regular", "matrix", "lumo"],
    ["matrix", "s2tone", "regular"],
    ["s2tone", "lumo", "matrix"],
    ["lumo", "regular", "s2tone"],
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
    controlPanel: "default",
    interfaceStyle: "matrix",
    showBg: true,
    backgroundAnimation: "none",
    accentColor: "#ef4444",
  });
  for (const interfaceStyle of ["regular", "matrix", "lumo"])
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
            controlPanel: "default",
            interfaceStyle,
            showBg,
            backgroundAnimation,
            accentColor: "#ef4444",
          }),
          true,
        );
        assert.deepEqual(readHomePreferences(storage, key), {
          controlPanel: "default",
          interfaceStyle,
          showBg,
          backgroundAnimation,
          accentColor: "#ef4444",
        });
      }
  assert.deepEqual(readHomePreferences(storage, other), {
    controlPanel: "default",
    interfaceStyle: "matrix",
    showBg: true,
    backgroundAnimation: "none",
    accentColor: "#ef4444",
  });
  data.set(key, "broken JSON");
  assert.deepEqual(readHomePreferences(storage, key), {
    controlPanel: "default",
    interfaceStyle: "matrix",
    showBg: true,
    backgroundAnimation: "none",
    accentColor: "#ef4444",
  });
  data.set(key, JSON.stringify({ interfaceStyle: "bogus", showBg: "false" }));
  assert.deepEqual(readHomePreferences(storage, key), {
    controlPanel: "default",
    interfaceStyle: "matrix",
    showBg: true,
    backgroundAnimation: "none",
    accentColor: "#ef4444",
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
    controlPanel: "default",
    interfaceStyle: "matrix",
    showBg: true,
    backgroundAnimation: "none",
    accentColor: "#ef4444",
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
    controlPanel: "default",
    interfaceStyle: "s2tone",
    showBg: false,
    backgroundAnimation: "none",
    accentColor: "#ef4444",
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

test("theme colours persist in existing appearance settings without resetting other choices", () => {
  const values = new Map();
  const storage = {
    getItem: (k) => values.get(k),
    setItem: (k, v) => values.set(k, v),
  };
  const key = homePreferenceKey(btoa("7:client:test"));
  for (const accentColor of [
    "#ef4444",
    "#3b82f6",
    "#22c55e",
    "#a855f7",
    "#f97316",
    "#ec4899",
    "#06b6d4",
  ]) {
    const value = {
      controlPanel: "default",
      interfaceStyle: "matrix",
      showBg: false,
      backgroundAnimation: "particles",
      accentColor,
    };
    assert(saveHomePreferences(storage, key, value));
    assert.deepEqual(readHomePreferences(storage, key), value);
  }
  for (const accentColor of [
    "red",
    "#fff",
    "bad",
    null,
    "#000000;background:red",
  ]) {
    values.set(
      key,
      JSON.stringify({
        interfaceStyle: "regular",
        showBg: false,
        backgroundAnimation: "glow",
        accentColor,
      }),
    );
    assert.deepEqual(readHomePreferences(storage, key), {
      controlPanel: "default",
      interfaceStyle: "regular",
      showBg: false,
      backgroundAnimation: "glow",
      accentColor: "#ef4444",
    });
    assert.equal(
      saveHomePreferences(storage, key, {
        controlPanel: "default",
        interfaceStyle: "matrix",
        showBg: true,
        backgroundAnimation: "none",
        accentColor,
      }),
      false,
    );
  }
});

test("Lumo uses existing account-scoped persistence without changing legacy defaults", () => {
  const data = new Map(),
    storage = {
      getItem: (k) => data.get(k) || null,
      setItem: (k, v) => data.set(k, v),
    };
  const key = homePreferenceKey(btoa("7:client:fixture"));
  const value = {
    controlPanel: "default",
    interfaceStyle: "lumo",
    accentColor: "#a855f7",
    showBg: true,
    backgroundAnimation: "none",
  };
  assert.ok(saveHomePreferences(storage, key, value));
  assert.deepEqual(readHomePreferences(storage, key), value);
  assert.equal(
    readHomePreferences(storage, homePreferenceKey(btoa("8:client:fixture")))
      .interfaceStyle,
    "matrix",
  );
});

test("control panels default safely, persist per account, preserve other preferences and cycle both directions", () => {
  const key = homePreferenceKey(btoa("7:client:session"));
  const data = new Map();
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
  };
  const original = {
    interfaceStyle: "lumo",
    accentColor: "#3b82f6",
    showBg: false,
    backgroundAnimation: "glow",
  };
  data.set(key, JSON.stringify(original));
  assert.equal(readHomePreferences(storage, key).controlPanel, "default");
  for (const [panel, next, previous] of [
    ["default", "regular", "matrix"],
    ["regular", "matrix", "default"],
    ["matrix", "default", "regular"],
  ]) {
    assert.equal(adjacentControlPanel(panel, "next"), next);
    assert.equal(adjacentControlPanel(panel, "previous"), previous);
    assert.equal(
      saveHomePreferences(storage, key, { ...original, controlPanel: panel }),
      true,
    );
    assert.deepEqual(readHomePreferences(storage, key), {
      ...original,
      controlPanel: panel,
    });
  }
  data.set(key, JSON.stringify({ ...original, controlPanel: "bogus" }));
  assert.deepEqual(readHomePreferences(storage, key), {
    ...original,
    controlPanel: "default",
  });
  assert.equal(
    readHomePreferences(storage, homePreferenceKey(btoa("8:client:session")))
      .controlPanel,
    "default",
  );
});
