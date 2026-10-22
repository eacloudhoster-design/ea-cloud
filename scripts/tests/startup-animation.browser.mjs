// Run with both dev servers (5174 trading app, 5173 website) available.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.STARTUP_CAPTURE_DIR || 'work/startup-verification';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const results = [];
try {
 for (const scenario of (process.env.STARTUP_SCENARIOS?.split(',') || ['guest', 'cold-logo', 'slow-auth', 'auth-error', 'desktop', 'portal', 'portal-dashboard', 'reduced', 'asset-error'])) {
  console.log('Checking', scenario);
  const portal = scenario.startsWith('portal');
  const page = await browser.newPage({ viewport: { width: scenario === 'desktop' ? 1440 : 390, height: 844 }, reducedMotion: scenario === 'reduced' ? 'reduce' : 'no-preference' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://fonts.**', r => r.abort());
  if (['slow-auth', 'auth-error', 'portal-dashboard'].includes(scenario)) await page.addInitScript(() => {
   localStorage.setItem('appClientToken', 'startup-test'); localStorage.setItem('app_token', 'startup-test');
  });
  await page.route('**/api/**', async r => {
   const path = new URL(r.request().url()).pathname;
   if (path === '/api/app/me') {
    if (scenario === 'slow-auth') await new Promise(resolve => setTimeout(resolve, 3300));
    if (scenario === 'auth-error') return r.fulfill({ status: 503, json: {} });
    return r.fulfill({ json: { id: 1, status: 'approved', licenseKey: 'licensed' } });
   }
   if (path === '/api/app/dashboard') return r.fulfill({ json: { mentor: { robotName: 'Startup Test Mentor' }, eas: [] } });
   return r.fulfill({ json: { copyingEnabled: true, executions: [] } });
  });
  await page.route('**/*ea-cloud-logo*', async r => {
   if (r.request().resourceType() !== 'image') return r.continue();
   if (scenario === 'cold-logo') await new Promise(resolve => setTimeout(resolve, 2600));
   if (scenario === 'asset-error') return r.abort();
   await r.continue();
  });
  await page.addInitScript(() => {
   window.startupEvents = [];
   document.addEventListener('animationstart', e => { if (e.animationName === 'ea-launch') window.startupEvents.push({ type: 'start', time: performance.now() }); });
   document.addEventListener('animationend', e => { if (e.animationName === 'ea-launch') window.startupEvents.push({ type: 'end', time: performance.now(), elapsed: e.elapsedTime }); });
  });
  await page.goto(portal ? `http://127.0.0.1:5173/app${scenario === 'portal-dashboard' ? '/dashboard' : ''}` : 'http://127.0.0.1:5174/', { waitUntil: 'domcontentloaded' });
  if (scenario === 'asset-error') {
   await page.getByRole('button', { name: 'Retry startup' }).waitFor();
   assert.equal(await page.locator('.ea-startup').getAttribute('data-started'), 'false');
   results.push({ scenario, retryVisible: true }); await page.close(); continue;
  }
  if (scenario === 'cold-logo') {
   await page.waitForTimeout(2200);
   assert.equal(await page.locator('.ea-startup').getAttribute('data-started'), 'false');
   assert.equal(await page.evaluate(() => document.querySelector('.ea-startup').getAnimations()[0].currentTime), 0);
  }
  await page.waitForSelector('.ea-startup[data-started="true"]');
  const frames = [];
  for (const timestamp of [200, 600, 900, 1300, 1750]) {
   await page.waitForFunction(t => document.querySelector('.ea-startup')?.getAnimations()[0]?.currentTime >= t, timestamp);
   const frame = await page.evaluate(() => {
    const splash = document.querySelector('.ea-startup');
    const mark = splash.querySelector('.ea-startup-mark');
    const rect = mark.getBoundingClientRect();
    return { time: splash.getAnimations()[0].currentTime, duration: splash.getAnimations()[0].effect.getTiming().duration,
     imageWidth: mark.querySelector('img').naturalWidth, opacity: getComputedStyle(mark).opacity,
     edge: getComputedStyle(splash.querySelector('.ea-startup-edge')).strokeDashoffset,
     eyes: getComputedStyle(splash.querySelector('.ea-startup-eyes')).opacity,
     circuits: getComputedStyle(splash.querySelector('.ea-startup-circuits')).opacity,
     sweep: getComputedStyle(splash.querySelector('.ea-startup-sweep')).transform,
     x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: rect.width,
     viewportWidth: innerWidth, viewportHeight: innerHeight };
   });
   assert.equal(frame.duration, 2000); assert.equal(frame.imageWidth, 1254);
   assert(Math.abs(frame.x - frame.viewportWidth / 2) < 1); assert(Math.abs(frame.y - frame.viewportHeight / 2) < 1);
   assert(Number(frame.opacity) > 0); assert(frame.width <= 530);
   await page.screenshot({ path: `${output}/${scenario}-${timestamp}.png` }); frames.push(frame);
  }
  assert(Number(frames[1].eyes) > 0);
  if (scenario !== 'reduced') { assert(await page.evaluate(() => document.querySelector('.ea-startup-mark').getAnimations()[0].effect.getKeyframes().some(k => k.transform.includes('scale(0.08)')))); assert.notEqual(frames[2].edge, frames[4].edge); assert.notEqual(frames[2].sweep, frames[3].sweep); assert(Number(frames[3].circuits) > 0); }
  await page.waitForFunction(() => window.startupEvents.some(e => e.type === 'end'));
  assert.equal(await page.evaluate(() => window.startupEvents.find(e => e.type === 'end').elapsed), 2);
  if (scenario === 'slow-auth') {
   assert.equal(await page.locator('.ea-startup').count(), 1);
   assert.equal(await page.locator('.ea-startup').getAttribute('data-elapsed'), 'true');
  }
  await page.waitForSelector('.ea-startup', { state: 'detached' });
  if (scenario === 'auth-error') await page.getByRole('button', { name: 'Retry', exact: true }).waitFor();
  if (scenario === 'slow-auth') {
   await page.getByRole('button', { name: 'MetaTrader', exact: true }).click();
   assert.equal(await page.evaluate(() => localStorage.getItem('appClientToken')), 'startup-test');
   assert.equal(await page.locator('.ea-startup').count(), 0);
  }
  if (scenario === 'portal-dashboard') await page.getByText('Startup Test Mentor', { exact: true }).first().waitFor();
  if (scenario === 'portal') {
   await page.getByRole('button', { name: 'SIGN IN', exact: true }).waitFor();
  }
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${output}/${scenario}-complete.png` });
  results.push({ scenario, frames, events: await page.evaluate(() => window.startupEvents) }); await page.close();
 }
 await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
 console.log(JSON.stringify(results.map(r => ({ scenario: r.scenario, frames: r.frames?.length, elapsedSeconds: r.events?.find(e => e.type === 'end')?.elapsed, retryVisible: r.retryVisible })), null, 2));
} finally { await browser.close(); }
