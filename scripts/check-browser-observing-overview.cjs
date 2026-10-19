const fs = require('node:fs'),
  assert = require('node:assert/strict');
async function checkBrowserObservingOverview(browser, url, output) {
  const fixture = JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json'));
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    await context.addInitScript(() => {
      localStorage.setItem('madar-save-enabled', 'false');
      window.__overviewWorkers = 0;
      const OriginalWorker = window.Worker;
      window.Worker = class extends OriginalWorker {
        constructor(url, options) {
          super(url, options);
          if (String(url).includes('fleet-pass-worker.js')) window.__overviewWorkers++;
        }
      };
    });
    const page = await context.newPage(),
      errors = [],
      requests = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => requests.push(r.url() + (r.postData() || '')));
    for (const route of ['**/api/orbits?*', 'https://celestrak.org/**'])
      await page.route(route, (r) =>
        r.fulfill({
          contentType: 'application/json',
          headers: { 'X-Madar-Fetched-At': String(Date.now()), 'X-Madar-Connection': 'upstream' },
          body: JSON.stringify([fixture]),
        }),
      );
    try {
      await page.goto(url);
      await page.waitForFunction(
        () => window.MadarShell && typeof objects !== 'undefined' && objects.length === 1,
      );
      await page.evaluate(() => MadarI18n.ready);
      if (mobile) {
        await page.click('#language-toggle');
        await page.waitForFunction(() => document.documentElement.lang === 'en');
      }
      await page.click('#shell-nav-catalog');
      await page.locator('#list button').first().click();
      if (!(await page.locator('#globe-card-fleet').isVisible()))
        await page.click('#shell-card-expand');
      await page.click('#globe-card-fleet');
      await page.click('#map-fleet-open');
      await page.waitForSelector('#observing-overview');
      assert.equal(await page.locator('#observing-count').innerText(), '1 / 12');
      assert(await page.locator('#observing-sky').isDisabled());
      await page.fill('#fleet-pass-height', '123');
      await page.selectOption('#fleet-pass-zone', '0');
      await page.click('#fleet-pass-city-picker>summary');
      await page.fill('#fleet-pass-city-search', 'Riyadh');
      await page.press('#fleet-pass-city-search', 'Enter');
      assert.equal(await page.locator('#fleet-pass-lat').inputValue(), '');
      assert.equal(await page.locator('#fleet-pass-city-select option').count(), 2);
      await page.selectOption('#fleet-pass-city-select', 'riyadh');
      await page.click('#fleet-pass-city-apply');
      assert.equal(await page.locator('#fleet-pass-lat').inputValue(), '24.634497');
      assert.equal(await page.locator('#fleet-pass-lon').inputValue(), '46.720487');
      assert.equal(await page.locator('#fleet-pass-height').inputValue(), '123');
      assert.equal(await page.locator('#fleet-pass-zone').inputValue(), '0');
      assert.equal(
        await page.evaluate(() => __overviewWorkers),
        0,
        'choosing a city never starts calculation',
      );
      await page.fill('#fleet-pass-city-search', 'PRIVATE_CITY_QUERY');
      assert.equal(await page.locator('#fleet-pass-city-select option').count(), 1);
      assert(await page.locator('#fleet-pass-city-apply').isDisabled());
      assert.equal(await page.locator('#fleet-pass-lat').inputValue(), '24.634497');
      await page.click('#map-tools-close');
      await page.click('#shell-nav-reports');
      await page.click('#shell-report-observer');
      await page.fill('#observer-height', '77');
      await page.click('#observer-city-picker>summary');
      await page.fill('#observer-city-search', 'القاهرة');
      await page.selectOption('#observer-city-select', 'cairo');
      await page.click('#observer-city-apply');
      assert.equal(await page.locator('#observer-lat').inputValue(), '30.051906');
      assert.equal(await page.locator('#observer-height').inputValue(), '77');
      assert.equal(
        await page.locator('#observer-site-select option').count(),
        1,
        'city choice is not saved as a site',
      );
      await page.click('#shell-nav-map');
      await page.click('#map-fleet-open');
      assert.equal(await page.locator('#fleet-pass-lat').inputValue(), '24.634497');
      const p = await page.evaluate(() => {
        const t = OrbitData.epoch(objects[0]);
        fixedTime = new Date(t);
        paused = false;
        timeControls.sync();
        update();
        const p = position(objects[0], new Date(t));
        return { lat: p.lat, lon: p.lng };
      });
      await page.fill('#fleet-pass-name', 'PRIVATE_CITY_SITE');
      await page.fill('#fleet-pass-lat', String(p.lat));
      await page.fill('#fleet-pass-lon', String(p.lon));
      await page.click('#observing-calculate');
      await page.waitForFunction(
        () => document.getElementById('fleet-pass-list').children.length === 1,
        {},
        { timeout: 90000 },
      );
      assert((await page.locator('#observing-next').innerText()).includes('100001'));
      assert((await page.locator('#observing-site').innerText()).includes('PRIVATE_CITY_SITE'));
      assert((await page.locator('#observing-geometry').innerText()).includes('123'));
      assert(!(await page.locator('#observing-sky').isDisabled()));
      await page.locator('#observing-overview').scrollIntoViewIfNeeded();
      await page.screenshot({ path: output + '/observing-overview-' + mobile + '.png' });
      await page.click('#observing-sky');
      assert(await page.locator('#fleet-sky-view .fleet-sky').isVisible());
      assert.equal(await page.evaluate(() => document.activeElement.id), 'fleet-sky-view');
      await page.click('#observing-group');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'map-fleet-list');
      await page.click('#observing-edit');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'fleet-pass-lat');
      await page.fill('#fleet-pass-lat', '0');
      assert.equal(await page.locator('#observing-next').innerText(), '');
      assert(await page.locator('#observing-sky').isDisabled());
      if (mobile)
        assert(!/[\u0620-\u064a]/.test(await page.locator('#observing-overview').innerText()));
      assert(
        !requests.some((r) => /PRIVATE_CITY_QUERY|PRIVATE_CITY_SITE/.test(decodeURIComponent(r))),
        'city queries and site names stay local',
      );
      assert.equal(await page.evaluate(() => localStorage.getItem(ObserverSitesCore.KEY)), null);
      assert.deepEqual(errors, []);
    } catch (error) {
      console.error(
        'Observing overview diagnostic',
        mobile,
        await page.evaluate(() => ({
          mode: document.body.dataset.shellView,
          status: document.getElementById('fleet-pass-status')?.textContent,
          overview: document.getElementById('observing-state')?.textContent,
          workers: window.__overviewWorkers,
        })),
        errors,
      );
      await page.screenshot({ path: output + '/observing-overview-failure-' + mobile + '.png' });
      throw error;
    } finally {
      await context.close();
    }
  }
  console.log(
    'PASS: local bilingual city search, explicit apply without saving/calculation, preserved height/timezone, private query, independent forms, real pass summary, sky/group/site shortcuts and stale-result invalidation on mobile/desktop',
  );
}
module.exports = { checkBrowserObservingOverview };
