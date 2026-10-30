import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { build } from "../../artifacts/api-server/node_modules/esbuild/lib/main.js";
import { PNG } from "../../artifacts/api-server/node_modules/pngjs/lib/png.js";
import jpeg from "../../artifacts/api-server/node_modules/jpeg-js/index.js";
import bmp from "../../artifacts/api-server/node_modules/bmp-js/index.js";
import {
  unzipSync,
  strFromU8,
} from "../../artifacts/api-server/node_modules/fflate/esm/index.mjs";
import { createRequire } from "node:module";
const bundle = await build({
  stdin: {
    contents:
      "export * from './artifacts/api-server/src/lib/ea-builder/trading-package';export * from './artifacts/api-server/src/lib/ea-builder/image';export * from './artifacts/api-server/src/lib/ea-builder/package';export * from './artifacts/api-server/src/lib/ea-builder/contracts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  loader: { ".mq5": "text" },
  format: "cjs",
  write: false,
});
const module = { exports: {} };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(
  createRequire(import.meta.url),
  module,
  module.exports,
);
const {
  tradingPackage,
  intelligenceTemplate,
  chartBitmap,
  toolkitPackage,
  safeFilename,
  robotEvent,
  buildInput,
} = module.exports;
const image = new PNG({ width: 3, height: 2 });
for (let i = 0; i < image.data.length; i += 4) {
  image.data[i] = 255;
  image.data[i + 3] = 255;
}
const png = PNG.sync.write(image);
const opts = {
  id: "01234567-1234-4234-8234-012345678901",
  token: "eacr_" + "a".repeat(64),
  origin: "https://eacloudhoster.online",
  name: "GOLD HUNTER PRO",
  manager: "Test Manager",
};
test("PNG/JPEG/BMP conversion creates correctly padded opaque 24-bit BMP files", () => {
  for (const input of [
    png,
    jpeg.encode({ width: 3, height: 2, data: image.data }, 90).data,
    chartBitmap(png),
  ]) {
    const out = chartBitmap(input);
    assert.equal(out.toString("ascii", 0, 2), "BM");
    assert.equal(out.readUInt16LE(28), 24);
    assert.equal(out.readUInt32LE(30), 0);
    assert.equal(out.readUInt32LE(2), out.length);
    const decoded = bmp.decode(out);
    assert.equal(decoded.width, 3);
    assert.equal(decoded.height, 2);
    assert(decoded.data.some((v) => v > 200));
  }
});
test("malformed, spoofed, truncated, oversized and excessive-dimension images are rejected", () => {
  for (const bytes of [
    Buffer.from("<svg>not an image</svg>"),
    Buffer.alloc(11 * 1024 * 1024),
    png.subarray(0, 20),
    Buffer.from("GIF89a" + "x".repeat(30)),
  ])
    assert.throws(() => chartBitmap(bytes));
  const bomb = Buffer.from(png);
  bomb.writeUInt32BE(99999, 16);
  assert.throws(() => chartBitmap(bomb), /dimensions/);
  const bad = chartBitmap(png);
  bad.writeUInt32LE(1, 30);
  assert.throws(() => chartBitmap(bad), /uncompressed/);
});
test("filenames and source strings preserve display names without path or literal injection", () => {
  assert.equal(safeFilename("GOLD HUNTER PRO"), "GOLD_HUNTER_PRO");
  for (const name of ["../../evil", "CON", "../\\nul", "😎", "a".repeat(200)]) {
    const result = safeFilename(name);
    assert.match(result, /^[A-Za-z0-9_-]{1,67}$/);
    assert(!result.includes(".."));
  }
  assert(
    !buildInput.safeParse({
      eaId: 1,
      name: "a\n#property",
      managerName: "Owner",
      purpose: "integration-toolkit",
    }).success,
  );
});
test("toolkit ZIP has exact installable resource paths, truthful guide and no invented strategy", () => {
  const files = unzipSync(
    toolkitPackage({ ...opts, bitmap: chartBitmap(png) }).bytes,
  );
  const keys = Object.keys(files);
  assert(keys.some((k) => k.endsWith("/GOLD_HUNTER_PRO_Observer.mq5")));
  assert(
    keys.some((k) =>
      k.endsWith("/Images/EACloud/" + opts.id + "/MT5_Background.bmp"),
    ),
  );
  const include = strFromU8(
    files[keys.find((k) => k.endsWith("/EACloudBroadcast.mqh"))],
  );
  assert(include.includes(opts.name));
  assert(include.includes(opts.manager));
  assert(include.includes(opts.token));
  assert(!/OrderSend\s*\(|CTrade|g_fireOnLoad\s*=\s*true/.test(include));
  const transaction = include.slice(
    include.indexOf("void EAC_Transaction"),
    include.indexOf("void EAC_Timer"),
  );
  assert(!transaction.includes("WebRequest("));
  assert(include.includes("TRADE_TRANSACTION_DEAL_ADD"));
  assert(include.includes("DEAL_ENTRY_INOUT"));
  assert(include.includes("DEAL_ENTRY_OUT_BY"));
  assert(include.includes("TRADE_TRANSACTION_POSITION"));
  assert(
    include.includes("ArraySize(EAC_queue)>=256") || include.includes("n>=256"),
  );
  const guide = strFromU8(
    files[keys.find((k) => k.endsWith("/INSTALLATION_GUIDE.txt"))],
  );
  assert(guide.includes("NOT A TRADING EA"));
  assert(guide.includes("F7"));
  assert(guide.includes("Compilation has NOT been verified"));
  assert(guide.includes("MQL5/Images/EACloud/" + opts.id));
  const bg = strFromU8(
    files[keys.find((k) => k.endsWith("/EACloudBackground.mqh"))],
  );
  assert(bg.includes("#resource"));
  assert(bg.includes("ResourceCreate"));
  assert(bg.includes("OBJPROP_BACK,true"));
  const noImage = Object.keys(unzipSync(toolkitPackage(opts).bytes));
  assert(
    !noImage.some((k) => k.endsWith(".bmp") || k.endsWith("Background.mqh")),
  );
});
test("confirmed-event contract rejects forged mentor/execution flags, invalid numbers and false deal reports", () => {
  const event = {
    eventId: "1:D:100",
    sourceAccount: "12345",
    sourceServer: "Demo",
    accountMode: "HEDGING",
    kind: "DEAL",
    entry: "IN",
    dealId: "100",
    orderId: "99",
    positionId: "50",
    symbol: "XAUUSD",
    side: "BUY",
    volume: 0.01,
    price: 2000,
    stopLoss: 1990,
    takeProfit: 2020,
    timestampMs: Date.now(),
  };
  assert(robotEvent.safeParse(event).success);
  for (const patch of [
    { mentorId: 2 },
    { execute: true },
    { price: NaN },
    { dealId: "0" },
    { volume: 0 },
    { entry: "FAILED" },
  ])
    assert(!robotEvent.safeParse({ ...event, ...patch }).success);
});
test("existing EX5 observer reconciles account history from a separate chart and preserves original strategy", () => {
  const archive = toolkitPackage({
    ...opts,
    existingObserver: true,
    sourceMagic: "12345",
  });
  const files = unzipSync(archive.bytes),
    read = (suffix) =>
      strFromU8(files[Object.keys(files).find((p) => p.endsWith(suffix))]);
  const mq = read("_Observer.mq5"),
    reconcile = read("EACloudReconcile.mqh"),
    broadcast = read("EACloudBroadcast.mqh");
  assert(mq.includes("EAC_Reconcile();EAC_Timer();"));
  assert(!mq.includes("EAC_Transaction(trans);"));
  assert(reconcile.includes("HistorySelectByPosition"));
  assert(reconcile.includes("HistorySelect("));
  assert(reconcile.includes("PositionsTotal()"));
  assert(reconcile.includes("GlobalVariablesFlush()"));
  assert(reconcile.includes("EAC_SaveState()"));
  assert(broadcast.includes("EAC_Heartbeat()"));
  assert(
    !broadcast.includes('&&StringFind(answer,"\\\"execution\\\":false")>=0'),
  );
  assert(!/OrderSend|CTrade|PositionClose/.test(mq + reconcile + broadcast));
  assert(
    read("INSTALLATION_GUIDE.txt").includes(
      "Chart 1: retain the original compiled EX5",
    ),
  );
  assert.equal(
    buildInput.safeParse({
      eaId: 1,
      name: "EA",
      managerName: "Mentor",
      purpose: "existing-observer",
      sourceMagic: "9999999999999999999",
    }).success,
    false,
  );
});

function functionBody(source, name) {
  const begin = source.search(
    new RegExp("(?:void|bool|int|double)\\s+" + name + "\\s*\\("),
  );
  assert(begin >= 0, name);
  const open = source.indexOf("{", begin);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(open, i + 1);
  }
  throw Error("Unbalanced function " + name);
}
test("complete Intelligence strategy is preserved with local-only integrated broadcasting and exact resources", () => {
  assert.equal(
    createHash("sha256")
      .update(intelligenceTemplate.replace(/\r\n/g, "\n"))
      .digest("hex"),
    "3c0ceb54954ae5f243271b14154811d791ad9942269d0e961e3093a851279e61",
    "complete user-supplied template must remain unchanged",
  );
  assert.equal(
    intelligenceTemplate.replace(/\r\n/g, "\n").split("\n").length,
    934,
  );
  for (const bitmap of [undefined, chartBitmap(png)]) {
    const archive = tradingPackage({ ...opts, bitmap }),
      files = unzipSync(archive.bytes),
      read = (suffix) =>
        strFromU8(files[Object.keys(files).find((k) => k.endsWith(suffix))]);
    const main = read("/GOLD_HUNTER_PRO.mq5"),
      relay = read("_Relay.mq5"),
      original = intelligenceTemplate.replace(/\r\n/g, "\n");
    for (const name of [
      "DetectQuasimodoSignal",
      "OpenBuy",
      "OpenSell",
      "CalculateStops",
      "ManageTrailingStop",
      "OnTick",
      "NormalizeLot",
      "SpreadOK",
      "CountOurPositions",
    ])
      assert.equal(
        functionBody(main, name),
        functionBody(original, name),
        name + " must be unchanged",
      );
    assert.equal(
      functionBody(main, "EAC_StrategyInit"),
      functionBody(original, "OnInit"),
    );
    assert.equal(
      functionBody(main, "EAC_StrategyDeinit"),
      functionBody(original, "OnDeinit"),
    );
    assert.deepEqual(
      main.match(/^input .+$/gm),
      original.match(/^input .+$/gm),
    );
    assert.deepEqual(
      main.match(/trade\.\w+\(/g),
      original.match(/trade\.\w+\(/g),
    );
    assert(main.includes('g_eaName     = "GOLD HUNTER PRO"'));
    assert(main.includes("EA Manager: Test Manager"));
    assert(!/WebRequest\s*\(/.test(main));
    assert(/WebRequest\s*\(/.test(relay));
    assert(relay.includes("#property service"));
    assert(!relay.includes("CTrade"));
    assert(main.includes("SourceMagic=MagicNumber;"));
    assert(main.includes("FILE_COMMON"));
    assert(relay.includes("/api/robots/events"));
    assert.equal(
      (read("INSTALLATION_GUIDE.txt").match(/^\d+\./gm) || []).length,
      10,
    );
    assert(!Object.keys(files).some((k) => k.includes("_Observer")));
    assert.equal(
      Object.keys(files).some((k) => k.endsWith(".bmp")),
      !!bitmap,
    );
    if (bitmap) {
      assert(main.includes('#resource "MT5_Background.bmp"'));
      assert(main.includes('"::MT5_Background.bmp"'));
      assert(!main.includes("Images\\\\EACloud"));
    }
  }
});

test("branding containing replacement syntax cannot corrupt lifecycle handlers or source literals", () => {
  const name = '$& int OnInit() "Quoted"',
    manager = "$` $' Manager";
  const files = unzipSync(tradingPackage({ ...opts, name, manager }).bytes);
  const main = strFromU8(
    files[
      Object.keys(files).find(
        (k) => k.endsWith(".mq5") && !k.endsWith("_Relay.mq5"),
      )
    ],
  );
  assert.equal(
    functionBody(main, "EAC_StrategyInit"),
    functionBody(intelligenceTemplate.replace(/\r\n/g, "\n"), "OnInit"),
  );
  assert(
    main.includes("g_comment    = " + module.exports.mqlString(name) + ";"),
  );
  assert(
    main.includes(module.exports.mqlString(name + " | EA Manager: " + manager)),
  );
});
