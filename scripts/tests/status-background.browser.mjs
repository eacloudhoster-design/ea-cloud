import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5204";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out = "work/ios-status-background";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
async function fixture(context, style = "regular", shape = "orbit") {
  await context.addInitScript(
    ({ style, shape }) => {
      localStorage.setItem("appClientToken", btoa("7:client:fixture"));
      localStorage.setItem(
        "ea-cloud:client:7:home-appearance",
        JSON.stringify({
          interfaceStyle: style,
          showBg: true,
          backgroundAnimation: "none",
          accentColor: "#00bcd4",
        }),
      );
      localStorage.setItem("ea-cloud:client:7:robot-shape", shape);
    },
    { style, shape },
  );
  await context.routeWebSocket("**/api/ws?*", () => {});
  await context.route("https://fonts.**", (r) => r.abort());
  await context.route("**/fixture-robot.jpg", (r) =>
    r.fulfill({
      path: "artifacts/ea-cloud/public/default-robot.jpg",
      contentType: "image/jpeg",
    }),
  );
  await context.route("**/api/**", (r) => {
    const p = new URL(r.request().url()).pathname;
    return r.fulfill({
      json: p.endsWith("/me")
        ? { status: "approved", licenseKey: "fixture" }
        : p.endsWith("/dashboard")
          ? {
              mentor: {
                robotName: "SMC BLUEPRINT EA V3+",
                backgroundImageUrl: "/fixture-robot.jpg",
              },
              eas: [],
            }
          : p.endsWith("/trading-controls")
            ? { copyingEnabled: false }
            : p.endsWith("/activity")
              ? { events: [] }
              : p.endsWith("/activity/snapshot")
                ? {
                    observedAt: Date.now(),
                    connected: false,
                    engine: false,
                    robotEnabled: false,
                    tradeAllowed: false,
                    account: null,
                    symbols: [],
                  }
                : p.endsWith("/scanner/history")
                  ? { records: [], hasMore: false }
                  : [],
    });
  });
}
try {
 for (const style of ["regular","matrix","s2tone"]) {
  const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
  await fixture(context,style);const page=await context.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
  const cdp=await context.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride",{insets:{top:59,bottom:34,left:0,right:0}});
  await page.goto(origin+"/ea-app/");await page.locator(".ea-startup").waitFor({state:"detached"});
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(600);
  assert.match(await page.locator('meta[name="viewport"]').getAttribute("content"),/viewport-fit=cover/);
  assert.equal(await page.locator('meta[name="apple-mobile-web-app-status-bar-style"]').getAttribute("content"),"black-translucent");
  const manifestURL=await page.locator('link[rel="manifest"]').getAttribute("href");
  assert.equal(manifestURL,"/ea-app/manifest.webmanifest");
  const manifest=await page.evaluate(async url=>{
    const response=await fetch(url);if(!response.ok)throw new Error("Manifest unavailable");
    return response.json();
  },manifestURL);
  assert.equal(manifest.display,"standalone");
  for (const key of ["id","start_url","scope"]) assert.equal(manifest[key],"./");
  const foreground=()=>page.locator(".ea-app-content").evaluate(el=>[el,...el.querySelectorAll('[data-home-interface], [data-home-interface] button, [data-home-interface] img, [data-bot-name], .trading-activity-trigger, .ea-glass-navigation, .ea-glass-navigation button')].map(node=>{
   const r=node.getBoundingClientRect();return {tag:node.tagName,aria:node.getAttribute("aria-label"),x:r.x,y:r.y,w:r.width,h:r.height};
  }));
  for (const screen of [{width:393,height:852,top:59},{width:390,height:844,top:47},{width:355,height:768,top:44},{width:390,height:700,top:0}]) {
   await page.setViewportSize({width:screen.width,height:screen.height});
   await cdp.send("Emulation.setSafeAreaInsetsOverride",{insets:{top:screen.top,bottom:34,left:0,right:0}});
   await page.waitForTimeout(400);
   const background=await page.locator('[data-home-background]').evaluate(el=>{
    const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {x:r.x,y:r.y,w:r.width,h:r.height,fit:s.objectFit,position:s.objectPosition,loaded:el.complete&&el.naturalWidth>0,opacity:s.opacity};
   });
   assert.equal(background.x,0);assert.equal(background.y,0);assert.equal(background.w,screen.width);assert.equal(background.h,screen.height);
   assert.equal(background.fit,"cover");assert.equal(background.position,"50% 50%");assert.ok(background.loaded);assert.equal(background.opacity,"1");
   assert.equal(await page.locator(".ea-app-content").evaluate(el=>el.getBoundingClientRect().top),screen.top);
   const before=await foreground();
   // Temporarily mask only the background in this browser fixture; every
   // foreground rectangle must remain identical with/without that image layer.
   await page.locator('[data-home-background]').evaluate(el=>el.style.visibility="hidden");
   assert.deepEqual(await foreground(),before);
   await page.locator('[data-home-background]').evaluate(el=>el.style.removeProperty("visibility"));
   if(screen.width===393)await page.screenshot({path:`${out}/${style}-top59.png`});
   results.push({style,screen,background,foreground:before});
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));
 console.log(`PASS ${results.length} background/safe-area/layout cases; all foreground rectangles unchanged`);
} finally {await browser.close();}
