// Actual production-app tests. Only authentication/account/mentor APIs are
// fixtures. Every platform/broker logo is a real bundled production asset.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.MT5_PREVIEW_ORIGIN || 'http://127.0.0.1:5174';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Tests require a loopback app');
const screenshots = process.env.MT5_SCREENSHOTS || 'work/mt5-floating';
mkdirSync(screenshots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const writes = [], errors = [], thirdPartyImages = [], consoleErrors = [];
const fixtureImage = readFileSync(fileURLToPath(new URL('../../artifacts/ea-cloud/public/default-robot.jpg', import.meta.url)));
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) consoleErrors.push(message.text()); });
page.on('request', request => { if (!['GET','HEAD'].includes(request.method())) writes.push(request.url()); });
// The production app's existing account-update socket is isolated too.
await page.routeWebSocket('**/api/ws?*', socket => { socket.onMessage(() => {}); });
await page.addInitScript(() => localStorage.setItem('appClientToken', 'isolated-browser-fixture'));
await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin !== origin) {
    if (route.request().resourceType() === 'image') thirdPartyImages.push(url.href);
    return route.abort();
  }
  if (url.pathname === '/_fixture/mentor-background.jpg') return route.fulfill({ contentType: 'image/jpeg', body: fixtureImage });
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
  await screen.getByRole('heading', { name: 'Your Trading World', exact: true }).waitFor();
  await page.waitForTimeout(400);
  const account = screen.getByLabel('MT5 Account Number', { exact: true });
  const password = screen.getByLabel('Password', { exact: true });
  const server = screen.getByLabel('Server', { exact: true });
  const submit = screen.getByRole('button', { name: 'Connect MT5', exact: true });
  const background = screen.locator('.mt5-mentor-background');
  const platform = screen.getByRole('img', { name: 'MetaTrader 5', exact: true });
  await platform.evaluate(async img => { await img.decode(); });
  assert.equal(await platform.evaluate(img => img.naturalWidth), 512);
  assert.equal(await screen.locator('.lucide-layers3').count(), 0);
  assert.equal(await screen.locator('.mt5-floating-field').count(), 3);
  assert.deepEqual(await screen.locator('.mt5-form').evaluate(el => {
    const s = getComputedStyle(el); return [s.backgroundColor,s.borderTopWidth,s.boxShadow];
  }), ['rgba(0, 0, 0, 0)','0px','none'], 'The form must have no enclosing card');
  assert.equal(await background.getAttribute('src'), '/_fixture/mentor-background.jpg');
  await background.evaluate(async img => { await img.decode(); });
  assert.equal(await background.evaluate(el => getComputedStyle(el).objectFit), 'cover');
  assert.doesNotMatch(await screen.innerText(), /visual preview|demo connection|demo animation|live verification unavailable/i);
  assert.equal((await submit.boundingBox()).y + (await submit.boundingBox()).height <= 844 - 75, true);
  await page.screenshot({ path: screenshots + '/01-login-red.png' });

  await account.fill('1e9'); await password.fill('demo-only-password'); await server.fill('Exness-MT5Real1');
  await screen.getByRole('button', { name: 'Show password' }).click();
  assert.equal(await password.getAttribute('type'), 'text');
  await screen.getByRole('button', { name: 'Hide password' }).click();
  await submit.click();
  await screen.getByRole('alert').getByText('Enter a valid MT5 account number using digits only.').waitFor();
  await account.fill('0012345678'); await submit.click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('heading', { name: 'Connecting to Exness...', exact: true }).waitFor();
  assert.equal(await password.inputValue(), '');
  const exnessLogo = dialog.getByRole('img', { name: 'Exness logo', exact: true });
  await exnessLogo.evaluate(async img => { await img.decode(); });
  const logoSource = await exnessLogo.getAttribute('src');
  const reveal = dialog.locator('.mt5-broker-reveal');
  const initial = await reveal.evaluate(el => [Number(getComputedStyle(el).opacity),new DOMMatrix(getComputedStyle(el).transform).a]);
  await page.waitForTimeout(1750);
  const final = await reveal.evaluate(el => [Number(getComputedStyle(el).opacity),new DOMMatrix(getComputedStyle(el).transform).a]);
  assert.ok(final[0] > .99 && final[0] > initial[0]);
  assert.ok(final[1] > .99 && final[1] > initial[1]);
  assert.ok(await background.evaluate(el => parseFloat(getComputedStyle(el).filter.match(/blur\(([^)]+)/)[1]) >= 16));
  assert.equal(await background.getAttribute('src'), '/_fixture/mentor-background.jpg');
  assert.equal(await dialog.locator('.mt5-connection-modal').count(), 0);
  assert.equal(await dialog.locator('.mt5-broker-reveal').count(), 1);
  assert.equal(await dialog.locator('.mt5-small-spinner').evaluate(el => getComputedStyle(el).borderTopColor), 'rgb(239, 68, 68)');
  assert.doesNotMatch(await dialog.innerText(), /%|MT5Real|unavailable|not reachable|server|visual preview|demo animation/i);
  assert.equal(await dialog.locator('.mt5-small-spinner').count(), 1);
  await page.screenshot({ path: screenshots + '/02-connecting-exness-red.png' });
  await dialog.getByRole('heading', { name: 'Backend not reachable right now.', exact: true }).waitFor();
  assert.match(await dialog.innerText(), /account remains unverified/);
  assert.equal(await dialog.locator('.mt5-small-spinner').count(), 0);
  await page.screenshot({ path: screenshots + '/05-backend-unreachable.png' });
  await dialog.getByRole('button', { name: 'Retry', exact: true }).click();
  await dialog.getByRole('heading', { name: 'Connecting to Exness...', exact: true }).waitFor();
  assert.equal(await dialog.getByText('Backend not reachable right now.', { exact: true }).count(), 0);
  await page.keyboard.press('Escape');
  assert.equal(await dialog.count(), 0);
  assert.equal(await submit.evaluate(el => el === document.activeElement), true);

  // Existing Settings UI is the only theme selector. No new theme state or test hook.
  const changeTheme = async (name) => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const colour = page.getByRole('button', { name: 'Select Colour', exact: true });
    await colour.click();
    await page.getByRole('button', { name, exact: true }).click();
    await page.getByRole('button', { name: 'MetaTrader', exact: true }).click();
    await page.waitForTimeout(400);
    await screen.locator('.mt5-content').evaluate(el => { el.scrollTop = 0; });
  };
  await changeTheme('Electric Blue');
  assert.equal(await screen.evaluate(el => getComputedStyle(el).getPropertyValue('--mt5-accent').trim()), '#3b82f6');
  await account.focus();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#mt5-login').parentElement).borderTopColor === 'rgb(59, 130, 246)');
  await submit.focus();
  await screen.locator('.mt5-content').evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: screenshots + '/04-login-blue.png' });
  await server.fill('HFMarketsSV-Live'); await password.fill('demo'); await submit.click();
  await dialog.getByRole('heading', { name: 'Connecting to HFM...', exact: true }).waitFor();
  await dialog.getByRole('img', { name: 'HFM logo', exact: true }).evaluate(async img => { await img.decode(); });
  await page.waitForTimeout(1750);
  assert.equal(await dialog.locator('.mt5-small-spinner').evaluate(el => getComputedStyle(el).borderTopColor), 'rgb(59, 130, 246)');
  await page.screenshot({ path: screenshots + '/03-connecting-hfm-blue.png' });
  await page.keyboard.press('Escape');

  const supported = [['Deriv-Demo','Deriv'],['XMGlobal-MT5','XM'],['ICMarketsSC-MT5','IC Markets'],['Pepperstone-MT5-Live01','Pepperstone'],['FBS-Real','FBS'],['Tickmill-Live','Tickmill'],['ForexTimeFXTM-Live01','FXTM'],['OANDA-Live','OANDA'],['AvaTrade-Demo','AvaTrade'],['Exness-MT5Real1','Exness']];
  for (const [value,name] of supported) {
    await server.fill(value); await password.fill('demo'); await submit.click();
    const logo = dialog.getByRole('img', { name: name + ' logo', exact: true });
    await logo.evaluate(async img => { await img.decode(); });
    assert.ok(await logo.evaluate(img => img.naturalWidth > 0 && img.naturalHeight > 0));
    const src = await logo.getAttribute('src');
    assert.ok(src.startsWith('data:') || new URL(src,origin).origin === origin);
    if (name === 'Exness') assert.equal(src,logoSource, 'Theme must not recolour broker artwork');
    assert.equal(await dialog.getByLabel('Unknown broker', { exact: true }).count(), 0);
    await dialog.getByRole('button', { name: 'Cancel connection' }).click();
  }
  await server.fill('UnrelatedTrading-Real'); await password.fill('demo'); await submit.click();
  await dialog.getByRole('heading', { name: 'Connecting to broker...', exact: true }).waitFor();
  await dialog.getByLabel('Unknown broker', { exact: true }).waitFor();
  await page.keyboard.press('Escape'); await page.waitForTimeout(3400);
  assert.equal(await dialog.count(), 0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 568 });
  await screen.locator('.mt5-content').evaluate(el => { el.scrollTop = 0; });
  assert.ok((await submit.boundingBox()).y + (await submit.boundingBox()).height <= 568 - 75, 'Small-phone Connect button must not be cut off');
  await page.screenshot({ path: screenshots + '/06-small-phone-login.png' });
  await password.fill('demo'); await submit.click();
  assert.equal(await dialog.locator('.mt5-small-spinner').evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.equal(await dialog.locator('.mt5-broker-reveal').evaluate(el => getComputedStyle(el).animationName), 'none');
  const box = await dialog.locator('.mt5-connection-content').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 320 && box.y >= 0 && box.y + box.height <= 493);
  await page.keyboard.press('Tab');
  assert.equal(await dialog.getByRole('button', { name: 'Cancel connection' }).evaluate(el => el === document.activeElement), true);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'MetaTrader', exact: true }).click();
  assert.equal(await dialog.count(), 0);
  // A keyboard-height viewport must scroll fields above navigation rather than clipping.
  await page.setViewportSize({ width: 390, height: 420 });
  await password.click();
  const pwBox = await password.boundingBox();
  assert.ok(pwBox.y >= 0 && pwBox.y + pwBox.height <= 420 - 75);
  await page.setViewportSize({ width: 1280, height: 900 });
  await screen.locator('.mt5-content').evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: screenshots + '/07-desktop.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(writes, []); assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(thirdPartyImages, []);
  const storage = await page.evaluate(() => JSON.stringify(localStorage));
  assert.equal(storage.includes('demo-only-password'),false);
  assert.equal(storage.includes('0012345678'),false);
  console.log('PASS: authentic MT5 + 11 broker assets, independent glass fields/no outer panels, real theme switch/focus/spinner, same mentor background/blur, fade/scale, exact failure text/retry, unknown fallback, mobile/keyboard-height/desktop, reduced motion/focus/cancellation, no external images/writes/runtime or console errors');
} finally { await browser.close(); }
