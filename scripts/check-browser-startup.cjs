const assert = require('assert/strict'),
  fs = require('fs');
async function checkBrowserStartup(browser, url, output) {
  const fixture = {
    ...JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json')),
    EPOCH: new Date().toISOString(),
  };
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
      madarWelcome: true,
    });
    await context.addInitScript((en) => {
      localStorage.setItem('madar-started', '1');
      if (en) localStorage.setItem('madar-language', 'en');
    }, !mobile);
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let release;
    const scriptsReady = new Promise((resolve) => (release = resolve));
    await page.route('**/vendor/globe.min.js', async (route) => {
      await scriptsReady;
      await route.continue();
    });
    for (const pattern of ['https://celestrak.org/**', '**/api/orbits?*'])
      await page.route(pattern, (r) =>
        r.fulfill({ contentType: 'application/json', body: JSON.stringify([fixture]) }),
      );
    try {
      const navigation = page.goto(url + '#catalog');
      await page.locator('#welcome-dialog').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => typeof window.MadarShell), 'undefined');
      assert(await page.locator('header').isHidden(), 'no legacy layout before scripts load');
      await page.screenshot({ path: output + '/startup-first-paint-' + mobile + '.png' });
      release();
      await navigation;
      await page.waitForFunction(() => window.MadarShell && world && objects.length === 1);
      await page.evaluate(() => MadarI18n.ready);
      assert(await page.locator('#welcome-dialog').isVisible(), 'return visits start at welcome');
      assert.equal(await page.evaluate(() => MadarShell.current()), 'map');
      assert(await page.locator('#globe-card').isHidden());
      await page.keyboard.press('Escape');
      assert(await page.locator('#welcome-dialog').isVisible());
      await page.click('#welcome-start');
      assert.equal(await page.evaluate(() => MadarShell.current()), 'catalog');
      await page.locator('#list button').first().click();
      assert(await page.locator('#globe-card').isVisible());
      await page.click('#globe-card-favorite');
      await page.waitForFunction(
        () =>
          !document.getElementById('restore-notice').hidden ||
          JSON.parse(localStorage.getItem('madar-draft-v1') || 'null')?.selectedByUser === true,
      );
      await page.evaluate(() => DraftState.save());
      await page.reload();
      await page.waitForFunction(
        () => world && objects.length === 1 && !document.getElementById('restore-notice').hidden,
      );
      assert(await page.locator('#welcome-dialog').isVisible());
      assert(await page.locator('#globe-card').isHidden());
      assert.equal(await page.evaluate(() => selection.byUser), false);
      assert.equal(
        await page.evaluate(() => JSON.parse(localStorage.getItem('orbit-favorites')).length),
        1,
      );
      await page.click('#welcome-start');
      assert(await page.locator('#globe-card').isHidden());
      assert.equal(await page.locator('#shell-nav-map').textContent(), mobile ? 'الخارطة' : 'Map');
      await page.screenshot({ path: output + '/startup-ready-' + mobile + '.png' });
      assert.deepEqual(errors, []);
    } finally {
      release();
      await context.close();
    }
  }
  console.log(
    'PASS: first paint welcome before scripts, warm globe, return visits and hash destinations, no restored card, saved favorites, bilingual desktop/mobile',
  );
}
module.exports = { checkBrowserStartup };
