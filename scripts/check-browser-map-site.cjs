const fs = require('node:fs'),
  assert = require('node:assert/strict');
async function checkBrowserMapSite(browser, baseUrl, output) {
  const fixture = {
    ...JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json')),
    EPOCH: new Date().toISOString(),
  };
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    await context.addInitScript(() => localStorage.setItem('madar-save-enabled', 'false'));
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
    async function inline(id, direction) {
      const r = await page.locator('#' + id).evaluate((input) => {
        const row = input.closest('.inline-field');
        const caption = row?.querySelector('.field-caption'),
          field = input.closest('.date-entry') || input;
        if (!caption) return null;
        const a = caption.getBoundingClientRect(),
          b = field.getBoundingClientRect();
        return {
          a: { left: a.left, right: a.right, top: a.top, bottom: a.bottom },
          b: { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width },
          overflow: row.scrollWidth - row.clientWidth,
        };
      });
      assert(r, id + ' has an inline caption');
      assert(
        Math.min(r.a.bottom, r.b.bottom) > Math.max(r.a.top, r.b.top),
        id + ' caption sits beside the field',
      );
      assert(direction === 'rtl' ? r.a.left >= r.b.right - 2 : r.a.right <= r.b.left + 2);
      assert(r.b.width >= (mobile ? 125 : 140), id + ' remains usable');
      assert(r.overflow <= 2, id + ' has no horizontal overflow');
    }
    async function camera() {
      await page.evaluate(() => {
        const controls = world.controls(),
          damping = controls.enableDamping;
        // Consume drag inertia before projecting the next exact test coordinate.
        controls.enableDamping = false;
        controls.update();
        world.pointOfView({ lat: 25, lng: 45, altitude: 2.4 }, 0);
        controls.update();
        controls.enableDamping = damping;
      });
      await page.waitForTimeout(250);
    }
    async function tap(lat, lng) {
      const p = await page.evaluate(
        ({ lat, lng }) => {
          const r = document.getElementById('globe').getBoundingClientRect(),
            p = world.getScreenCoords(lat, lng, 0);
          return { x: r.left + p.x, y: r.top + p.y };
        },
        { lat, lng },
      );
      if (mobile) await page.touchscreen.tap(p.x, p.y);
      else await page.mouse.click(p.x, p.y);
    }
    try {
      await page.goto(baseUrl);
      await page.waitForFunction(
        () => window.ObserverMapPicker && window.MadarShell && world && objects.length === 1,
      );
      await page.evaluate(() => MadarI18n.ready);
      await page.click('#shell-nav-reports');
      await page.click('#shell-report-observer');
      await inline('observer-lat', 'rtl');
      await inline('observer-date', 'rtl');
      await page.fill('#observer-name', 'PRIVATE_MAP_SITE');
      await page.fill('#observer-lat', '12.345678');
      await page.fill('#observer-lon', '23.456789');
      await page.fill('#observer-height', '123');
      await page.selectOption('#observer-zone', '0');
      await page.evaluate(() => {
        choose(objects[0], false);
        MapFleet.toggle(objects[0]);
        selection.toggleTracking();
      });
      await page.click('#observer-site-map');
      assert(await page.evaluate(() => ObserverMapPicker.active()));
      assert.equal(await page.evaluate(() => MadarShell.current()), 'map');
      assert(await page.locator('#observer-map-use').isDisabled());
      await camera();
      const box = await page.locator('#globe').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.35);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height * 0.35, { steps: 4 });
      await page.mouse.up();
      assert(
        await page.locator('#observer-map-use').isDisabled(),
        'drag does not select a location',
      );
      await camera();
      const space = await page.evaluate(() => {
        const globe = document.getElementById('globe'),
          r = globe.getBoundingClientRect();
        for (const y of [0.12, 0.25, 0.45, 0.7])
          for (const x of [0.05, 0.2, 0.8, 0.95]) {
            const p = { x: r.left + r.width * x, y: r.top + r.height * y };
            const element = document.elementFromPoint(p.x, p.y);
            if (globe.contains(element) && !world.toGlobeCoords(r.width * x, r.height * y))
              return p;
          }
        return null;
      });
      assert(space, 'a visible off-Earth canvas location is available');
      if (mobile) await page.touchscreen.tap(space.x, space.y);
      else await page.mouse.click(space.x, space.y);
      assert(await page.locator('#observer-map-use').isDisabled(), 'space is not a location');
      await tap(35, 45);
      await page.waitForFunction(() => !document.getElementById('observer-map-use').disabled);
      assert.equal(await page.evaluate(() => world.htmlElementsData().length), 1);
      await page.locator('.observer-site-marker').waitFor({ state: 'visible' });
      assert.equal(
        await page.locator('#observer-lat').inputValue(),
        '12.345678',
        'preview does not alter fields',
      );
      assert.equal(await page.evaluate(() => selection.current.id), 100001);
      assert.equal(await page.evaluate(() => MapFleet.size), 1);
      await page.screenshot({ path: output + '/map-site-picker-' + mobile + '.png' });
      await page.click('#observer-map-use');
      assert.equal(await page.evaluate(() => MadarShell.current()), 'reports');
      assert(Math.abs(Number(await page.locator('#observer-lat').inputValue()) - 35) < 0.5);
      assert(Math.abs(Number(await page.locator('#observer-lon').inputValue()) - 45) < 0.5);
      assert.equal(await page.locator('#observer-height').inputValue(), '123');
      assert.equal(await page.locator('#observer-zone').inputValue(), '0');
      await page.click('#observer-site-save');
      assert.equal(await page.locator('#observer-site-select option').count(), 2);
      assert.equal(
        await page.evaluate(() => localStorage.getItem('madar-observer-sites-v1')),
        null,
      );
      const accepted = await page.locator('#observer-lat').inputValue();
      await page.click('#observer-site-map');
      await camera();
      await tap(30, 46);
      await page.keyboard.press('Escape');
      assert.equal(
        await page.locator('#observer-lat').inputValue(),
        accepted,
        'cancel retains inputs',
      );
      assert.equal(await page.evaluate(() => ObserverMapPicker.active()), false);
      await page.click('#language-toggle');
      await page.waitForFunction(() => document.documentElement.lang === 'en');
      await inline('observer-lat', 'ltr');
      await inline('observer-date', 'ltr');
      await page.locator('#observer-name').scrollIntoViewIfNeeded();
      await page.screenshot({ path: output + '/inline-fields-en-' + mobile + '.png' });
      await page.click('#observer-site-map');
      assert(!/[\u0620-\u064a]/.test(await page.locator('#observer-map-picker').innerText()));
      await page.keyboard.press('Escape');
      await page.click('#shell-nav-map');
      await page.click('#map-fleet-open');
      await page.waitForSelector('#fleet-pass-site-map');
      await inline('fleet-pass-lat', 'ltr');
      await page.fill('#fleet-pass-height', '456');
      await page.click('#fleet-pass-site-map');
      await camera();
      await tap(32, 44);
      await page.click('#observer-map-use');
      assert(await page.locator('#map-tools-dialog').evaluate((n) => n.open));
      assert(Math.abs(Number(await page.locator('#fleet-pass-lat').inputValue()) - 32) < 0.5);
      assert.equal(await page.locator('#fleet-pass-height').inputValue(), '456');
      await page.click('#fleet-pass-site-map');
      await page.click('#shell-nav-catalog');
      assert.equal(
        await page.evaluate(() => ObserverMapPicker.active()),
        false,
        'navigation cancels picking',
      );
      assert(
        !requests.some((value) =>
          /PRIVATE_MAP_SITE|12\.345678|23\.456789/.test(decodeURIComponent(value)),
        ),
      );
      assert.deepEqual(errors, []);
    } catch (error) {
      console.error(
        'Map-site diagnostic',
        await page.evaluate(() => ({
          picker: !!window.ObserverMapPicker,
          shell: !!window.MadarShell,
          world: typeof world !== 'undefined' && !!world,
          count: typeof objects !== 'undefined' ? objects.length : null,
          ready: document.readyState,
          mapError: document.getElementById('map-error')?.textContent,
          status: document.getElementById('status')?.textContent,
          markers: [...document.querySelectorAll('.observer-site-marker')].map((n) => ({
            display: getComputedStyle(n).display,
            visibility: getComputedStyle(n).visibility,
            rect: JSON.stringify(n.getBoundingClientRect()),
          })),
        })),
        errors,
      );
      await page.screenshot({ path: output + '/map-site-failure-' + mobile + '.png' });
      throw error;
    } finally {
      await context.close();
    }
  }
  console.log(
    'PASS: real surface taps, drag/space rejection, explicit apply/cancel, unchanged satellite selection, map/report return, preserved altitude, private storage, inline RTL/LTR fields and mobile layouts',
  );
}
module.exports = { checkBrowserMapSite };
