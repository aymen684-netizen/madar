const assert = require('node:assert/strict'),
  fs = require('node:fs');
async function checkBrowserSatelliteSummary(browser, url, output) {
  const fixture = {
    ...JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json')),
    EPOCH: new Date(Date.now() - 4 * 86400000).toISOString(),
  };
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    if (mobile)
      await context.addInitScript(() => localStorage.setItem('madar-save-enabled', 'false'));
    const page = await context.newPage(),
      errors = [],
      requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => requests.push(request));
    for (const pattern of ['https://celestrak.org/**', '**/api/orbits?*'])
      await page.route(pattern, (route) =>
        route.fulfill({
          contentType: 'application/json',
          headers: { 'X-Madar-Fetched-At': String(Date.now()), 'X-Madar-Connection': 'upstream' },
          body: JSON.stringify([fixture]),
        }),
      );
    async function choose() {
      await page.click('#shell-nav-catalog');
      await page.locator('#list button').first().click();
      await page.locator('#globe-card').waitFor({ state: 'visible' });
    }
    try {
      await page.goto(url);
      await page.waitForFunction(() => world && objects.length === 1 && window.MadarShell);
      await page.evaluate(() => MadarI18n.ready);
      if (mobile) {
        await page.click('#language-toggle');
        await page.waitForFunction(() => document.documentElement.lang === 'en');
      }
      await choose();
      assert(!(await page.locator('#globe-card-technical').isVisible()));
      for (const id of [
        'globe-card-country',
        'globe-card-mission',
        'globe-card-motion',
        'globe-card-data-status',
        'track-selected',
        'globe-card-fleet',
      ])
        assert(await page.locator('#' + id).isVisible(), id + ' remains in the summary');
      assert.equal(
        await page.locator('#shell-card-expand').getAttribute('aria-controls'),
        'globe-card-technical',
      );
      assert.equal(await page.locator('#globe-card').getAttribute('data-quality'), 'old');
      if (mobile) {
        await page.waitForFunction(
          () => !/[\u0620-\u064a]/.test(document.getElementById('globe-card').innerText),
        );
        const bounds = await page.locator('#globe-card').boundingBox();
        assert(bounds.height <= 844 * 0.45 + 1);
        const toggle = await page.locator('#shell-card-expand').boundingBox();
        assert(
          toggle.y + toggle.height <= bounds.y + bounds.height + 1,
          'details button is reachable without scrolling',
        );
      }
      await page.locator('#shell-card-expand').focus();
      await page.keyboard.press('Enter');
      assert(await page.locator('#globe-card-technical').isVisible());
      assert.equal(
        await page
          .locator('#globe-card-mission')
          .evaluate((node) => getComputedStyle(node).whiteSpace),
        'normal',
        'expanded cards reveal the full mission text',
      );
      assert((await page.locator('#globe-card-format').textContent()).includes('OMM JSON'));
      assert((await page.locator('#globe-card-epoch').textContent()).includes('UTC'));
      assert.equal(await page.locator('#shell-card-expand').getAttribute('aria-expanded'), 'true');
      assert.equal(
        await page.evaluate(() => localStorage.getItem('madar-card-details')),
        mobile ? null : 'true',
      );
      await page.screenshot({ path: output + '/satellite-summary-expanded-' + mobile + '.png' });
      await page.reload();
      await page.waitForFunction(() => world && objects.length === 1 && window.MadarShell);
      await choose();
      assert.equal(
        await page.locator('#globe-card-technical').isVisible(),
        !mobile,
        'disclosure preference respects private storage',
      );
      if (!mobile) await page.click('#shell-card-expand');
      await page.screenshot({ path: output + '/satellite-summary-compact-' + mobile + '.png' });
      await page.locator('#shell-card-expand').focus();
      await page.keyboard.press('Escape');
      assert(!(await page.locator('#globe-card').isVisible()));
      assert.equal(await page.evaluate(() => document.activeElement.id), 'map-tools-open');
      assert(
        !requests.some((request) => request.method() !== 'GET' || request.postData()),
        'card preferences and actions never upload data',
      );
      assert.deepEqual(errors, []);
    } catch (error) {
      console.error('Satellite summary diagnostics', {
        mobile,
        errors,
        state: await page.evaluate(() => ({
          count: typeof objects === 'undefined' ? null : objects.length,
          world: typeof world !== 'undefined' && !!world,
          shell: !!window.MadarShell,
          status: document.getElementById('status')?.textContent,
        })),
      });
      await page.screenshot({ path: output + '/satellite-summary-failure-' + mobile + '.png' });
      throw error;
    } finally {
      await context.close();
    }
  }
  console.log(
    'PASS: concise bilingual satellite summary, explicit technical disclosure, quality/epoch distinction, keyboard/focus, mobile height and privacy-aware preference persistence',
  );
}
module.exports = { checkBrowserSatelliteSummary };
