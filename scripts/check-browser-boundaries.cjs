const assert = require('node:assert/strict'),
  fs = require('node:fs');
async function checkBrowserBoundaries(browser, baseUrl, output) {
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
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => requests.push(request.url()));
    for (const route of ['**/api/orbits?*', 'https://celestrak.org/**'])
      await page.route(route, (request) =>
        request.fulfill({ contentType: 'application/json', body: JSON.stringify([fixture]) }),
      );
    let attempts = 0,
      release;
    const pending = new Promise((resolve) => (release = resolve));
    await page.route('**/data/countries.json', async (route) => {
      attempts++;
      if (attempts === 1) return route.abort('failed');
      await pending;
      return route.fulfill({
        contentType: 'application/json',
        body: fs.readFileSync('public/data/countries.json'),
      });
    });
    try {
      await page.goto(baseUrl);
      await page.waitForFunction(() => world && reportCountries.length > 100);
      await page.waitForFunction(() => !document.body.classList.contains('startup'));
      assert.equal(attempts, 0, 'map startup never downloads full country boundaries');
      await page.waitForFunction(() => world.polygonsData()[0]?.id === '682');
      assert(await page.locator('#globe-card').isHidden());
      if (mobile) {
        await page.click('#language-toggle');
        await page.waitForFunction(() => document.documentElement.lang === 'en');
      }
      await page.click('#shell-nav-reports');
      await page.selectOption('#report-country', '840');
      await page.waitForFunction(() =>
        MadarI18n.original(document.getElementById('report-status')).includes(
          'تعذّر تحميل حدود البلدان',
        ),
      );
      await Promise.all([
        page.waitForRequest('**/data/countries.json'),
        page.selectOption('#report-country', '250'),
      ]);
      await page.selectOption('#report-country', '682');
      release();
      await page.waitForFunction(
        () => reportCountries.find((country) => country.id === '250').geometry,
      );
      assert.equal(
        await page.evaluate(() => world.polygonsData()[0]?.id),
        '682',
        'a late download cannot replace the latest country choice',
      );
      await page.selectOption('#report-country', '840');
      await page.waitForFunction(() => world.polygonsData()[0]?.id === '840');
      assert.equal(await page.locator('#report-status').innerText(), '');
      assert.equal(attempts, 2, 'successful full boundaries are reused after one failed attempt');
      const countries = await page.evaluate(() => ({
        count: document.getElementById('analysis-country').options.length,
        name: reportCountries.find((country) => country.id === '840').displayName,
      }));
      assert(countries.count > 100);
      assert(countries.name);
      assert(
        requests
          .filter((url) => url.includes('/data/countries.json'))
          .every((url) => !url.includes('?')),
      );
      assert.deepEqual(errors, []);
      await page.screenshot({ path: output + '/deferred-boundaries-' + mobile + '.png' });
    } finally {
      release();
      await context.close();
    }
  }
  console.log(
    'PASS: deferred exact boundaries, lightweight startup, visible fetch errors, retry, latest-choice race, shared report lists and no country URL parameters',
  );
}
module.exports = { checkBrowserBoundaries };
