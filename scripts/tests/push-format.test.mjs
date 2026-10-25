import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "../../artifacts/api-server/node_modules/esbuild/lib/main.js";
const b = await build({
  entryPoints: ["artifacts/api-server/src/lib/push-notification.ts"],
  bundle: true,
  format: "esm",
  write: false,
});
const {
  robotNotification,
  executionNotification,
  symbolConfiguredNotification,
} = await import(
  "data:text/javascript;base64," +
    Buffer.from(b.outputFiles[0].text).toString("base64")
);
const row = {
  id: 11,
  signalId: 17,
  status: "success",
  signalKind: "OPEN",
  symbol: "XAUUSD",
  action: "BUY",
  ticket: "123",
  retcode: 10009,
  vpsResponse: '{"price":"2750.50"}',
};
test("robot notifications use requested exact wording", () => {
  assert.equal(
    robotNotification("started").body,
    "Robot started successfully.",
  );
  assert.equal(
    robotNotification("stopped").body,
    "Robot stopped successfully.",
  );
});
test("confirmed BUY/SELL receipts use real fill prices and route to MetaTrader", () => {
  const buy = executionNotification(row);
  assert.equal(buy.content.body, "XAUUSD BUY executed at 2750.50.");
  assert.equal(buy.content.title, "EA Cloud — Trade Executed");
  assert.match(buy.content.url, /tab=metatrader/);
  assert.equal(
    executionNotification({
      ...row,
      action: "SELL",
      vpsResponse: '{"price":2745.2}',
    }).content.body,
    "XAUUSD SELL executed at 2745.20.",
  );
});
test("pending signal, order acceptance, missing price/ticket and malformed receipt never become executions", () => {
  assert.equal(
    executionNotification({ ...row, status: "pending" }).kind,
    "trade_alert",
  );
  for (const patch of [
    { retcode: 10008 },
    { ticket: null },
    { vpsResponse: null },
    { vpsResponse: '{"entry":2750}' },
    { vpsResponse: '{"price":null}' },
    { vpsResponse: '{"price":0}' },
    { vpsResponse: "bad" },
    { signalKind: "MODIFY" },
  ])
    assert.equal(executionNotification({ ...row, ...patch }), null);
});
test("terminal failures use actual codes/reasons, never raw credentials or invented explanations", () => {
  const failed = { ...row, status: "failed", retryable: 0, retcode: 10019 };
  assert.equal(
    executionNotification(failed).content.body,
    "XAUUSD BUY failed. Insufficient margin.",
  );
  assert.equal(
    executionNotification({
      ...failed,
      retcode: null,
      status: "skipped",
      errorMessage: "Bot disabled (copying paused)",
    }).content.body,
    "XAUUSD BUY failed. Robot is not active.",
  );
  const unknown = executionNotification({
    ...failed,
    retcode: 0,
    errorMessage: "password=PRIVATE https://private.example/api-key/SECRET",
  }).content.body;
  assert.equal(
    unknown,
    "XAUUSD BUY failed. See execution details in EA Cloud.",
  );
  assert.equal(executionNotification({ ...failed, retryable: 1 }), null);
});

test("symbol notification uses every persisted broker variation without guessing the pair", () => {
  for (const symbol of [
    "XAUUSD",
    "BTCUSD",
    "EURUSD",
    "GBPUSD",
    "XAUUSDm",
    "EURUSD.a",
    "US30.cash",
    "Volatility 75 Index",
  ]) {
    const content = symbolConfiguredNotification(symbol);
    assert.equal(content.title, "Symbol Configured");
    assert.equal(content.body, `${symbol} configured successfully.`);
  }
  for (const value of ["", "a".repeat(201), "XAUUSD\nPRIVATE"])
    assert.equal(symbolConfiguredNotification(value), null);
});
