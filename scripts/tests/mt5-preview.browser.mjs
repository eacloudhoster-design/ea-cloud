// Run with a local ea-app Vite server. Requires Playwright + Chromium.
// All API responses are isolated fixtures. No production login/database is used.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.MT5_PREVIEW_ORIGIN || 'http://127.0.0.1:5174';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Browser tests require a loopback app');
const screenshots = process.env.MT5_SCREENSHOTS || 'work/mt5-preview';
mkdirSync(screenshots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const writes = [];
const errors = [];
const thirdPartyImages = [];
const fixtureImage = readFileSync(fileURLToPath(new URL('../../artifacts/ea-cloud/public/default-robot.jpg', import.meta.url)));
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (request.method() !== 'GET' && request.method() !== 'HEAD') writes.push(request.url()); });
await page.addInitScript(() => localStorage.setItem('appClientToken', 'isolated-browser-fixture'));
await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin !== origin) {
    if (route.request().resourceType() === 'image') thirdPartyImages.push(url.href);
    return route.abort(); // All broker images must work without third-party access.
  }
  if (url.pathname.startsWith('/_fixture/')) return route.fulfill({ contentType: 'image/jpeg', body: fixtureImage });
  if (!url.pathname.startsWith('/api/')) return route.continue();
  let data = {};
  if (url.pathname === '/api/app/me') data = { status: 'approved', licenseKey: 'FIXTURE-LICENCE' };
  else if (url.pathname === '/api/app/dashboard') data = { mentor: { robotName: 'Mentor Trading Lab', robotTagline: '@mentor', backgroundImageUrl: '/_fixture/mentor-background.jpg' }, eas: [] };
  else if (url.pathname === '/api/app/trading-controls') data = { mt5Connected: true, mt5Login: '87654321', mt5Server: 'Deriv-Demo', copyingEnabled: false };
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
});
try {
  await page.goto(origin + '/ea-app/');
  await page.getByRole('button', { name: 'MetaTrader', exact: true }).click();
  const screen = page.getByRole('region', { name: 'MT5 Connections' });
  await screen.getByText('MT5 LOGIN DETAILS', { exact: true }).waitFor();
  await screen.getByText('Your saved connection is unchanged.').waitFor();
  await page.waitForTimeout(400); // Let the existing tab slide finish before capturing.
  assert.equal(Math.round((await screen.boundingBox()).x), 0);
  assert.equal(await screen.locator('.mt5-mentor-background').getAttribute('src'), '/_fixture/mentor-background.jpg');
  assert.equal(await screen.locator('.mt5-mentor-background').evaluate(el => el.naturalWidth > 0), true);
  assert.doesNotMatch(await screen.innerText(), /visual preview|demo connection|demo animation|animation preview/i);
  await page.screenshot({ path: screenshots + '/01-account-mobile.png' });
  await screen.getByLabel('LOGIN / ACCOUNT NUMBER', { exact: true }).fill('1e9');
  await screen.getByLabel('PASSWORD', { exact: true }).fill('demo-only-password');
  await screen.getByRole('button', { name: 'Show password' }).click();
  assert.equal(await screen.getByLabel('PASSWORD', { exact: true }).getAttribute('type'), 'text');
  await screen.getByRole('button', { name: 'Hide password' }).click();
  await screen.getByLabel('BROKER SERVER', { exact: true }).fill('Exness-MT5Real1');
  await screen.getByRole('button', { name: 'Connect MT5', exact: true }).click();
  await screen.getByRole('alert').getByText('Enter a valid MT5 account number using digits only.').waitFor();
  await screen.getByLabel('LOGIN / ACCOUNT NUMBER', { exact: true }).fill('0012345678');
  await screen.getByRole('button', { name: 'Connect MT5', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('heading', { name: 'Connecting to Exness...', exact: true }).waitFor();
  assert.equal(await screen.getByLabel('PASSWORD', { exact: true }).inputValue(), '');
  const exnessLogo = dialog.getByRole('img', { name: 'Exness logo', exact: true });
  await exnessLogo.waitFor();
  await exnessLogo.evaluate(async img => { await img.decode(); });
  assert.ok(await exnessLogo.evaluate(img => img.naturalWidth >= 200));
  assert.equal(await dialog.getByLabel('Unknown broker', { exact: true }).count(), 0);
  assert.ok((await dialog.boundingBox()).x >= 0, 'Dialog must not be clipped by horizontal focus scrolling');
  const reveal = dialog.locator('.mt5-broker-reveal');
  const initialOpacity = await reveal.evaluate(el => Number(getComputedStyle(el).opacity));
  const initialScale = await reveal.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a);
  await page.waitForTimeout(1750);
  const finalOpacity = await reveal.evaluate(el => Number(getComputedStyle(el).opacity));
  const finalScale = await reveal.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a);
  assert.ok(finalOpacity > .99 && finalOpacity > initialOpacity, 'Broker logo should fade into view');
  assert.ok(finalScale > .99 && finalScale > initialScale, 'Broker logo should grow smoothly into view');
  assert.notEqual(await dialog.locator('.mt5-small-spinner').evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.doesNotMatch(await dialog.innerText(), /visual preview|demo connection|demo animation|animation preview|playing the connection animation/i);
  await page.screenshot({ path: screenshots + '/02-connecting-mobile.png' });
  await dialog.getByRole('heading', { name: 'Live verification unavailable', exact: true }).waitFor();
  assert.match(await dialog.innerText(), /Your account has not been connected/);
  assert.equal(await dialog.getByRole('heading', { name: 'Connected', exact: true }).count(), 0);
  await page.screenshot({ path: screenshots + '/03-unverified-mobile.png' });
  await page.keyboard.press('Escape');
  assert.equal(await dialog.count(), 0);
  assert.equal(await screen.getByRole('button', { name: 'Connect MT5', exact: true }).evaluate(el => el === document.activeElement), true);

  // Unknown broker, cancellation and no delayed state resurrection.
  await screen.getByLabel('BROKER SERVER', { exact: true }).fill('UnknownBroker-Live');
  await screen.getByLabel('PASSWORD', { exact: true }).fill('demo');
  await screen.getByRole('button', { name: 'Connect MT5', exact: true }).click();
  await dialog.getByRole('heading', { name: 'Connecting to your broker...', exact: true }).waitFor();
  await dialog.getByLabel('Unknown broker').waitFor();
  await dialog.getByRole('button', { name: 'Cancel connection' }).click();
  await page.waitForTimeout(3400);
  assert.equal(await dialog.count(), 0);

  // Render every real bundled broker asset, without substituting test images.
  const supported = [
    ['Deriv-Demo', 'Deriv'], ['XMGlobal-MT5', 'XM'], ['ICMarketsSC-MT5', 'IC Markets'],
    ['Pepperstone-MT5-Live01', 'Pepperstone'], ['HFM-Demo', 'HFM'], ['FBS-Real', 'FBS'],
    ['Tickmill-Live', 'Tickmill'], ['ForexTimeFXTM-Live01', 'FXTM'], ['OANDA-Live', 'OANDA'], ['AvaTrade-Demo', 'AvaTrade'],
  ];
  for (const [server, name] of supported) {
    await screen.getByLabel('BROKER SERVER', { exact: true }).fill(server);
    await screen.getByLabel('PASSWORD', { exact: true }).fill('demo');
    await screen.getByRole('button', { name: 'Connect MT5', exact: true }).click();
    const logo = dialog.getByRole('img', { name: name + ' logo', exact: true });
    await logo.waitFor();
    await logo.evaluate(async img => { await img.decode(); });
    assert.ok(await logo.evaluate(img => img.naturalWidth > 0 && img.naturalHeight > 0), name);
    const src = await logo.getAttribute('src');
    assert.ok(src.startsWith('data:') || new URL(src, origin).origin === origin, name + ' must not use a remote logo');
    assert.equal(await dialog.getByLabel('Unknown broker', { exact: true }).count(), 0);
    assert.equal(await dialog.getByRole('alert').count(), 0);
    if (['Deriv', 'XM', 'IC Markets'].includes(name)) {
      await page.waitForTimeout(1750);
      await page.screenshot({ path: screenshots + '/broker-' + name.toLowerCase().replaceAll(' ', '-') + '.png' });
    }
    await dialog.getByRole('button', { name: 'Cancel connection' }).click();
  }
  await screen.getByLabel('BROKER SERVER', { exact: true }).fill('UnknownBroker-Live');

  // Reduced motion, small phone, tab navigation cleanup and keyboard focus trap.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 568 });
  await screen.getByLabel('PASSWORD', { exact: true }).fill('demo');
  await screen.getByRole('button', { name: 'Connect MT5', exact: true }).click();
  await dialog.waitFor();
  assert.equal(await dialog.locator('.mt5-small-spinner').evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.equal(await dialog.locator('.mt5-broker-reveal').evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.keyboard.press('Tab');
  assert.equal(await dialog.getByRole('button', { name: 'Cancel connection' }).evaluate(el => el === document.activeElement), true);
  const box = await dialog.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 320);
  assert.ok(box.y >= 0 && box.y + box.height <= 568 - 75);
  await page.screenshot({ path: screenshots + '/04-small-phone.png' });
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'MetaTrader', exact: true }).click();
  assert.equal(await dialog.count(), 0);

  await page.setViewportSize({ width: 1280, height: 900 });
  await screen.locator('.mt5-content').evaluate(el => { el.scrollTop = 0; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: screenshots + '/05-desktop.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(writes, [], 'Preview must not submit credentials, connect/disconnect, or alter settings');
  assert.deepEqual(errors, []);
  assert.deepEqual(thirdPartyImages, [], 'Recognised brokers must never request a third-party image');
  const storage = await page.evaluate(() => JSON.stringify(localStorage));
  assert.equal(storage.includes('demo-only-password'), false);
  assert.equal(storage.includes('0012345678'), false);
  console.log('PASS: mobile, small phone, desktop, branding, password toggle, validation, honest completion, cancellation, reduced motion, focus, all 11 real bundled logos with third-party access blocked, unknown-only fallback, no writes or runtime errors');
} finally { await browser.close(); }
