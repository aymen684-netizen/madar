const fs = require('node:fs'),
  assert = require('node:assert/strict');
async function checkBrowserReportGuidance(browser, baseUrl, output) {
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
    const next = (key) => page.click('#' + key + '-guide-next');
    const visible = async (id) =>
      assert(await page.locator('#' + id).isVisible(), id + ' is visible');
    try {
      await page.goto(baseUrl);
      await page.waitForFunction(
        () => window.MadarShell && typeof objects !== 'undefined' && objects.length === 1,
      );
      await page.evaluate(() => MadarI18n.ready);
      if (mobile) {
        await page.click('#language-toggle');
        await page.waitForFunction(() => document.documentElement.lang === 'en');
      }
      await page.click('#shell-nav-reports');
      await page.waitForFunction(() => document.getElementById('report-country').value === '682');
      await visible('report-country');
      assert(!(await page.locator('#report-start-date').isVisible()));
      assert(!(await page.locator('#report-run').isVisible()));
      await next('report');
      await visible('report-start-date');
      await page.fill('#report-start-date', '2026-10-19');
      await page.fill('#report-end-date', '2026-10-19');
      await page.fill('#report-start-time', '01:00:00');
      await page.fill('#report-end-time', '00:59:00');
      await next('report');
      assert.equal(await page.locator('#report-end-time').getAttribute('aria-invalid'), 'true');
      const description = await page.locator('#report-end-time').getAttribute('aria-describedby');
      assert(await page.locator('#' + description.split(' ').at(-1)).isVisible());
      await page.screenshot({ path: output + '/report-guide-error-' + mobile + '.png' });
      await page.fill('#report-end-time', '01:05:00');
      await next('report');
      await page.selectOption('#report-scope', 'group');
      assert.equal(await page.locator('#report-guide-advanced').getAttribute('open'), null);
      await page.click('#report-guide-advanced>summary');
      await page.selectOption('#report-step', '60');
      await page.click('#report-guide-advanced>summary');
      await next('report');
      await visible('report-run');
      assert.equal(
        await page.evaluate(() => typeof finishedReport === 'undefined' || !finishedReport),
        true,
        'review has not started calculation',
      );
      assert(
        (await page.locator('.report-guide-review:visible').innerText()).includes('2026-10-19'),
      );
      await page.screenshot({ path: output + '/report-guide-review-' + mobile + '.png' });
      await page.click('#report-guide-back');
      await page.click('#report-guide-toggle');
      await visible('report-country');
      await visible('report-start-date');
      assert.equal(await page.locator('#report-step').inputValue(), '60');
      await page.click('#report-guide-toggle');
      await next('report');
      await page.click('#report-run');
      await page.waitForFunction(
        () => typeof finishedReport !== 'undefined' && !!finishedReport,
        {},
        { timeout: 45000 },
      );
      assert.equal(await page.evaluate(() => finishedReport.step), 60);
      await page.click('#shell-report-observer');
      await page.fill('#observer-name', 'PRIVATE_GUIDE_SITE');
      await page.fill('#observer-lat', '91');
      await page.fill('#observer-lon', '0');
      await next('observer');
      assert.equal(await page.locator('#observer-lat').getAttribute('aria-invalid'), 'true');
      await page.fill('#observer-lat', '0');
      await next('observer');
      await page.fill('#observer-date', '2026-10-19');
      await page.fill('#observer-start', '01:00:00');
      await page.fill('#observer-end', '00:00:00');
      await next('observer');
      assert.equal(await page.locator('#observer-end').getAttribute('aria-invalid'), 'true');
      await page.fill('#observer-end', '01:05:00');
      await next('observer');
      await page.selectOption('#observer-scope', 'fleet');
      await next('observer');
      assert.equal(await page.locator('#observer-scope').getAttribute('aria-invalid'), 'true');
      await page.selectOption('#observer-scope', 'selected');
      await page.click('#shell-nav-catalog');
      await page.locator('#list button').first().click();
      await page.click('#shell-nav-reports');
      await page.click('#shell-report-observer');
      await next('observer');
      await page.locator('#observer-form button[type=submit]').click();
      await page.waitForFunction(
        () => !document.getElementById('observer-word').disabled,
        {},
        { timeout: 45000 },
      );
      assert.equal(
        await page.evaluate(() => localStorage.getItem('madar-observer-sites-v1')),
        null,
      );
      await page.click('#shell-report-analysis');
      await next('analysis');
      await page.click('#analysis-add');
      await page.locator('.period-remove').last().click();
      await next('analysis');
      assert((await page.locator('#analysis-form [aria-invalid=true]').count()) > 0);
      await page.click('#analysis-add');
      await next('analysis');
      await page.selectOption('#analysis-scope', 'group');
      await next('analysis');
      await visible('analysis-run');
      await page.click('#shell-report-inventory');
      await page.waitForFunction(
        () => document.getElementById('inventory-owner').options.length > 1,
      );
      const owner = await page
        .locator('#inventory-owner option')
        .evaluateAll((options) => options.find((o) => o.value)?.value);
      await page.selectOption('#inventory-owner', owner);
      await next('inventory');
      await visible('inventory-run');
      if (mobile)
        assert(
          !/[\u0620-\u064a]/.test(
            await page.locator('#inventory-form .report-guide-nav').innerText(),
          ),
        );
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert(overflow <= 2, 'mobile has no page overflow');
      assert(!requests.some((r) => r.includes('PRIVATE_GUIDE_SITE')), 'site name remains local');
      assert.deepEqual(errors, []);
    } catch (error) {
      console.error(
        'Report guidance diagnostic',
        mobile,
        await page.evaluate(() => ({
          route: document.body.dataset.shellView,
          report: window.MadarShell?.report(),
          status: document.getElementById('report-status')?.textContent,
          observer: document.getElementById('observer-status')?.textContent,
          invalid: [...document.querySelectorAll('[aria-invalid=true]')].map((n) => n.id),
          errors: [...document.querySelectorAll('.report-field-error')].map((n) => n.textContent),
        })),
        errors,
      );
      await page.screenshot({ path: output + '/report-guide-failure-' + mobile + '.png' });
      throw error;
    } finally {
      await context.close();
    }
  }
  console.log(
    'PASS: default guided reports, native field reuse, period/range/scope errors, explicit review/run, real country and observer workers, retained values, advanced disclosure, full-form mode, Arabic/English mobile and private inputs',
  );
}
module.exports = { checkBrowserReportGuidance };
