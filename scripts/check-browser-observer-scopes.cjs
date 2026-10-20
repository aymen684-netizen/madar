const fs = require('node:fs'),
  assert = require('node:assert/strict');
async function checkBrowserObserverScopes(browser, baseUrl, output) {
  const seed = JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json')),
    data = Array.from({ length: 501 }, (_, i) => ({
      ...seed,
      NORAD_CAT_ID: 100001 + i,
      OBJECT_NAME: 'OBSERVER SCOPE ' + i,
      EPOCH: '2026-10-20T00:00:00Z',
    }));
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    page = await context.newPage(),
    errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const route of ['**/api/orbits?*', 'https://celestrak.org/**'])
    await page.route(route, (r) => {
      const params = new URL(r.request().url()).searchParams,
        group = params.get('group') || params.get('GROUP'),
        rows =
          group === 'military'
            ? data.slice(0, 2)
            : group === 'intelligence'
              ? data.slice(1, 3)
              : data;
      return r.fulfill({
        contentType: 'application/json',
        headers: { 'X-Madar-Fetched-At': String(Date.now()), 'X-Madar-Connection': 'upstream' },
        body: JSON.stringify(rows),
      });
    });
  try {
    await page.goto(baseUrl);
    await page.waitForFunction(() => window.ObserverUI && objects.length === 501);
    await page.click('#shell-nav-reports');
    await page.click('#shell-report-observer');
    await page.fill('#observer-lat', '0');
    await page.fill('#observer-lon', '0');
    await page.fill('#observer-date', '2026-10-20');
    await page.fill('#observer-start', '00:00:00');
    await page.fill('#observer-end', '00:01:00');
    await page.uncheck('#observer-next');
    for (const [scope, count] of [
      ['active', 501],
      ['group', 501],
      ['military', 3],
      ['intelligence', 2],
      ['types', 3],
    ]) {
      await page.selectOption('#observer-scope', scope);
      if (scope === 'types')
        await page.click('[data-type-prefix="observer"][data-type-preset="military"]');
      await page.locator('#observer-form button[type=submit]').click();
      await page.waitForFunction(
        (total) =>
          ObserverUI.result?.result.total === total &&
          document.getElementById('observer-progress').value === 100,
        count,
        { timeout: 45000 },
      );
      const report = await page.evaluate(() => ({
        total: ObserverUI.result.result.total,
        inputs: ObserverUI.result.archive.payload.objects.map((o) => o.id),
        scope: ObserverUI.result.scopeName,
      }));
      assert.equal(report.total, count);
      assert.equal(report.inputs.length, count);
      assert.equal(new Set(report.inputs).size, count, 'multi-type overlaps count once');
      assert(report.scope.length > 0);
    }
    await page.screenshot({ path: output + '/observer-satellite-scopes.png' });
    // A large scan remains cancellable and cannot publish a late result.
    await page.selectOption('#observer-scope', 'active');
    await page.fill('#observer-end', '23:59:59');
    await page.locator('#observer-form button[type=submit]').click();
    await page.waitForFunction(() => document.getElementById('observer-cancel').disabled === false);
    await page.click('#observer-cancel');
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => ObserverUI.result), null);
    assert.equal(await page.locator('#observer-form').getAttribute('aria-busy'), 'false');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
  console.log(
    'PASS: observer active/current catalogs above 500, military/intelligence, multi-type deduplication, exact archived inputs and cancellation',
  );
}
module.exports = { checkBrowserObserverScopes };
