import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "../../artifacts/api-server/node_modules/esbuild/lib/main.js";

const built = await build({ entryPoints: ["artifacts/ea-app/src/hooks/use-ios-standalone-zoom.ts"], bundle: true, platform: "node", format: "esm", write: false });
const { installIosStandaloneZoomGuard, IOS_STANDALONE_VIEWPORT } = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));
const recordedMeta = "width=390, initial-scale=1.00038, minimum-scale=1.00038, maximum-scale=1.00038, user-scalable=no, viewport-fit=cover";

function fixture({ ios = true, standalone = true, width = 390 } = {}) {
  const originals = new Map();
  const define = (name, descriptor) => { originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { configurable: true, ...descriptor }); };
  const events = new EventTarget(), docEvents = new EventTarget(), media = new EventTarget();
  media.matches = standalone;
  const attributes = new Map();
  const root = { getAttribute: key => attributes.get(key) ?? null, setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) };
  const writes = [];
  const meta = { content: recordedMeta, getAttribute() { return this.content; }, setAttribute(key, value) { assert.equal(key, "content"); this.content = value; writes.push(value); } };
  const navigator = { userAgent: ios ? "iPhone" : "Android", platform: ios ? "iPhone" : "Linux", maxTouchPoints: 5, standalone };
  let geometryReads = 0;
  define("document", { value: Object.assign(docEvents, { documentElement: root, querySelector: () => meta }) });
  define("window", { value: events });
  define("navigator", { value: navigator });
  define("matchMedia", { value: () => media });
  // Record the actual report's contradictory width/scale without using it as
  // policy input. Other supported screen widths must yield the same policy.
  define("screen", { get() { geometryReads++; return { width }; } });
  define("innerWidth", { get() { geometryReads++; return 459; } });
  define("visualViewport", { get() { geometryReads++; return { width: 459, scale: .85 }; } });
  return { events, docEvents, media, navigator, meta, root, writes, geometryReads: () => geometryReads,
    restore() { for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } } };
}

test("recorded 459px/.85 state never generates a fixed width or fractional lock on any iPhone size", () => {
  for (const width of [320, 375, 390, 393, 414, 428, 430, 440]) {
    const f = fixture({ width });
    let cleanup;
    try {
      cleanup = installIosStandaloneZoomGuard();
      assert.equal(f.meta.content, IOS_STANDALONE_VIEWPORT);
      assert.match(f.meta.content, /^width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1,/);
      assert.doesNotMatch(f.meta.content, /width=\d|1\.00038/);
      assert.equal(f.geometryReads(), 0, "Zoomed geometry must not feed back into viewport policy");
      const count = f.writes.length;
      for (const type of ["resize", "orientationchange", "pageshow", "resize"]) f.events.dispatchEvent(new Event(type));
      assert.equal(f.writes.length, count, "No keyboard/rotation write feedback");
      f.meta.content = recordedMeta;
      f.events.dispatchEvent(new Event("pageshow"));
      assert.equal(f.meta.content, IOS_STANDALONE_VIEWPORT, "BFCache restores canonical device policy");
      for (const type of ["gesturestart", "gesturechange", "touchmove", "pointermove"]) {
        const event = new Event(type, { cancelable: true });
        f.docEvents.dispatchEvent(event);
        assert.equal(event.defaultPrevented, type.startsWith("gesture"));
      }
    } finally { cleanup?.(); f.restore(); }
  }
});

test("Safari tabs and non-iOS installed apps keep their original viewport and gestures", () => {
  for (const device of [{ ios: true, standalone: false }, { ios: false, standalone: true }]) {
    const f = fixture(device);
    let cleanup;
    try {
      cleanup = installIosStandaloneZoomGuard();
      assert.equal(f.meta.content, recordedMeta);
      assert.equal(f.writes.length, 0);
      const event = new Event("gesturestart", { cancelable: true });
      f.docEvents.dispatchEvent(event);
      assert.equal(event.defaultPrevented, false);
    } finally { cleanup?.(); f.restore(); }
  }
});
