// Hold application scripts, not production timers, to verify the first HTML paint.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
// Module blocking also postpones document.fonts.ready; the mark contains no text.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.STARTUP_CAPTURE_DIR || 'work/startup-intensity/first-paint';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
 for (const reduced of [false, true]) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let release; const gate = new Promise(resolve => { release = resolve; });
  let unlocked = false;
  await page.route('**/*', async r => {
   if (r.request().resourceType() === 'script' && !unlocked) await gate;
   if (r.request().url().includes('/api/')) return r.fulfill({ json: { eas: [] } });
   if (r.request().url().startsWith('https://fonts.')) return r.abort();
   return r.continue();
  });
  await page.goto(process.env.STARTUP_APP_ORIGIN || 'http://127.0.0.1:5174/', { waitUntil: 'commit' });
  await page.waitForSelector('#root', { state: 'attached' });
  const initial = await page.evaluate(async () => {
   const root = document.getElementById('root'), style = getComputedStyle(root, '::before');
   const image = new Image(); image.src = document.querySelector('link[rel="preload"][as="image"]').href; await image.decode();
   const rect = root.getBoundingClientRect();
   return { empty: root.childElementCount === 0, content: style.content, image: style.backgroundImage,
    width: parseFloat(style.width), transform: style.transform, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2,
    loaded: image.naturalWidth === 1254 };
  });
  assert(initial.empty && initial.loaded); assert.equal(initial.content, '""');
  assert(initial.image.includes('ea-cloud-logo.jpeg'));
  await page.screenshot({ path: `${output}/${reduced ? 'reduced' : 'normal'}-before-javascript.png` });
  await page.evaluate(() => {
   window.handoffFrames = [];
   const capture = () => {
    const marks = document.querySelectorAll('.ea-startup-mark');
    if (!marks.length) return requestAnimationFrame(capture);
    const mark = marks[0], rect = mark.getBoundingClientRect();
    window.handoffFrames.push({ opacity: Number(getComputedStyle(mark).opacity),
     width: rect.width, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2,
     loaded: mark.querySelector('img').naturalWidth === 1254, count: marks.length,
     fallback: getComputedStyle(document.getElementById('root'), '::before').content });
    if (window.handoffFrames.length < 16) requestAnimationFrame(capture);
   };
   requestAnimationFrame(capture);
  });
  unlocked = true; release();
  await page.waitForFunction(() => window.handoffFrames?.length >= 16);
  const frames = await page.evaluate(() => window.handoffFrames);
  for (const frame of frames) {
   assert.equal(frame.opacity, 1); assert(frame.loaded); assert.equal(frame.count, 1);
   assert(Math.abs(frame.x - 195) < 1 && Math.abs(frame.y - 422) < 1);
   assert.equal(frame.fallback, 'none');
  }
  const initialScale = reduced ? 1 : .88;
  assert(Math.abs(frames[0].width - initial.width * initialScale) < 4, 'handoff must retain logo dimensions');
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${output}/${reduced ? 'reduced' : 'normal'}-after-handoff.png` });
  await writeFile(`${output}/${reduced ? 'reduced' : 'normal'}-frames.json`, JSON.stringify({ initial, frames }, null, 2));
  await page.close();
 }
 console.log('Pre-JavaScript logo and stable React handoff verified in normal/reduced-motion modes');
} finally { await browser.close(); }
