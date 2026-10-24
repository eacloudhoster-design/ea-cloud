// Actual-asset pixel evidence; freeze only CSS animation clocks for matched frames.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.STARTUP_CAPTURE_DIR || 'work/startup-visible-light/pixels';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('https://fonts.**', r => r.abort());
  await page.goto(process.env.STARTUP_APP_ORIGIN || 'http://127.0.0.1:5174/');
  await page.waitForSelector('.ea-startup[data-phase="tracing"]');
  const geometry = await page.locator('.ea-startup-mark').evaluate(mark => {
    const rect = mark.getBoundingClientRect();
    for (const node of mark.querySelectorAll('*')) for (const animation of node.getAnimations()) {
      animation.pause(); animation.currentTime = 2500;
    }
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  const eyeTimes = async (left, right) => page.evaluate(({ left, right }) => {
    for (const [selector, time] of [['.ea-startup-eye--left', left], ['.ea-startup-eye--right', right]]) {
      const animation = document.querySelector(selector).getAnimations()[0];
      animation.pause(); animation.currentTime = time;
    }
  }, { left, right });
  await eyeTimes(0, 2050);
  await page.screenshot({ path: `${output}/eyes-dim.png` });
  await eyeTimes(1080, 2050);
  await page.screenshot({ path: `${output}/left-bright.png` });
  await eyeTimes(0, 345);
  await page.screenshot({ path: `${output}/right-bright.png` });
  await eyeTimes(0, 2050);
  await page.locator('.ea-startup-trail,.ea-startup-tip-halo').evaluateAll(nodes => nodes.forEach(node => node.style.visibility = 'hidden'));
  await page.screenshot({ path: `${output}/outline-control.png` });
  await page.locator('.ea-startup-trail,.ea-startup-tip-halo').evaluateAll(nodes => nodes.forEach(node => node.style.visibility = ''));
  await page.screenshot({ path: `${output}/outline-neon.png` });
  await page.locator('.ea-startup-edge,.ea-startup-tip,.ea-startup-tip-halo,.ea-startup-trail,.ea-startup-traveller').evaluateAll(nodes => nodes.forEach(node => node.getAnimations().forEach(a => { a.pause(); a.currentTime = 6999; })));
  await page.screenshot({ path: `${output}/outline-complete.png` });
  assert.equal(await page.locator('feGaussianBlur').count(), 5);
  assert.equal(await page.locator('.ea-startup-eye').count(), 2);
  await writeFile(`${output}/geometry.json`, JSON.stringify(geometry));
  console.log('Matched actual-logo pixel frames saved to', output);
} finally { await browser.close(); }
