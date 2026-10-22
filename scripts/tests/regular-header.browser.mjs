import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = 'work/regular-header';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const results = [];
try {
 for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 667 }, { width: 430, height: 740 }]) {
  const page = await browser.newPage({ viewport });
  const writes = [];
  await page.addInitScript(() => localStorage.setItem('appClientToken', 'header-test'));
  await page.route('https://fonts.**', r => r.abort());
  await page.route('**/test-robot.jpg', r => r.fulfill({ path: 'artifacts/ea-cloud/public/default-robot.jpg', contentType: 'image/jpeg' }));
  await page.route('**/api/**', async r => {
   const path = new URL(r.request().url()).pathname;
   if (r.request().method() === 'PATCH') { writes.push(r.request().postDataJSON()); return r.fulfill({ json: {} }); }
   if (path === '/api/app/me') return r.fulfill({ json: { status: 'approved', licenseKey: 'fixture' } });
   if (path === '/api/app/dashboard') return r.fulfill({ json: { mentor: { robotName: 'SMC Blueprint EA V3+', robotTagline: 'Powered by EA Cloud', backgroundImageUrl: '/test-robot.jpg' }, eas: [] } });
   if (path === '/api/app/trading-controls') return r.fulfill({ json: { copyingEnabled: true } });
   return r.fulfill({ json: [] });
  });
  await page.goto(process.env.APP_ORIGIN || 'http://127.0.0.1:5174/');
  await page.waitForSelector('.ea-startup', { state: 'detached' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Select Main Interface' }).click();
  await page.getByRole('button', { name: 'Regular Interface' }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.waitForTimeout(350); // Let the existing 300 ms Settings panel transition finish.
  const bell = page.getByRole('button', { name: 'Notifications', exact: true });
  const header = bell.locator('..');
  const active = header.getByText('ACTIVE', { exact: true });
  await active.waitFor();
  const scroller = header.locator('..');
  const lowerBranding = page.locator('div.inline-flex').filter({ hasText: /^Powered By\s*EA Cloud$/ });
  assert.equal(await lowerBranding.count(), 1);
  assert.equal(await header.getByText(/Powered/i).count(), 0);
  assert.equal(await page.getByRole('heading', { name: 'SMC BLUEPRINT EA V3+', exact: true }).count(), 1);
  const before = await header.evaluate(el => {
   const bell = el.querySelector('button').getBoundingClientRect();
   const status = el.firstElementChild.getBoundingClientRect();
   const parent = el.parentElement;
   return { position: getComputedStyle(el).position, bell: { x: bell.x, y: bell.y, width: bell.width, height: bell.height }, status: { x: status.x, y: status.y, width: status.width, height: status.height }, width: parent.clientWidth, top: parent.scrollTop };
  });
  assert.equal(before.position, 'relative');
  assert(Math.abs(before.bell.y + before.bell.height / 2 - before.status.y - before.status.height / 2) < 1);
  assert(Math.abs(before.status.x - (before.width - before.bell.x - before.bell.width)) < 1);
  assert.equal(await active.evaluate(el => getComputedStyle(el).color), 'rgb(34, 197, 94)');
  await page.screenshot({ path: `${output}/${viewport.width}-before.png` });
  await scroller.hover({ position: { x: 20, y: 100 } });
  await page.mouse.wheel(0, 100);
  await page.waitForFunction(() => document.querySelector('button[aria-label="Notifications"]').parentElement.parentElement.scrollTop > 0);
  const scroll = await scroller.evaluate(el => el.scrollTop);
  assert(scroll > 30, 'Natural content must actually scroll');
  const after = await bell.boundingBox();
  assert(Math.abs(before.bell.y - after.y - scroll) < 1, 'Bell must move by exactly the content scroll distance');
  const afterStatus = await active.locator("..").boundingBox();
  assert(Math.abs(before.status.y - afterStatus.y - scroll) < 1, 'ACTIVE must move by exactly the content scroll distance');
  await page.screenshot({ path: `${output}/${viewport.width}-scrolled.png` });
  await scroller.evaluate(el => { el.scrollTop = 0; });
  await bell.click();
  await page.getByRole('heading', { name: 'Copied Trades', exact: true }).waitFor();
  // Close the existing copied-trades sheet, then exercise the unchanged controls.
  await page.getByRole('heading', { name: 'Copied Trades', exact: true }).locator('../..').locator('button').click();
  await page.getByText('STOP', { exact: true }).locator('..').locator('button').click();
  await header.getByText('PAUSED', { exact: true }).waitFor();
  await page.getByText('START', { exact: true }).locator('..').locator('button').click();
  await active.waitFor();
  assert.deepEqual(writes, [{ copyingEnabled: false }, { copyingEnabled: true }]);
  await page.getByText('REMOVE', { exact: true }).locator('..').locator('button').click();
  await page.getByRole('heading', { name: 'Remove EA?', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByText('SYMBOLS', { exact: true }).locator('..').locator('button').click();
  await page.getByRole('heading', { name: 'SMC Blueprint EA V3+', exact: true }).waitFor();
  results.push({ viewport, before, scroll, bellAfterY: after.y, activeAfterY: afterStatus.y, notificationOpened: true, statusToggled: true, lowerBrandingRetained: true });
  await page.close();
 }
 await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
 console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
