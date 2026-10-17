const assert = require('node:assert/strict'),
  fs = require('node:fs');
async function checkBrowserMapFleet(browser, url, output) {
  const seed = JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json')),
    data = Array.from({ length: 13 }, (_, i) => ({
      ...seed,
      NORAD_CAT_ID: 100001 + i,
      OBJECT_NAME: 'FLEET TEST ' + String(i + 1).padStart(2, '0'),
      EPOCH: '2026-10-16T00:00:00Z',
      MEAN_ANOMALY: (seed.MEAN_ANOMALY + i * 20) % 360,
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
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) =>
      requests.push({ url: r.url(), method: r.method(), body: r.postData() }),
    );
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
      await page.goto(url);
      await page.waitForFunction(() => window.MapFleet && objects.length === 13 && world);
      await page.evaluate(() => MadarI18n.ready);
      for (let i = 1; i <= 2; i++) {
        await page.click('#shell-nav-catalog');
        await page.fill('#search', 'FLEET TEST ' + String(i).padStart(2, '0'));
        await page.locator('#list button[data-satellite-id="' + (100000 + i) + '"]').click();
        if (i === 1) {
          if (mobile) await page.click('#shell-card-expand');
          const buttons = await page.evaluate(() =>
            ['globe-card-favorite', 'globe-card-fleet', 'globe-card-source', 'track-selected'].map(
              (id) => {
                const el = document.getElementById(id),
                  s = getComputedStyle(el),
                  r = el.getBoundingClientRect();
                return {
                  id,
                  width: r.width,
                  height: r.height,
                  font: s.fontSize,
                  padding: s.padding,
                  borders: [
                    s.borderLeftWidth,
                    s.borderRightWidth,
                    s.borderTopWidth,
                    s.borderBottomWidth,
                  ],
                };
              },
            ),
          );
          for (const b of buttons) {
            assert.equal(b.font, buttons[0].font);
            assert.equal(b.width, buttons[0].width);
            assert.equal(b.padding, buttons[0].padding);
            assert(b.height >= 44);
            assert.equal(new Set(b.borders).size, 1);
          }
          await page.screenshot({
            path: output + '/card-actions-' + (mobile ? 'mobile' : 'desktop') + '.png',
          });
        }
        await page.click('#globe-card-fleet');
        assert.equal(await page.evaluate(() => MapFleet.size), i);
      }
      await page.click('#globe-card-close');
      await page.click('#map-fleet-open');
      const heading = await page.locator('#map-fleet-panel>summary').boundingBox(),
        sheetHead = await page.locator('.map-sheet-head').boundingBox();
      assert(
        heading.y >= sheetHead.y + sheetHead.height - 1,
        'fleet title must be visible below the sticky sheet header',
      );
      await page.check('#map-fleet-multi');
      await page.click('#map-tools-close');
      await page.evaluate(() => {
        for (const o of objects.slice(2, 12)) mapChoose(o, false);
      });
      await page.waitForFunction(() => MapFleet.size === 12 && world.pathsData().length > 0);
      const before = await page.evaluate(() => MapFleet.snapshot());
      await page.evaluate(() => mapChoose(objects[12], false));
      assert.equal(await page.evaluate(() => MapFleet.size), 12);
      assert((await page.locator('#globe-card-fleet').innerText()).includes('12'));
      assert.equal(await page.evaluate(() => favorites.length), 0);
      await page.click('#globe-card-close');
      await page.click('#map-fleet-open');
      await page.uncheck('#map-fleet-multi');
      await page.check('#map-fleet-only');
      await page.waitForFunction(() => world.pointsData().length === 12);
      assert.equal(await page.locator('#map-fleet-list li').count(), 12);
      const drawn = await page.evaluate(() => ({
        ids: world.pointsData().map((p) => p.id),
        paths: world
          .pathsData()
          .map((p) => ({ id: p.fleetId, color: p.fleetColor, points: p.length })),
        colors: MapFleet.snapshot().items.map((e) => MapFleet.color(e.object.id)),
        records: MapFleet.snapshot().items,
      }));
      assert.equal(new Set(drawn.colors).size, 12);
      assert(drawn.ids.every((id) => before.items.some((e) => e.object.id === id)));
      assert(drawn.paths.length <= 12 && drawn.paths.every((p) => p.points <= 81));
      await page.screenshot({
        path: output + '/map-fleet-list-' + (mobile ? 'mobile' : 'desktop') + '.png',
      });
      await page.uncheck('#map-fleet-paths');
      assert.equal(await page.evaluate(() => world.pathsData().length), 0);
      await page.check('#map-fleet-paths');
      await page.click('#map-tools-close');
      await page.screenshot({
        path: output + '/map-fleet-scene-' + (mobile ? 'mobile' : 'desktop') + '.png',
      });
      await page.reload();
      await page.waitForFunction(
        () => window.MapFleet?.size === 12 && world?.pointsData().length === 12,
      );
      assert.equal(await page.evaluate(() => MapFleet.isolated), true);
      assert.deepEqual(
        await page.evaluate(() =>
          MapFleet.snapshot().items.map((e) => MapFleet.color(e.object.id)),
        ),
        drawn.colors,
      );
      await page.click('#map-fleet-open');
      await page.locator('#map-fleet-list .fleet-remove').first().click();
      assert.equal(await page.evaluate(() => MapFleet.size), 11);
      await page.click('#map-tools-close');
      await page.evaluate(() => choose(objects[12], false));
      await page.click('#globe-card-fleet');
      assert.equal(await page.evaluate(() => MapFleet.size), 12);
      await page.click('#globe-card-close');
      await page.click('#language-toggle');
      await page.click('#map-fleet-open');
      await page.waitForFunction(() => document.documentElement.lang === 'en');
      const english = await page.locator('#map-fleet-panel').innerText();
      assert(!/[\u0620-\u064a]/.test(english), english);
      await page.screenshot({
        path: output + '/map-fleet-en-' + (mobile ? 'mobile' : 'desktop') + '.png',
      });
      await page.click('#map-fleet-clear');
      assert.equal(await page.evaluate(() => MapFleet.size), 0);
      assert.equal(await page.evaluate(() => MapFleet.isolated), false);
      assert(await page.locator('#map-fleet-only').isDisabled());
      assert.equal(await page.evaluate(() => document.body.scrollWidth), mobile ? 390 : 1440);
      assert(requests.every((r) => r.method === 'GET' && !r.body));
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    page = await context.newPage();
  await context.addInitScript(() => localStorage.setItem('madar-save-enabled', 'false'));
  await page.route('https://celestrak.org/**', (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(data) }),
  );
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.MapFleet && objects.length === 13);
    await page.evaluate(() => MapFleet.toggle(objects[0]));
    assert.equal(await page.evaluate(() => MapFleet.size), 1);
    assert.equal(await page.evaluate(() => localStorage.getItem('orbit-cache-map-fleet')), null);
    await page.reload();
    await page.waitForFunction(() => window.MapFleet && objects.length === 13);
    assert.equal(await page.evaluate(() => MapFleet.size), 0);
  } finally {
    await context.close();
  }
  console.log(
    'PASS: 12 map satellites, stable colors, shared view and paths, thirteenth rejected, remove/replace, reload, complete catalog isolation, bilingual touch UI, zero uploads and session-only privacy',
  );
}
module.exports = { checkBrowserMapFleet };
