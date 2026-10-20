const assert = require('node:assert/strict'),
  fs = require('node:fs');
async function checkBrowserNoWebGL(browser, url, output) {
  const fixture = {
    ...JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json')),
    EPOCH: new Date().toISOString(),
  };
  for (const mobile of [false, true])
    for (const failure of ['webgl', 'compat-script']) {
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
        isMobile: mobile,
        hasTouch: mobile,
        madarWelcome: true,
      });
      await context.addInitScript((en) => {
        if (en) localStorage.setItem('madar-language', 'en');
        localStorage.setItem('madar-save-enabled', 'false');
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
          return /webgl/i.test(kind) ? null : getContext.call(this, kind, ...args);
        };
      }, !mobile);
      const page = await context.newPage(),
        errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      let releaseData, releaseRenderer;
      const dataReady = new Promise((resolve) => (releaseData = resolve)),
        rendererReady = new Promise((resolve) => (releaseRenderer = resolve));
      for (const pattern of ['https://celestrak.org/**', '**/api/orbits?*'])
        await page.route(pattern, async (route) => {
          await dataReady;
          await route.fulfill({
            contentType: 'application/json',
            headers: { 'X-Madar-Fetched-At': String(Date.now()), 'X-Madar-Connection': 'upstream' },
            body: JSON.stringify([fixture]),
          });
        });
      await page.route('**/vendor/globe-compat.min.js', async (route) => {
        if (failure === 'compat-script') return route.abort();
        // Exercise failure after the welcome listener is installed as well as
        // an early script failure that the welcome must detect from stored state.
        await rendererReady;
        await route.continue();
      });
      try {
        const navigation = page.goto(url);
        await page.waitForFunction(
          () => document.getElementById('welcome-language').disabled === false,
        );
        releaseRenderer();
        await navigation;
        await page.waitForFunction(
          () => document.getElementById('globe').dataset.renderState === 'unavailable',
        );
        await page.waitForFunction(() => !document.getElementById('welcome-start').disabled);
        await page.evaluate(() => MadarI18n.ready);
        assert.equal(await page.evaluate(() => world), null);
        assert.equal(
          await page.evaluate(() => objects.length),
          0,
          'entry does not wait for orbital data',
        );
        for (const id of ['welcome-track', 'welcome-country', 'welcome-report'])
          assert(await page.locator('#' + id).isEnabled());
        assert(
          (await page.locator('.welcome-note').innerText()).includes(
            mobile ? 'الخارطة غير متاحة' : 'map is unavailable',
          ),
        );
        await page.screenshot({
          path: output + '/no-webgl-welcome-' + failure + '-' + mobile + '.png',
        });
        await page.locator('#welcome-start').press('Enter');
        assert(!(await page.locator('#welcome-dialog').isVisible()));
        assert.equal(await page.evaluate(() => MadarShell.current()), 'catalog');
        await page.click('#shell-nav-reports');
        assert(await page.locator('#shell-reports').isVisible());
        await page.click('#shell-nav-map');
        assert(await page.locator('#map-error').isVisible());
        assert(
          (await page.locator('#map-error').innerText()).includes(
            mobile ? 'دليل الأقمار والتقارير' : 'satellite catalog and reports',
          ),
        );
        for (const id of ['plus', 'minus', 'reset', 'focus'])
          assert(await page.locator('#' + id).isDisabled());
        releaseData();
        await page.waitForFunction(() => objects.length === 1 && !catalogLoading);
        await page.click('#shell-nav-catalog');
        await page.locator('#list button').first().click();
        assert.equal(await page.evaluate(() => selection.current.id), 100001);
        assert(await page.locator('#favorite').isVisible());
        await page.click('#favorite');
        await page.waitForFunction(() => watchlist.has(100001));
        await page.click('#shell-nav-reports');
        await page.click('#shell-report-observer');
        await page.click('#observer-guide-toggle');
        await page.fill('#observer-lat', '0');
        await page.fill('#observer-lon', '45');
        await page.fill('#observer-date', fixture.EPOCH.slice(0, 10));
        await page.fill('#observer-start', '00:00:00');
        await page.fill('#observer-end', '00:05:00');
        await page.selectOption('#observer-scope', 'selected');
        await page.uncheck('#observer-next');
        await page.locator('#observer-form button[type=submit]').click();
        await page.waitForFunction(
          () => ObserverUI.result && document.getElementById('observer-progress').value === 100,
        );
        assert.equal(
          await page.evaluate(() => world),
          null,
          'report computation does not need a renderer',
        );
        assert(await page.locator('#observer-results').isVisible());
        await page.screenshot({
          path: output + '/no-webgl-report-' + failure + '-' + mobile + '.png',
        });
        assert.deepEqual(errors, []);
      } catch (error) {
        console.error('No-WebGL diagnostic', { mobile, failure, errors });
        await page.screenshot({
          path: output + '/no-webgl-failure-' + failure + '-' + mobile + '.png',
        });
        throw error;
      } finally {
        releaseData();
        releaseRenderer();
        await context.close();
      }
    }
  console.log(
    'PASS: unavailable WebGL and failed compatibility download allow bilingual desktop/mobile entry before data, catalog selection/favorites and real observer reports without a renderer',
  );
}
module.exports = { checkBrowserNoWebGL };
