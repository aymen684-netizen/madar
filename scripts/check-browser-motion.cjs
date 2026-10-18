const assert = require('node:assert/strict'),
  fs = require('node:fs');
async function checkBrowserMotion(browser, url, output) {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
        isMobile: mobile,
        hasTouch: mobile,
        reducedMotion: 'no-preference',
      }),
      page = await context.newPage(),
      errors = [];
    const fixture = {
      ...JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json')),
      EPOCH: new Date().toISOString(),
    };
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://celestrak.org/**', (r) =>
      r.fulfill({ contentType: 'application/json', body: JSON.stringify([fixture]) }),
    );
    async function enable() {
      await page.click('#map-tools-open');
      await page.locator('#shell-scene-options').evaluate((n) => {
        n.open = true;
      });
      await page.check('#globe-rotation');
      await page.click('#map-tools-close');
      await page.waitForFunction(() => world.controls().autoRotate);
    }
    try {
      await page.goto(url);
      await page.waitForFunction(
        () => world && objects.length === 1 && RenderLifecycle.sceneActive(),
      );
      assert.equal(await page.locator('#shell-nav button').count(), 3);
      assert.equal(await page.locator('#shell-nav-map').innerText(), 'الخارطة');
      await page.waitForFunction(() => world.controls().autoRotate);
      const start = await page.evaluate(() => {
        fixedTime = new Date('2026-10-16T00:00:00Z');
        paused = false;
        update();
        return { camera: world.pointOfView().lng, time: +dateNow() };
      });
      await page.waitForFunction(
        (lng) => Math.abs(world.pointOfView().lng - lng) > 0.05,
        start.camera,
      );
      assert.equal(
        await page.evaluate(() => +dateNow()),
        start.time,
        'rotation does not advance fixed time',
      );
      const box = await page.locator('#globe').boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForFunction(() => !world.controls().autoRotate);
      assert.equal(await page.locator('#globe-rotation').isChecked(), false);
      await page.click('#shell-nav-reports');
      await page.click('#shell-nav-map');
      assert.equal(
        await page.evaluate(() => world.controls().autoRotate),
        false,
        'interaction stays stopped across navigation',
      );
      await enable();
      await page.click('#shell-nav-catalog');
      await page.waitForFunction(() => !world.controls().autoRotate);
      await page.click('#shell-nav-map');
      await page.waitForFunction(() => world.controls().autoRotate);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => !world.controls().autoRotate);
      assert.equal(await page.locator('#globe-rotation').isDisabled(), true);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.waitForFunction(() => world.controls().autoRotate);
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      assert.equal(await page.evaluate(() => world.controls().autoRotate), false);
      await page.evaluate(() => {
        delete document.hidden;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForFunction(() => world.controls().autoRotate);
      await page.click('#shell-nav-catalog');
      await page.locator('#list button').first().click();
      assert.equal(
        await page.evaluate(() => world.controls().autoRotate),
        false,
        'satellite selection stops rotation',
      );
      if (mobile) await page.click('#shell-card-expand');
      await page.click('#track-selected');
      assert.equal(await page.locator('#globe-rotation').isDisabled(), true);
      assert.equal(await page.evaluate(() => world.controls().autoRotate), false);
      await page.click('#track-selected');
      assert.equal(await page.evaluate(() => world.controls().autoRotate), false);
      await page.click('#shell-nav-help');
      for (const lang of ['ar', 'en']) {
        if (lang === 'en') await page.click('#language-toggle');
        await page.waitForFunction((v) => document.documentElement.lang === v, lang);
        const styles = await page.locator('.info-actions > *').evaluateAll((nodes) =>
          nodes.map((n) => {
            const s = getComputedStyle(n);
            return {
              font: s.fontSize,
              weight: s.fontWeight,
              background: s.backgroundColor,
              height: n.getBoundingClientRect().height,
            };
          }),
        );
        const summaries = await page
          .locator('#shell-help > details > summary')
          .evaluateAll((nodes) =>
            nodes.map((n) => {
              const s = getComputedStyle(n);
              return {
                font: s.fontSize,
                weight: s.fontWeight,
                padding: s.padding,
                minHeight: s.minHeight,
              };
            }),
          );
        assert.equal(summaries.length, 4);
        for (const summary of summaries)
          assert.deepEqual(
            summary,
            summaries[0],
            'all help disclosure headers share typography and spacing',
          );
        assert.equal(styles.length, 4);
        for (const style of styles)
          assert.deepEqual(
            style,
            styles[0],
            'all information actions share typography, color and height',
          );
        assert.equal(await page.evaluate(() => document.body.scrollWidth <= innerWidth), true);
        await page.screenshot({
          animations: 'disabled',
          path: output + '/info-actions-' + lang + '-' + (mobile ? 'mobile' : 'desktop') + '.png',
        });
      }
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
  console.log(
    'PASS: real gentle camera motion with fixed clock, interaction/selection stop, explicit restart, hidden route/page and reduced-motion guards, tracking exclusion, three-item navigation and equal bilingual information actions on desktop/mobile',
  );
}
module.exports = { checkBrowserMotion };
