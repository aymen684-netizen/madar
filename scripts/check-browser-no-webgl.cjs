const assert = require('node:assert/strict'),
  fs = require('node:fs');
async function checkBrowserNoWebGL(browser, url, output) {
  const fixture = {
    ...JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json')),
    EPOCH: new Date().toISOString(),
  };
  for (const mobile of [false, true])
    for (const failure of ['webgl', 'compat-script', 'no-canvas']) {
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
        isMobile: mobile,
        hasTouch: mobile,
        madarWelcome: true,
      });
      await context.addInitScript(
        ({ en, noCanvas }) => {
          if (en) localStorage.setItem('madar-language', 'en');
          localStorage.setItem('madar-save-enabled', 'false');
          const getContext = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
            return noCanvas || /webgl/i.test(kind) ? null : getContext.call(this, kind, ...args);
          };
        },
        { en: !mobile, noCanvas: failure === 'no-canvas' },
      );
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
            failure === 'no-canvas'
              ? mobile
                ? 'الخارطة غير متاحة'
                : 'map is unavailable'
              : mobile
                ? 'خارطة ثنائية الأبعاد'
                : '2D map',
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
        if (failure === 'no-canvas') {
          assert.equal(await page.locator('#flat-map').count(), 0);
          releaseData();
          await page.waitForFunction(() => objects.length === 1 && !catalogLoading);
          continue;
        }
        await page.click('#shell-nav-map');
        assert(!(await page.locator('#map-error').isVisible()));
        assert(await page.locator('#flat-map-canvas').isVisible());
        for (const id of ['plus', 'minus', 'reset', 'focus'])
          assert(await page.locator('#' + id).isDisabled());
        releaseData();
        await page.waitForFunction(() => objects.length === 1 && !catalogLoading);
        await page.waitForFunction(
          () => document.getElementById('flat-map-select').options.length === 2,
        );
        const point = await page.evaluate(() => {
          const canvas = document.getElementById('flat-map-canvas'),
            box = canvas.getBoundingClientRect(),
            width = Math.min(box.width, box.height * 2),
            height = width / 2,
            p = position(objects[0]),
            xy = FlatMap.project(p.lat, p.lng, {
              x: (box.width - width) / 2,
              y: (box.height - height) / 2,
              width,
              height,
            });
          return { x: box.x + xy.x, y: box.y + xy.y };
        });
        if (mobile) await page.touchscreen.tap(point.x, point.y);
        else await page.mouse.click(point.x, point.y);
        await page.locator('#globe-card').waitFor({ state: 'visible' });
        assert.equal(await page.evaluate(() => selection.current.id), 100001);
        await page.click('#globe-card-close');
        await page.selectOption('#flat-map-select', '100001');
        await page.locator('#globe-card').waitFor({ state: 'visible' });
        await page.click('#globe-card-close');
        const beforeTime = await page
          .locator('#flat-map-canvas')
          .evaluate((node) => node.toDataURL());
        await page.evaluate(() => {
          fixedTime = new Date(Date.now() + 3600000);
          update();
        });
        assert.notEqual(
          await page.locator('#flat-map-canvas').evaluate((node) => node.toDataURL()),
          beforeTime,
          '2D positions follow the scene clock',
        );
        await page.screenshot({ path: output + '/flat-map-' + failure + '-' + mobile + '.png' });
        await page.click('#shell-nav-catalog');
        await page.locator('#list button').first().click();
        assert.equal(await page.evaluate(() => selection.current.id), 100001);
        assert.equal(await page.evaluate(() => MadarShell.current()), 'catalog');
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
        await page.evaluate(() => {
          const seed = OrbitData.serialize(objects[0]);
          objects = prepare(
            Array.from({ length: 620 }, (_, i) => ({
              ...seed,
              id: 100001 + i,
              name: 'FLAT MAP ' + i,
            })),
          );
          choose(objects[619], false);
          renderList();
          update();
        });
        await page.click('#shell-nav-map');
        await page.waitForFunction(
          () => document.getElementById('flat-map-select').options.length === 501,
        );
        assert.equal(
          await page.locator('#flat-map-select').inputValue(),
          '100620',
          'selected satellite survives the display cap',
        );
        assert.equal(await page.locator('#flat-map-count').textContent(), '500 / 620');
        await page.click('#shell-nav-catalog');
        await page.fill('#search', 'FLAT MAP 619');
        await page.click('#shell-nav-map');
        await page.waitForFunction(
          () => document.getElementById('flat-map-count').textContent === '1 / 1',
        );
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
    'PASS: 2D fallback without WebGL, real mouse/touch and accessible selection, scene clock, capped/filterable markers, catalog/favorites and real observer reports; no-Canvas entry on bilingual desktop/mobile',
  );
}
module.exports = { checkBrowserNoWebGL };
