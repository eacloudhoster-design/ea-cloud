import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.APP_ORIGIN || 'http://127.0.0.1:5233/';
const label = process.env.CAPTURE_LABEL || 'after';
const output = process.env.CAPTURE_DIR || 'work/client-handoff';
await mkdir(`${output}/${label}`, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const results = [];
try {
  for (const style of ['regular', 'matrix', 's2tone', 'lumo']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      recordVideo: style === 'matrix' ? { dir: `${output}/${label}`, size: { width: 390, height: 844 } } : undefined });
    await context.addInitScript(({ style }) => {
      Object.defineProperty(navigator, 'standalone', { value: true });
      window.AudioContext = undefined; window.webkitAudioContext = undefined;
      localStorage.setItem('ea-cloud:client:7:home-appearance', JSON.stringify({ interfaceStyle: style, showBg: true, backgroundAnimation: 'none', accentColor: '#ef4444' }));
      window.handoffFrames = [];
      const frame = () => {
        const splash = document.querySelector('.ea-startup');
        const home = document.querySelector('.ea-startup-home');
        if (splash && home) window.handoffFrames.push({ phase: splash.dataset.phase,
          splash: Number(getComputedStyle(splash).opacity), home: Number(getComputedStyle(home).opacity),
          canvas: document.documentElement.hasAttribute('data-ea-pwa-background') });
        requestAnimationFrame(frame);
      }; requestAnimationFrame(frame);
    }, { style });
    await context.route('https://fonts.**', r => r.abort());
    await context.route('**/api/**', async r => {
      const path = new URL(r.request().url()).pathname;
      let json = [];
      if (path === '/api/app/me') json = { id: 7, token: btoa('7:client:cookie'), status: 'approved', licenseKey: 'TEST' };
      if (path === '/api/app/dashboard') json = { mentor: { id: 5, robotName: 'EA Cloud Pro', backgroundImageUrl: '/default-robot.jpg' }, eas: [] };
      if (path === '/api/app/ea-mode-images') json = { eas: [{ id: 1, name: 'EA Cloud Pro', images: Array(4).fill('/default-robot.jpg') }] };
      if (path === '/api/app/trading-controls') json = { copyingEnabled: false };
      if (path === '/api/app/scanner/history') json = { records: [], hasMore: false };
      return r.fulfill({ json });
    });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin);
    await page.waitForSelector('.ea-startup', { state: 'detached', timeout: 25000 });
    await page.waitForTimeout(350);
    const geometry = () => page.evaluate(() => Object.fromEntries(['.ea-app-viewport', '.ea-glass-navigation', '[data-home-screen]'].map(s => {
      const r = document.querySelector(s).getBoundingClientRect(); return [s, { x: r.x, y: r.y, width: r.width, height: r.height }];
    })));
    const beforeNavigation = await geometry();
    await page.screenshot({ path: `${output}/${label}/${style}-home.png` });
    await page.evaluate(() => { window.originalHome = document.querySelector('[data-home-screen]'); });
    for (const tab of ['Settings', 'MetaTrader', 'Home']) {
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: tab, exact: true }).click();
      await page.waitForTimeout(400);
    }
    assert.deepEqual(await geometry(), beforeNavigation, `${style}: navigation must preserve geometry`);
    assert(await page.evaluate(() => window.originalHome === document.querySelector('[data-home-screen]')), 'home must stay mounted');
    const frames = await page.evaluate(() => window.handoffFrames);
    const fading = frames.filter(f => f.phase === 'fading' && f.splash > .05 && f.splash < .95);
    assert(fading.length > 0);
    if (label !== 'before') {
      assert(frames.filter(f => f.phase !== 'fading').every(f => !f.canvas), 'canvas artwork must stay disabled under startup');
      assert(fading.every(f => f.home === 1), 'reveal must use one fade over a fully opaque app');
      const baseline = JSON.parse(await readFile(`${output}/before/results.json`, 'utf8').catch(() => 'null'));
      if (baseline) assert.deepEqual(beforeNavigation, baseline.find(r => r.style === style).geometry, 'sizing must match baseline');
    }
    assert.deepEqual(errors, []);
    results.push({ style, geometry: beforeNavigation, earlyCanvasFrames: frames.filter(f => f.phase !== 'fading' && f.canvas).length,
      minimumHomeDuringFade: Math.min(...fading.map(f => f.home)) });
    const video = page.video();
    await context.close();
    if (video) await video.saveAs(`${output}/${label}/startup-navigation.webm`);
  }
} finally { await browser.close(); }
await writeFile(`${output}/${label}/results.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results.map(({ style, earlyCanvasFrames, minimumHomeDuringFade }) => ({ style, earlyCanvasFrames, minimumHomeDuringFade }))));
