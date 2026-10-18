const fs = require('node:fs'),
  assert = require('node:assert/strict');
async function checkBrowserFleetExperience(browser, baseUrl, output) {
  const seed = JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json')),
    data = Array.from({ length: 12 }, (_, i) => ({
      ...seed,
      NORAD_CAT_ID: 100001 + i,
      OBJECT_NAME: 'EXPERIENCE ' + i,
    }));
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
        acceptDownloads: true,
      }),
      page = await context.newPage(),
      requests = [],
      errors = [];
    await context.addInitScript(() => {
      localStorage.setItem('madar-save-enabled', 'false');
    });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) =>
      requests.push({ url: r.url(), method: r.method(), body: r.postData() }),
    );
    for (const pattern of ['**/api/orbits?*', 'https://celestrak.org/**'])
      await page.route(pattern, (r) =>
        r.fulfill({
          contentType: 'application/json',
          headers: { 'X-Madar-Fetched-At': String(Date.now()), 'X-Madar-Connection': 'upstream' },
          body: JSON.stringify(data),
        }),
      );
    try {
      await page.goto(baseUrl);
      await page.waitForFunction(
        () => window.PassMap && window.MapFleet && objects.length === 12 && world,
      );
      const site = await page.evaluate(() => {
        for (const o of objects) MapFleet.toggle(o);
        fixedTime = new Date(OrbitData.epoch(objects[0]));
        paused = false;
        const p = position(prepare([objects[0]])[0]);
        update();
        return { lat: p.lat, lon: p.lng };
      });
      await page.click('#map-fleet-open');
      await page.waitForSelector('#fleet-pass-form');
      await page.fill('#fleet-pass-lat', String(site.lat));
      await page.fill('#fleet-pass-lon', String(site.lon));
      await page.click('#fleet-pass-run');
      await page.waitForFunction(
        () => document.querySelectorAll('.fleet-timeline-row').length === 12,
        {},
        { timeout: 90000 },
      );
      assert((await page.locator('.fleet-timeline-pass').count()) >= 12);
      assert.equal(await page.locator('.fleet-sky').count(), 1);
      await page.locator('#fleet-timeline').scrollIntoViewIfNeeded();
      const labelBounds = await page.locator('.fleet-timeline-row > span').first().boundingBox(),
        timelineBounds = await page.locator('#fleet-timeline').boundingBox();
      assert(
        labelBounds.x >= timelineBounds.x &&
          labelBounds.x + labelBounds.width <= timelineBounds.x + timelineBounds.width,
        'satellite labels are visible at the initial Arabic scroll position',
      );
      await page.screenshot({
        path: output + '/fleet-timeline-' + (mobile ? 'mobile' : 'desktop') + '.png',
        animations: 'disabled',
        timeout: 60000,
      });
      await page.check('#fleet-alerts');
      await page.waitForFunction(() =>
        document.getElementById('fleet-alert-status').textContent.includes('مثبت'),
      );
      await page.locator('#fleet-compare summary').click();
      await page.locator('#fleet-compare-options input').nth(0).check();
      await page.locator('#fleet-compare-options input').nth(1).check();
      await page.click('#fleet-compare-run');
      assert.equal(await page.locator('#fleet-compare-result table tr').count(), 8);
      assert((await page.locator('#fleet-compare-result').innerText()).includes('EXPERIENCE 0'));
      const downloadEvent = page.waitForEvent('download');
      await page.getByText('تنزيل موعد التقويم ICS', { exact: true }).click();
      const downloaded = await downloadEvent,
        ics = fs.readFileSync(await downloaded.path(), 'utf8');
      assert(
        ics.includes('BEGIN:VEVENT') && ics.includes('DTSTART:') && !ics.includes('LOCATION:'),
      );
      const entry = await page.evaluate(() => document.querySelector('.fleet-timeline-pass').title);
      await page.screenshot({
        path: output + '/fleet-experience-' + (mobile ? 'mobile' : 'desktop') + '.png',
        animations: 'disabled',
        timeout: 60000,
      });
      await page.locator('.fleet-timeline-pass').first().click();
      await page.waitForFunction(
        () => document.getElementById('map-tools-dialog').open === false && selection.byUser,
      );
      assert.equal(
        await page.evaluate(() => world.pointsData().some((p) => p.id === selection.current.id)),
        true,
      );
      assert.equal(await page.evaluate(() => !!fixedTime), true);
      assert(entry.includes('EXPERIENCE'));
      if (!mobile) {
        const gap = await page.evaluate(
          () =>
            document.getElementById('globe-card').getBoundingClientRect().top -
            document.getElementById('clock').getBoundingClientRect().bottom,
        );
        assert(gap >= 8, 'both calendar lines remain above the desktop card');
      }
      // Boundary is independent of orbit paths and cannot accumulate on successive frames.
      await page.evaluate(() => {
        document.getElementById('visibility-footprint').checked = true;
        update();
        update();
      });
      assert.equal(
        await page.evaluate(() => world.pathsData().filter((p) => p.visibilityBoundary).length),
        1,
      );
      assert.equal(
        await page.evaluate(() => world.pathsData().find((p) => p.visibilityBoundary).length),
        73,
      );
      await page.screenshot({
        path: output + '/map-card-clock-ar-' + (mobile ? 'mobile' : 'desktop') + '.png',
        animations: 'disabled',
        timeout: 60000,
      });
      await page.click('#language-toggle');
      await page.click('#map-fleet-open');
      await page.locator('#fleet-event-detail').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.documentElement.lang === 'en');
      assert(
        (await page.locator('#clock').innerText()).startsWith('Gregorian:'),
        'fixed map time follows language changes immediately',
      );
      assert(
        !/[\u0620-\u064a]/.test(await page.locator('#fleet-experience').innerText()),
        'new tools translate completely',
      );
      await page.screenshot({
        path: output + '/fleet-experience-en-' + (mobile ? 'mobile' : 'desktop') + '.png',
        animations: 'disabled',
        timeout: 60000,
      });
      await page.click('#map-tools-close');
      await page.screenshot({
        path: output + '/map-card-clock-en-' + (mobile ? 'mobile' : 'desktop') + '.png',
        animations: 'disabled',
        timeout: 60000,
      });
      if (!mobile) {
        const gap = await page.evaluate(
          () =>
            document.getElementById('globe-card').getBoundingClientRect().top -
            document.getElementById('clock').getBoundingClientRect().bottom,
        );
        assert(gap >= 8);
        assert(
          !requests.some((r) => r.url.includes('earth-detail.jpg')),
          '8K texture is absent from default loading',
        );
        await page.evaluate(() => RenderQuality.setMode('detail'));
        await page.waitForFunction(
          () =>
            world.globeImageUrl() === 'assets/earth-detail.jpg' ||
            world.renderer().capabilities.maxTextureSize < 8192,
        );
        await page.evaluate(() => RenderQuality.setMode('economy'));
        assert.equal(await page.evaluate(() => world.globeImageUrl()), 'assets/earth.jpg');
      }
      // Archived replay uses its own orbital model, even if the catalog has the same ID.
      const replay = await page.evaluate(() => {
        document.getElementById('catalog-freshness').value = 'recent';
        renderList();
        const o = OrbitData.fromOmm({
          ...JSON.parse(JSON.stringify(objects[0].omm)),
          NORAD_CAT_ID: 199999,
          OBJECT_NAME: 'ARCHIVED REPLAY',
        });
        const row = { id: o.id, entry: +dateNow() + 4 * 864e5 };
        const b = PassMap.button(row, {
          archive: { payload: { objects: [OrbitData.serialize(o)] } },
        });
        b.click();
        update();
        return {
          id: selection.current.id,
          rendered: world.pointsData().some((p) => p.id === 199999),
          disabled: PassMap.button(row, {}).disabled,
          size: MapFleet.size,
        };
      });
      assert.equal(replay.id, 199999);
      assert(replay.rendered && replay.disabled);
      assert.equal(replay.size, 12);
      assert.equal(await page.evaluate(() => document.body.scrollWidth), mobile ? 390 : 1440);
      assert(requests.every((r) => r.method === 'GET' && !r.body));
      assert(
        requests.every(
          (r) => !r.url.includes(String(site.lat)) && !r.url.includes(String(site.lon)),
        ),
      );
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
  console.log(
    'PASS: twelve-row clickable timeline, sky plot, fixed-time alert gating, comparison, ICS download, ar/en card-clock separation, non-accumulating visibility boundary, opt-in 8K texture, exact archived replay, absent-snapshot guard, private mobile/desktop tools',
  );
}
module.exports = { checkBrowserFleetExperience };
