// Defaults to dev servers; override origins to test the combined production build.
// Chromium mobile/standalone emulation does not replace physical iOS testing.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.STARTUP_CAPTURE_DIR || 'work/cinematic-startup/verification';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const scenarios = process.env.STARTUP_SCENARIOS?.split(',') || ['guest', 'desktop', 'android', 'standalone', 'cold-logo', 'slow-auth', 'auth-error', 'portal', 'portal-dashboard', 'reduced', 'asset-error'];
const results = [];
const appOrigin = process.env.STARTUP_APP_ORIGIN || 'http://127.0.0.1:5174/';
const portalOrigin = process.env.STARTUP_PORTAL_ORIGIN || 'http://127.0.0.1:5173';
async function check(scenario) {
  console.log('Checking', scenario);
  const portal = scenario.startsWith('portal');
  const context = await browser.newContext({
    viewport: { width: scenario === 'desktop' ? 1440 : scenario === 'android' ? 412 : 390, height: 844 },
    isMobile: scenario !== 'desktop', hasTouch: scenario !== 'desktop',
    reducedMotion: scenario === 'reduced' ? 'reduce' : 'no-preference',
  });
  try {
    if (scenario === 'standalone') await context.addInitScript(() => {
      Object.defineProperty(navigator, 'standalone', { get: () => true });
      const nativeMatch = window.matchMedia.bind(window);
      window.matchMedia = query => query === '(display-mode: standalone)' ? { ...nativeMatch(query), matches: true, addEventListener() {}, removeEventListener() {} } : nativeMatch(query);
    });
    if (['slow-auth', 'auth-error', 'portal-dashboard'].includes(scenario)) await context.addInitScript(() => {
      localStorage.setItem('appClientToken', 'startup-test'); localStorage.setItem('app_token', 'startup-test');
    });
    await context.route('https://fonts.**', r => r.abort());
    await context.route('**/api/**', async r => {
      const path = new URL(r.request().url()).pathname;
      if (path === '/api/app/me') {
        if (scenario === 'slow-auth') await new Promise(resolve => setTimeout(resolve, 11000));
        if (scenario === 'auth-error') return r.fulfill({ status: 503, json: {} });
        return r.fulfill({ json: { id: 1, status: 'approved', licenseKey: 'licensed' } });
      }
      if (path === '/api/app/dashboard') return r.fulfill({ json: { mentor: { robotName: 'Startup Test Mentor' }, eas: [] } });
      return r.fulfill({ json: { copyingEnabled: true, executions: [] } });
    });
    await context.route('**/*ea-cloud-logo*', async r => {
      if (r.request().resourceType() !== 'image') return r.continue();
      if (scenario === 'cold-logo') await new Promise(resolve => setTimeout(resolve, 2600));
      if (scenario === 'asset-error') return r.abort();
      return r.continue();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // Observe actual phase times without accelerating or replacing app timers.
    await page.addInitScript(() => {
      window.startupPhases = [];
      let previous = '';
      new MutationObserver(() => {
        const splash = document.querySelector('.ea-startup');
        const phase = splash ? `${splash.dataset.started}:${splash.dataset.phase}` : 'done';
        if (phase !== previous && (splash || previous)) {
          window.startupPhases.push({ phase, time: performance.now() }); previous = phase;
        }
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-started', 'data-phase'] });
    });
    await page.goto(portal ? `${portalOrigin}/app${scenario === 'portal-dashboard' ? '/dashboard' : ''}` : appOrigin, { waitUntil: 'domcontentloaded' });
    if (scenario === 'cold-logo') {
      await page.waitForTimeout(2200);
      assert.equal(await page.locator('.ea-startup').getAttribute('data-started'), 'false');
    }
    await page.waitForSelector('.ea-startup[data-started="true"]');
    const sample = () => page.evaluate(() => {
      const splash = document.querySelector('.ea-startup'), mark = splash.querySelector('.ea-startup-mark');
      const r = mark.getBoundingClientRect(), crop = splash.querySelector('.ea-startup-artwork').getBoundingClientRect();
      const img = mark.querySelector('img'), image = img.getBoundingClientRect();
      const edge = splash.querySelector('.ea-startup-edge');
      return { scale: new DOMMatrixReadOnly(getComputedStyle(mark).transform).a,
        opacity: Number(getComputedStyle(mark).opacity), x: r.x + r.width / 2, y: r.y + r.height / 2,
        viewportWidth: innerWidth, viewportHeight: innerHeight, edge: parseFloat(getComputedStyle(edge).strokeDashoffset),
        filter: getComputedStyle(edge).filter, closed: edge.getAttribute('d').endsWith('Z'),
        imageWidth: img.naturalWidth, imageHeight: img.naturalHeight,
        cropTop: (crop.top - image.top) / image.height * img.naturalHeight,
        cropBottom: (crop.bottom - image.top) / image.height * img.naturalHeight,
        background: getComputedStyle(splash).backgroundColor, text: splash.innerText,
        viewBox: splash.querySelector('svg').getAttribute('viewBox') };
    });
    await page.waitForTimeout(120);
    const entranceEarly = await sample();
    await page.waitForTimeout(900);
    const entranceLate = await sample();
    if (scenario !== 'reduced') {
      assert(entranceEarly.scale >= .88 && entranceEarly.scale < entranceLate.scale);
      assert(entranceLate.scale <= 1);
    }
    assert(entranceEarly.opacity > 0 && entranceEarly.opacity < entranceLate.opacity);
    await page.waitForSelector('.ea-startup[data-phase="tracing"]');
    await page.waitForTimeout(800);
    const traceEarly = await sample();
    await page.waitForTimeout(2200);
    const traceLate = await sample();
    assert(traceEarly.edge > traceLate.edge);
    assert(traceEarly.edge - traceLate.edge < .5, 'trace must travel at the requested slow pace');
    for (const frame of [entranceEarly, entranceLate, traceEarly, traceLate]) {
      assert.equal(frame.background, 'rgb(0, 0, 0)'); assert.equal(frame.text, '');
      assert(Math.abs(frame.x - frame.viewportWidth / 2) < 1);
      assert(Math.abs(frame.y - frame.viewportHeight / 2) < 1);
      assert(frame.closed); assert.equal(frame.viewBox, '0 150 1254 690');
      if (scenario !== 'asset-error') {
        assert.equal(frame.imageWidth, 1254);
        assert(Math.abs(frame.cropTop - 150) < 1);
        assert(Math.abs(frame.cropBottom - 840) < 1, 'wordmark beginning at y=849 must be outside the crop');
      }
    }
    assert.equal(traceLate.scale, 1);
    assert(traceLate.filter.includes('drop-shadow'));
    await page.screenshot({ path: `${output}/${scenario}-trace.png` });
    if (scenario === 'slow-auth') {
      await page.waitForTimeout(4300);
      assert.equal(await page.locator('.ea-startup').getAttribute('data-ready'), 'false');
      assert.equal(await page.locator('.ea-startup').getAttribute('data-phase'), 'tracing');
      assert.equal(await page.locator('.ea-startup-home').getAttribute('inert'), '');
    }
    await page.waitForSelector('.ea-startup[data-phase="glowing"]', { timeout: 20000 });
    assert.equal(await page.locator('.ea-startup-edge').evaluate(e => parseFloat(getComputedStyle(e).strokeDashoffset)), 0);
    await page.screenshot({ path: `${output}/${scenario}-glow.png` });
    await page.waitForSelector('.ea-startup[data-phase="fading"]');
    const fades = [];
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(450);
      fades.push(await page.evaluate(() => ({ splash: Number(getComputedStyle(document.querySelector('.ea-startup')).opacity),
        home: Number(getComputedStyle(document.querySelector('.ea-startup-home')).opacity),
        duration: getComputedStyle(document.querySelector('.ea-startup-home')).transitionDuration })));
    }
    for (const fade of fades) {
      assert(fade.splash > 0 && fade.splash < 1); assert(fade.home > 0 && fade.home < 1);
      assert(Math.abs(fade.splash + fade.home - 1) < .05); assert.equal(fade.duration, '2s');
    }
    assert(fades[0].splash > fades[2].splash && fades[0].home < fades[2].home);
    await page.waitForSelector('.ea-startup', { state: 'detached' });
    const phases = await page.evaluate(() => window.startupPhases);
    const elapsed = phases.find(p => p.phase === 'done').time - phases.find(p => p.phase === 'true:entrance').time;
    assert(elapsed >= 11800);
    if (scenario !== 'slow-auth') assert(elapsed <= 15000);
    else assert(elapsed >= 18500, 'late initialization must finish a further complete circuit');
    if (scenario === 'auth-error') await page.getByRole('button', { name: 'Retry', exact: true }).waitFor();
    if (scenario === 'slow-auth') {
      for (const name of ['MetaTrader', 'Settings', 'Home']) {
        await page.getByRole('button', { name, exact: true }).click();
        assert.equal(await page.locator('.ea-startup').count(), 0);
      }
      assert.equal(await page.evaluate(() => localStorage.getItem('appClientToken')), 'startup-test');
    }
    if (scenario === 'portal-dashboard') await page.getByText('Startup Test Mentor', { exact: true }).first().waitFor();
    if (scenario === 'portal') await page.getByRole('button', { name: 'SIGN IN', exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${output}/${scenario}-complete.png` });
    results.push({ scenario, elapsed, phases, entranceEarly, entranceLate, traceEarly, traceLate, fades, passed: true });
    console.log('Passed', scenario, Math.round(elapsed), 'ms');
  } finally { await context.close(); }
}
try {
  // Independent browser contexts, in small batches, keep timing tests responsive.
  for (let i = 0; i < scenarios.length; i += 3) {
    const batch = await Promise.allSettled(scenarios.slice(i, i + 3).map(check));
    const failed = batch.filter(r => r.status === 'rejected');
    if (failed.length) throw new AggregateError(failed.map(r => r.reason));
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
} finally { await browser.close(); }
