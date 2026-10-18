const assert = require('node:assert/strict'),
  fs = require('node:fs');
async function checkBrowserOrbitFilter(browser, url, output) {
  const seed = JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json'));
  const fixtures = (length) =>
    Array.from({ length }, (_, i) => ({
      ...seed,
      NORAD_CAT_ID: 100001 + i,
      OBJECT_NAME: 'ORBIT FILTER ' + i,
      EPOCH: new Date().toISOString(),
      MEAN_MOTION: [15.5, 2, 1.0027, 0.5][i % 4],
      ECCENTRICITY: 0.001,
      MEAN_ANOMALY: (i * 37) % 360,
    }));
  async function setup(mobile, data) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const pattern of ['https://celestrak.org/**', '**/api/orbits?*'])
      await page.route(pattern, (route) =>
        route.fulfill({
          contentType: 'application/json',
          headers: { 'X-Madar-Fetched-At': String(Date.now()), 'X-Madar-Connection': 'upstream' },
          body: JSON.stringify(data),
        }),
      );
    await page.goto(url);
    try {
      await page.waitForFunction(
        (n) => window.MapOrbitFilter && window.MapFleet && world && objects.length === n,
        data.length,
      );
    } catch (error) {
      console.error('Orbit fixture startup', {
        errors,
        state: await page.evaluate(() => ({
          filter: !!window.MapOrbitFilter,
          fleet: !!window.MapFleet,
          globe: !!world,
          count: objects.length,
          status: document.getElementById('status').textContent,
        })),
      });
      await context.close();
      throw error;
    }
    await page.evaluate(() => MadarI18n.ready);
    return { context, page, errors };
  }
  for (const mobile of [false, true]) {
    const { context, page, errors } = await setup(mobile, fixtures(12));
    try {
      await page.evaluate(() => {
        fixedTime = new Date();
        for (const o of objects) MapFleet.toggle(o);
        choose(objects[0], false);
        update();
      });
      await page.waitForFunction(() => world.pointsData().length === 12);
      const before = await page.evaluate(() => ({
        ids: MapFleet.snapshot().items.map((e) => e.object.id),
        colors: MapFleet.snapshot().items.map((e) => MapFleet.color(e.object.id)),
        catalog: rows().map((o) => o.id),
        reportScope: document.getElementById('report-scope').value,
        favorites: watchlist.items.map((o) => o.id),
      }));
      for (const language of ['ar', 'en']) {
        await page.evaluate((language) => MadarI18n.setLanguage(language), language);
        const buttons = page.locator('#orbit-legend button');
        assert.equal(await buttons.count(), 4);
        if (mobile) {
          const legendBox = await page.locator('#orbit-legend').boundingBox();
          const cardBox = await page.locator('#globe-card').boundingBox();
          assert(
            cardBox.y + cardBox.height <= legendBox.y,
            'the selected satellite card must leave orbit buttons accessible',
          );
        }
        const leo = page.locator('#orbit-legend [data-orbit="leo"]');
        await leo.click();
        assert.equal(await leo.getAttribute('aria-pressed'), 'false');
        await page.waitForFunction(() => world.pointsData().length === 9);
        assert.equal(
          await page.evaluate(() =>
            [...pickableSatellites()].every(([, o]) => OrbitAppearance.category(o) !== 'leo'),
          ),
          true,
        );
        assert.equal(
          await page.evaluate(() =>
            world.htmlElementsData().every((p) => OrbitAppearance.category(p.obj) !== 'leo'),
          ),
          true,
        );
        assert.equal(
          await page.evaluate(() =>
            world.pathsData().every((p) => ![100001, 100005, 100009].includes(p.fleetId)),
          ),
          true,
        );
        for (const type of ['meo', 'geo', 'other'])
          await page.locator(`#orbit-legend [data-orbit="${type}"]`).click();
        await page.waitForFunction(
          () =>
            world.pointsData().length === 0 &&
            world.pathsData().length === 0 &&
            world.htmlElementsData().length === 0 &&
            world.particlesData().length === 0,
        );
        assert.equal(await page.locator('#count').innerText(), '0');
        const geo = page.locator('#orbit-legend [data-orbit="geo"]');
        await geo.focus();
        await page.keyboard.press('Space');
        await page.waitForFunction(() => world.pointsData().length === 3);
        assert.equal(await geo.getAttribute('aria-pressed'), 'true');
        assert.equal(
          await page.evaluate(() =>
            world.pointsData().every((p) => OrbitAppearance.category(p.obj) === 'geo'),
          ),
          true,
        );
        const box = await page.locator('#orbit-legend').boundingBox();
        assert(box.x >= 0 && box.x + box.width <= (mobile ? 390 : 1440));
        for (const button of await buttons.all()) assert((await button.boundingBox()).height >= 44);
        await page.screenshot({
          path: `${output}/orbit-filter-${language}-${mobile ? 'mobile' : 'desktop'}.png`,
        });
        for (const type of ['leo', 'meo', 'other'])
          await page.locator(`#orbit-legend [data-orbit="${type}"]`).click();
        await page.waitForFunction(() => world.pointsData().length === 12);
      }
      const after = await page.evaluate(() => ({
        ids: MapFleet.snapshot().items.map((e) => e.object.id),
        colors: MapFleet.snapshot().items.map((e) => MapFleet.color(e.object.id)),
        catalog: rows().map((o) => o.id),
        reportScope: document.getElementById('report-scope').value,
        favorites: watchlist.items.map((o) => o.id),
      }));
      assert.deepEqual(
        after,
        before,
        'orbit visibility preserves twelve selections, colors, catalog, favorites and report scope',
      );
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
  // Exercise worker-rendered points, then transition to and from the sparse renderer.
  const { context, page, errors } = await setup(false, fixtures(3200));
  try {
    await page.waitForFunction(
      () => world.particlesData().reduce((n, group) => n + group.length, 0) === 3200,
    );
    await page.locator('#orbit-legend [data-orbit="leo"]').click();
    await page.waitForFunction(
      () =>
        world.particlesData().reduce((n, group) => n + group.length, 0) === 2400 &&
        world.particlesData().every((g) => g.regime !== 'leo'),
    );
    await page.locator('#orbit-legend [data-orbit="other"]').click();
    await page.waitForFunction(
      () => world.particlesData().reduce((n, group) => n + group.length, 0) === 1600,
    );
    await page.locator('#orbit-legend [data-orbit="geo"]').click();
    await page.waitForFunction(
      () => world.particlesData().length === 0 && world.pointsData().length === 800,
    );
    assert.equal(
      await page.evaluate(() =>
        world.pointsData().every((p) => OrbitAppearance.category(p.obj) === 'meo'),
      ),
      true,
    );
    await page.locator('#orbit-legend [data-orbit="geo"]').click();
    await page.waitForFunction(
      () =>
        world.pointsData().length === 0 &&
        world.particlesData().reduce((n, group) => n + group.length, 0) === 1600,
    );
    assert.equal(await page.evaluate(() => rows().length), 3200);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
  console.log(
    'PASS: orbit buttons in Arabic/English on desktop/mobile, markers/flags/paths, twelve retained selections and dense-worker transitions',
  );
}
module.exports = { checkBrowserOrbitFilter };
