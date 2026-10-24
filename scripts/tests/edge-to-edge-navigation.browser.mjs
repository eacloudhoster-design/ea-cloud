import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5204";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out = "work/compact-navigation";
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
const cases = [
 {width:355,height:768,bottom:18,scale:2}, {width:320,height:568,bottom:0}, {width:390,height:844,bottom:0},
 {width:393,height:852,bottom:34}, {width:430,height:932,bottom:34},
 {width:844,height:390,bottom:21,left:44,right:44}
];
try {
 for (const screen of (process.env.NAV_INTERACTIONS_ONLY ? [] : cases)) for (const style of ["regular","matrix","s2tone"]) {
  const context = await browser.newContext({viewport:{width:screen.width,height:screen.height},deviceScaleFactor:screen.scale||1,isMobile:true,hasTouch:true});
  await fixture(context,style);
  const page = await context.newPage(); const errors=[]; page.on("pageerror",e=>errors.push(e.message));
  const cdp=await context.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride",{insets:{top:0,bottom:screen.bottom,left:screen.left||0,right:screen.right||0}});
  await page.goto(origin+"/ea-app/");
  await page.locator(".ea-startup").waitFor({state:"detached"});
  const nav=page.locator(".ea-app-content > .ea-glass-navigation");
  const geometry=()=>nav.locator(".ea-glass-bar").evaluate(el=>{
   const r=el.getBoundingClientRect(),s=getComputedStyle(el);
   return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:innerHeight-r.bottom,radius:s.borderRadius,blur:getComputedStyle(el.parentElement).backdropFilter};
  });
  const dock=await nav.evaluate(el=>{
   const r=el.getBoundingClientRect(),app=el.closest(".ea-app-viewport").getBoundingClientRect();
   return {left:r.left-app.left,right:app.right-r.right,bottom:innerHeight-r.bottom,radius:getComputedStyle(el).borderRadius};
  });
  assert.equal(dock.left,0);assert.equal(dock.right,0);assert.equal(dock.bottom,0);
  assert.equal(dock.radius,"22px 22px 0px 0px");
  const initial=await geometry(); assert.equal(initial.radius,"0px");
  assert.ok(Math.abs(initial.bottom-screen.bottom)<1);
  assert.ok(initial.blur.includes("12px"));
  assert.equal(initial.h,60);
  const sizes=await nav.evaluate(el=>({
    dock:el.getBoundingClientRect().height,
    buttons:[...el.querySelectorAll("button")].map(b=>b.getBoundingClientRect().height),
    indicator:el.querySelector(".ea-glass-indicator").getBoundingClientRect().height,
  }));
  assert.equal(sizes.dock,60+screen.bottom);
  assert.ok(sizes.dock<66+screen.bottom);
  assert.ok(sizes.buttons.every(h=>h===54),"existing button target size retained");
  assert.equal(sizes.indicator,54,"existing oval height retained");
  assert.ok(initial.w>=Math.min(screen.width,430)-2*Math.max(4,screen.left||0)-1);
  for(const name of ["MetaTrader","Settings","Home"]) {
   await nav.getByRole("button",{name,exact:true}).tap();
   await page.waitForTimeout(500);
   assert.equal(await nav.getByRole("button",{name,exact:true}).getAttribute("aria-current"),"page");
   assert.deepEqual(await geometry(),initial);
   const rects=await nav.locator(".ea-glass-indicator").evaluate(el=>{
    const a=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect();
    return {left:a.left-b.left,right:b.right-a.right,radius:getComputedStyle(el).borderRadius};
   });
   assert.equal(rects.radius,"999px");assert.ok(rects.left>=0&&rects.right>=-1);
   if(name==="MetaTrader")assert.equal(await page.locator(".mt5-view").evaluate(el=>getComputedStyle(el).opacity),"1");
   if(screen.width===393 || screen.width===355)await page.screenshot({path:`${out}/${screen.width}-${style}-${name}.png`});
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]); results.push({screen,style,geometry:initial}); await context.close();
 }
 const context=await browser.newContext({viewport:{width:393,height:852},hasTouch:true,isMobile:true});
 await fixture(context);const page=await context.newPage();await page.goto(origin+"/ea-app/");
 await page.locator(".ea-startup").waitFor({state:"detached"});
 const nav=page.locator(".ea-app-content > .ea-glass-navigation");
 await nav.getByRole("button",{name:"MetaTrader",exact:true}).tap();await page.waitForTimeout(300);
 const field=page.locator(".mt5-input-wrap input").first();await field.fill("12345678");
 await nav.getByRole("button",{name:"Home",exact:true}).tap();await page.waitForTimeout(300);
 assert.equal(await page.locator(".mt5-view").getAttribute("hidden"),"");
 await nav.getByRole("button",{name:"MetaTrader",exact:true}).tap();await page.waitForTimeout(300);
 assert.equal(await field.inputValue(),"12345678");
 const start=await nav.getByRole("button",{name:"MetaTrader",exact:true}).boundingBox();
 const end=await nav.getByRole("button",{name:"Settings",exact:true}).boundingBox();
 await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();
 await page.mouse.move(end.x+end.width/2,end.y+end.height/2,{steps:12});await page.mouse.up();await page.waitForTimeout(600);
 assert.equal(await nav.getByRole("button",{name:"Settings",exact:true}).getAttribute("aria-current"),"page");
 await page.emulateMedia({reducedMotion:"reduce"});
 await nav.getByRole("button",{name:"Home",exact:true}).tap();
 assert.equal(await page.locator(".ea-nav-screen").first().evaluate(el=>getComputedStyle(el).transitionDuration),"0s");
 await context.close();console.log("PASS retained MT5 form, drag selection, reduced motion");
 if (!process.env.NAV_INTERACTIONS_ONLY) {
 await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));
 }
 console.log(`PASS ${results.length} viewport/layout combinations; three destinations each`);
} finally {await browser.close();}
