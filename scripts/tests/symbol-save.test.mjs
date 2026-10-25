import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "../../artifacts/api-server/node_modules/esbuild/lib/main.js";
const b = await build({
  entryPoints: ["artifacts/ea-app/src/lib/symbol-save.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { confirmSymbolSave } = await import(
  "data:text/javascript;base64," +
    Buffer.from(b.outputFiles[0].text).toString("base64")
);
test("only confirmed saved values emit one event, with distinct identities for later saves", () => {
  const original = globalThis.window,
    events = [];
  globalThis.window = { dispatchEvent: (event) => events.push(event.detail) };
  try {
    const row = {
      pairName: "XAUUSD",
      selectedSymbol: "XAUUSDm",
      customLotSize: "0.05",
    };
    for (const bad of [
      null,
      {},
      [],
      [{ ...row, selectedSymbol: "XAUUSD" }],
      [{ ...row, customLotSize: "0.10" }],
    ])
      assert.equal(confirmSymbolSave(bad, [row], "failed"), false);
    assert.equal(events.length, 0);
    assert.equal(confirmSymbolSave([row], [row], "first"), true);
    assert.equal(confirmSymbolSave([row], [row], "first"), true);
    assert.deepEqual(events, [
      { type: "symbol-saved", symbol: "XAUUSDm", saveId: "first" },
    ]);
    assert.equal(confirmSymbolSave([row], [row], "second"), true);
    assert.equal(events.length, 2);
    const cleared = { ...row, selectedSymbol: null, customLotSize: null };
    assert.equal(confirmSymbolSave([cleared], [cleared], "cleared"), true);
    assert.equal(events.length, 2);
    globalThis.window.dispatchEvent = () => {
      throw Error("audio unavailable");
    };
    assert.equal(confirmSymbolSave([row], [row], "silent"), true);
  } finally {
    globalThis.window = original;
  }
});
