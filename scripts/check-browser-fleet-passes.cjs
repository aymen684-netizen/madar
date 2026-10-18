const fs = require('fs'),
  assert = require('node:assert/strict');
async function checkBrowserFleetPasses(browser, baseUrl, output) {
  const seed = JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json')),
    data = Array.from({ length: 13 }, (_, i) => ({
      ...seed,
      NORAD_CAT_ID: 100001 + i,
      OBJECT_NAME: 'PASS TEST ' + i,
      EPOCH:
        i === 1
          ? '2026-10-14T00:00:00Z'
          : i === 2
            ? '2026-10-12T00:00:00Z'
            : '2026-10-16T00:00:00Z',
    }));
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
        isMobile: mobile,
        hasTouch: mobile,
      }),
      page = await context.newPage(),
      requests = [],
      errors = [];
    await context.addInitScript(() => {
      localStorage.setItem('madar-save-enabled', 'false');
      const NativeWorker = window.Worker;
      window.__fleetWorkers = { started: 0, stopped: 0 };
      window.Worker = class extends NativeWorker {
        constructor(url, options) {
          super(url, options);
          this.fleetPass = String(url).includes('fleet-pass-worker');
          if (this.fleetPass) window.__fleetWorkers.started++;
        }
        terminate() {
          if (this.fleetPass) window.__fleetWorkers.stopped++;
          return super.terminate();
        }
      };
    });
    page.on('request', (r) =>
      requests.push({ url: r.url(), method: r.method(), body: r.postData() }),
    );
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://celestrak.org/**', (r) =>
      r.fulfill({ contentType: 'application/json', body: JSON.stringify(data) }),
    );
    await page.route('**/api/orbits?*', (r) =>
      r.fulfill({
        contentType: 'application/json',
        headers: { 'X-Madar-Fetched-At': String(Date.now()), 'X-Madar-Connection': 'upstream' },
        body: JSON.stringify(data),
      }),
    );
    try {
      await page.goto(baseUrl);
      await page.waitForFunction(() => window.MapFleet && objects.length === 13 && world);
      assert(
        !requests.some((r) => /fleet-pass(es|-core|-worker)\.js/.test(r.url)),
        'pass tools are lazy',
      );
      const site = await page.evaluate(() => {
        for (const o of objects.slice(0, 12)) MapFleet.toggle(o);
        fixedTime = new Date(OrbitData.epoch(objects[0]));
        paused = false;
        const pv = satellite.propagate(OrbitData.satrec(satellite, objects[0]), fixedTime),
          g = satellite.eciToGeodetic(pv.position, satellite.gstime(fixedTime));
        return { lat: (g.latitude * 180) / Math.PI, lon: (g.longitude * 180) / Math.PI };
      });
      await page.click('#map-fleet-open');
      await page.waitForSelector('#fleet-pass-form');
      await page.fill('#fleet-pass-lat', String(site.lat));
      await page.fill('#fleet-pass-lon', String(site.lon));
      await page.click('#fleet-pass-run');
      await page.waitForFunction(
        () => document.getElementById('fleet-pass-list').children.length === 12,
        {},
        { timeout: 90000 },
      );
      const text = await page.locator('#fleet-pass-list').innerText();
      assert(text.includes('مرور جارٍ'));
      assert(text.includes('90.0°'));
      assert(text.includes('المرور محصور'));
      const first = page.locator('#fleet-pass-list li').first();
      await first.scrollIntoViewIfNeeded();
      const frozen = await first.innerText();
      await page.waitForTimeout(1200);
      assert.equal(await first.innerText(), frozen, 'countdown follows fixed map time');
      await page.screenshot({
        path: output + '/fleet-passes-' + (mobile ? 'mobile' : 'desktop') + '.png',
      });
      await page.click('#map-tools-close');
      await page.click('#language-toggle');
      await page.click('#map-fleet-open');
      await first.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.documentElement.lang === 'en');
      assert(!/[\u0620-\u064a]/.test(await page.locator('#fleet-passes').innerText()));
      assert(
        (await page.locator('#fleet-pass-list').innerText()).includes(
          'Check the age of the orbital elements',
        ),
      );
      assert(
        (await page.locator('#fleet-pass-list').innerText()).includes(
          'Elements are far from display time',
        ),
      );
      assert.equal(await page.locator('#fleet-pass-list li').count(), 12);
      await page.screenshot({
        path: output + '/fleet-passes-en-' + (mobile ? 'mobile' : 'desktop') + '.png',
      });
      await page.fill('#fleet-pass-lat', '24.123456');
      assert.equal(
        await page.locator('#fleet-pass-list li').count(),
        0,
        'site edits discard stale results',
      );
      await page.click('#fleet-pass-run');
      await page.waitForFunction(() => __fleetWorkers.started >= 2);
      await page.click('#map-tools-close');
      await page.waitForFunction(() => __fleetWorkers.stopped >= 2);
      await page.click('#map-fleet-open');
      await page.locator('#fleet-pass-run').scrollIntoViewIfNeeded();
      await page.waitForFunction(
        () => document.getElementById('fleet-pass-list').children.length === 12,
        {},
        { timeout: 90000 },
      );
      await page.evaluate(() => MapFleet.toggle(MapFleet.objects()[0]));
      assert.equal(
        await page.locator('#fleet-pass-list li').count(),
        0,
        'selection edits discard stale results',
      );
      await page.click('#fleet-pass-observer');
      assert.equal(await page.locator('#observer-scope').inputValue(), 'fleet');
      assert.equal(await page.locator('#observer-lat').inputValue(), '24.123456');
      assert.equal(await page.evaluate(() => watchlist.items.length), 0);
      await page.fill('#observer-end', await page.locator('#observer-start').inputValue());
      await page.uncheck('#observer-next');
      // A short real report uses the explicit map selection, including objects outside the catalog filter.
      await page.evaluate(() => {
        const start = document.getElementById('observer-start').value,
          time = new Date('2000-01-01T' + start + 'Z');
        time.setUTCMinutes(time.getUTCMinutes() + 10);
        document.getElementById('observer-end').value = time.toISOString().slice(11, 19);
        document.getElementById('observer-next').checked =
          time.toISOString().slice(0, 10) !== '2000-01-01';
      });
      await page.locator('#observer-form button[type=submit]').click();
      await page.waitForFunction(
        () => ObserverUI.result?.result.total === 11,
        {},
        { timeout: 45000 },
      );
      await page.click('#observer-word');
      await page.waitForFunction(
        () => !document.getElementById('observer-download').hidden,
        {},
        { timeout: 30000 },
      );
      const bytes = await page.evaluate(async () =>
        Array.from(
          new Uint8Array(await (await StateStore.get('observer-word')).blob.arrayBuffer()),
        ),
      );
      const xml = require('./check-browser-inventory.cjs').docxXml(Buffer.from(bytes));
      assert(!/[\u0620-\u064a]/.test(xml), 'fleet report Word is fully English');
      await page.click('#shell-nav-map');
      await page.click('#map-fleet-open');
      await page.click('#fleet-pass-country');
      assert.equal(await page.locator('#report-scope').inputValue(), 'fleet');
      await page.evaluate(() => {
        const ids = MapFleet.objects().map((o) => o.id);
        if (ids.length !== 11 || watchlist.items.length)
          throw Error('scope must preserve independent map selection');
      });
      await page.click('#report-run');
      await page.waitForFunction(() => finishedReport?.result.total === 11, {}, { timeout: 60000 });
      assert.equal(await page.evaluate(() => finishedReport.archive.payload.objects.length), 11);
      assert.equal(await page.evaluate(() => document.body.scrollWidth), mobile ? 390 : 1440);
      assert(requests.every((r) => r.method === 'GET' && !r.body));
      assert(
        requests.every((r) => !r.url.includes('24.123456') && !r.url.includes(String(site.lon))),
      );
      assert.equal(await page.evaluate(() => localStorage.getItem('orbit-cache-map-fleet')), null);
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
  console.log(
    'PASS: lazy twelve-satellite next passes, real overhead/clipped geometry, fixed-time countdown, site/selection invalidation, hidden-worker cancellation/resume, independent country/site report scopes, English Word, mobile layout and zero uploads',
  );
}
module.exports = { checkBrowserFleetPasses };
