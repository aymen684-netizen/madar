const fs = require('node:fs'),
  assert = require('node:assert/strict');
async function checkBrowserObserverSites(browser, baseUrl, output) {
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
    await context.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.__siteCalculations = 0;
      window.Worker = class extends NativeWorker {
        constructor(url, options) {
          super(url, options);
          if (/fleet-pass-worker|observer-worker/.test(String(url))) window.__siteCalculations++;
        }
      };
    });
    try {
      await page.goto(baseUrl);
      await page.waitForFunction(
        () => window.ObserverSites && window.MadarShell && world && objects.length === 1,
      );
      await page.evaluate(() => MadarI18n.ready);
      await page.click('#shell-nav-reports');
      await page.click('#shell-report-observer');
      const siteName = 'PRIVATE_SITE <b>literal</b>';
      await page.fill('#observer-name', siteName);
      await page.click('#observer-site-save');
      assert.equal(
        await page.locator('#observer-site-select option').count(),
        1,
        'empty coordinates cannot be saved as zero',
      );
      await page.fill('#observer-lat', '24.1234567');
      await page.fill('#observer-lon', '46.4567891');
      await page.fill('#observer-height', '123');
      await page.selectOption('#observer-zone', '0');
      await page.click('#observer-site-save');
      assert.equal(await page.locator('#observer-site-select option').count(), 2);
      const id = await page.locator('#observer-site-select').inputValue();
      assert.equal(
        await page.locator('#observer-site-select option:checked').textContent(),
        siteName,
      );
      assert.equal(
        await page.locator('#observer-site-select b').count(),
        0,
        'site names remain literal text',
      );
      await page.fill('#observer-height', '234');
      await page.click('#observer-site-update');
      assert.equal(
        await page.locator('#observer-site-select option').count(),
        2,
        'update replaces only the selected profile',
      );
      await page.evaluate(() => MapFleet.toggle(objects[0]));
      await page.click('#shell-nav-map');
      await page.click('#map-fleet-open');
      await page.waitForSelector('#fleet-pass-site-select');
      await page.selectOption('#fleet-pass-site-select', id);
      assert.equal(await page.locator('#fleet-pass-lat').inputValue(), '24.1234567');
      assert.equal(await page.locator('#fleet-pass-height').inputValue(), '234');
      assert.equal(await page.locator('#fleet-pass-zone').inputValue(), '0');
      assert.equal(await page.locator('#fleet-pass-name').inputValue(), siteName);
      assert.equal(
        await page.evaluate(() => __siteCalculations),
        0,
        'selecting a site does not start calculations',
      );
      assert.equal(await page.locator('#fleet-pass-list li').count(), 0);
      await page.fill('#fleet-pass-name', 'SECOND_PRIVATE_SITE');
      await page.fill('#fleet-pass-lon', '-10.9876543');
      await page.click('#fleet-pass-site-save');
      const second = await page.locator('#fleet-pass-site-select').inputValue();
      await page.locator('#fleet-pass-site-select').scrollIntoViewIfNeeded();
      await page.screenshot({ path: output + '/observing-sites-map-' + mobile + '.png' });
      await page.click('#map-tools-close');
      await page.click('#shell-nav-reports');
      await page.click('#shell-report-observer');
      assert.equal(
        await page.locator('#observer-site-select option').count(),
        3,
        'both interfaces share saved sites',
      );
      await page.selectOption('#observer-site-select', second);
      assert.equal(await page.locator('#observer-lon').inputValue(), '-10.9876543');
      assert.equal(await page.locator('#observer-name').inputValue(), 'SECOND_PRIVATE_SITE');
      await page.evaluate(() =>
        document.getElementById('observer-form').setAttribute('aria-busy', 'true'),
      );
      await page.waitForFunction(() => document.getElementById('observer-site-select').disabled);
      assert(await page.locator('#observer-site-update').isDisabled());
      await page.evaluate(() =>
        document.getElementById('observer-form').setAttribute('aria-busy', 'false'),
      );
      await page.waitForFunction(() => !document.getElementById('observer-site-select').disabled);
      await page.click('#language-toggle');
      await page.waitForFunction(() => document.documentElement.lang === 'en');
      const panel = page.locator('#observer-form .observer-sites');
      assert((await panel.innerText()).includes('Saved observing sites'));
      assert(!/[\u0620-\u064a]/.test(await panel.innerText()));
      assert.equal(
        await page.locator('#observer-site-select option').nth(1).textContent(),
        siteName,
        'user names are never translated',
      );
      await page.screenshot({ path: output + '/observing-sites-report-en-' + mobile + '.png' });
      await page.reload();
      await page.waitForFunction(() => window.ObserverSites && window.MadarShell);
      assert.equal(
        await page.locator('#observer-site-select option').count(),
        3,
        'saved sites survive reload',
      );
      await page.click('#shell-nav-reports');
      await page.click('#shell-report-observer');
      await page.selectOption('#observer-site-select', second);
      await page.evaluate(() => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key === 'madar-observer-sites-v1')
            throw new DOMException('Storage unavailable', 'QuotaExceededError');
          return original.call(this, key, value);
        };
      });
      await page.click('#observer-site-delete');
      await page.waitForFunction(() =>
        document
          .querySelector('#observer-form .observer-sites-status')
          .textContent.includes('Could not delete'),
      );
      assert.equal(
        await page.locator('#observer-site-select option').count(),
        3,
        'failed deletion keeps the saved site visible',
      );
      assert.equal(await page.locator('#observer-site-select').inputValue(), second);
      assert((await panel.innerText()).includes('New changes remain for this session only'));
      assert.equal(
        await page.evaluate(
          () => JSON.parse(localStorage.getItem('madar-observer-sites-v1')).sites.length,
        ),
        2,
      );
      await page.reload();
      await page.waitForFunction(() => window.ObserverSites && window.MadarShell);
      await page.click('#shell-nav-reports');
      await page.click('#shell-report-observer');
      await page.selectOption('#observer-site-select', second);
      await page.click('#observer-site-delete');
      assert.equal(await page.locator('#observer-site-select option').count(), 2);
      assert.equal(
        await page.locator('#observer-lon').inputValue(),
        '-10.9876543',
        'deletion does not alter input fields',
      );
      await page.evaluate(() => Privacy.setEnabled(false));
      await page.reload();
      await page.waitForFunction(() => window.ObserverSites && window.MadarShell);
      await page.click('#shell-nav-reports');
      await page.click('#shell-report-observer');
      assert.equal(
        await page.locator('#observer-site-select option').count(),
        1,
        'privacy opt-out removes saved sites',
      );
      await page.fill('#observer-name', 'SESSION_PRIVATE_SITE');
      await page.fill('#observer-lat', '24.1234567');
      await page.fill('#observer-lon', '46.4567891');
      await page.click('#observer-site-save');
      assert.equal(await page.locator('#observer-site-select option').count(), 2);
      assert.equal(
        await page.evaluate(() => localStorage.getItem('madar-observer-sites-v1')),
        null,
      );
      await page.reload();
      await page.waitForFunction(() => window.ObserverSites && window.MadarShell);
      assert.equal(
        await page.locator('#observer-site-select option').count(),
        1,
        'session sites disappear on reload',
      );
      assert(
        !requests.some((value) =>
          /PRIVATE_SITE|24\.1234567|46\.4567891|10\.9876543/.test(decodeURIComponent(value)),
        ),
        'private site names and coordinates never enter network requests',
      );
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
  console.log(
    'PASS: saved observing sites shared by map/reports, literal names, explicit calculation, update/delete/reload, session privacy and bilingual desktop/mobile',
  );
}
module.exports = { checkBrowserObserverSites };
