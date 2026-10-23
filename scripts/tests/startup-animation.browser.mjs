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
  await page.goto(portal ? `http://127.0.0.1:5173/app${scenario === 'portal-dashboard' ? '/dashboard' : ''}` : 'http://127.0.0.1:5174/', { waitUntil: 'domcontentloaded' });
  if (scenario === 'cold-logo') {
   await page.waitForTimeout(2200);
   assert.equal(await page.locator('.ea-startup').getAttribute('data-started'), 'false');
  }
  await page.waitForSelector('.ea-startup[data-started="true"]');
  if (scenario !== 'asset-error') {
   const frames = [];
   for (const timestamp of [200, 900, 1750]) {
    await page.waitForFunction(t => document.querySelector('.ea-startup-edge')?.getAnimations()[0]?.currentTime >= t, timestamp);
    frames.push(await page.evaluate(() => {
     const splash = document.querySelector('.ea-startup');
     const mark = splash.querySelector('.ea-startup-mark');
     const rect = mark.getBoundingClientRect();
     const edge = splash.querySelector('.ea-startup-edge');
     return { edge: getComputedStyle(edge).strokeDashoffset, imageWidth: mark.querySelector('img').naturalWidth,
      x: rect.x + rect.width / 2, y: rect.y + rect.height / 2,
      viewportWidth: innerWidth, viewportHeight: innerHeight,
      background: getComputedStyle(splash).backgroundColor,
      closed: edge.getAttribute('d').endsWith('Z'), text: splash.innerText };
    }));
   }
   for (const frame of frames) {
    assert.equal(frame.imageWidth, 1254); assert.equal(frame.background, 'rgb(0, 0, 0)');
    assert.equal(frame.text, ''); assert(frame.closed);
    assert(Math.abs(frame.x - frame.viewportWidth / 2) < 1);
    assert(Math.abs(frame.y - frame.viewportHeight / 2) < 1);
   }
   assert(parseFloat(frames[0].edge) > parseFloat(frames[2].edge));
   if (scenario === 'slow-auth') {
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.ea-startup').getAttribute('data-phase'), 'tracing');
    assert.equal(await page.locator('.ea-startup-home').getAttribute('inert'), '');
   }
   await page.waitForSelector('.ea-startup[data-phase="glowing"]');
   assert.equal(await page.locator('.ea-startup-edge').evaluate(e => parseFloat(getComputedStyle(e).strokeDashoffset)), 0);
   await page.waitForSelector('.ea-startup[data-phase="fading"]');
   await page.waitForTimeout(200);
   const fade = await page.evaluate(() => ({
    splash: Number(getComputedStyle(document.querySelector('.ea-startup')).opacity),
    home: Number(getComputedStyle(document.querySelector('.ea-startup-home')).opacity),
    duration: getComputedStyle(document.querySelector('.ea-startup-home')).transitionDuration,
   }));
   assert(fade.splash > 0 && fade.splash < 1); assert(fade.home > 0 && fade.home < 1);
   assert(Math.abs(fade.splash + fade.home - 1) < .05); assert.equal(fade.duration, '0.5s');
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
  results.push({ scenario, passed: true }); await page.close();
 }
 await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
 console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
