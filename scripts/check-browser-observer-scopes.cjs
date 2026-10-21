const fs = require('node:fs'),
  assert = require('node:assert/strict');
function checkWordBundle(bytes, language) {
  const { docxXml } = require('./check-browser-inventory.cjs');
  let offset = 0,
    count = 0,
    passes = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18),
      length = bytes.readUInt16LE(offset + 26),
      extra = bytes.readUInt16LE(offset + 28),
      name = bytes.subarray(offset + 30, offset + 30 + length).toString(),
      start = offset + 30 + length + extra;
    if (name.endsWith('.docx')) {
      const xml = docxXml(bytes.subarray(start, start + size)),
        rows = [...xml.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)].slice(1);
      assert(rows.length <= 500);
      if (language === 'en')
        assert(!/[\u0620-\u064a]/.test(xml), 'English bundle is fully translated');
      for (const row of rows) assert.equal(Number(row[0].match(/WORD PASS (\d+)/)?.[1]), passes++);
      count++;
    }
    offset = start + size;
  }
  assert.equal(count, 3);
  assert.equal(passes, 1001);
}
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
  // Intelligence is intentionally a local, independently sourced group, not a relay request.
  await page.route('**/data/intelligence.txt', (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(data.slice(1, 3)) }),
  );
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
    await page.click('#observer-types .type-advanced > summary');
    assert(
      (await page.locator('#observer-types .type-presets button').first().boundingBox()).height <
        80,
      'opening detailed types keeps preset buttons compact',
    );
    await page.screenshot({ path: output + '/observer-satellite-scopes.png' });
    await page.evaluate(() => {
      window.__wordScopeSeed = ObserverUI.result;
    });
    // A large scan remains cancellable and cannot publish a late result.
    await page.selectOption('#observer-scope', 'active');
    await page.fill('#observer-end', '23:59:59');
    await page.locator('#observer-form button[type=submit]').click();
    await page.waitForFunction(() => document.getElementById('observer-cancel').disabled === false);
    await page.click('#observer-cancel');
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => ObserverUI.result), null);
    assert.equal(await page.locator('#observer-form').getAttribute('aria-busy'), 'false');
    await page.evaluate(() => {
      const report = window.__wordScopeSeed,
        t = report.start;
      ObserverUI.render({
        ...report,
        result: {
          ...report.result,
          rows: Array.from({ length: 1001 }, (_, i) => ({
            id: 100001 + (i % 3),
            name: 'WORD PASS ' + i,
            entry: t,
            exit: t + 10000,
            peakTime: t + 5000,
            duration: 10,
            elevation: 45,
            azimuth: 90,
            range: 1000,
            entryAzimuth: 80,
            exitAzimuth: 100,
            epoch: t,
          })),
          unique: 3,
        },
      });
    });
    // Keep a full-day-sized result while bounding visible rows and replay buttons.
    await page.evaluate(() => {
      window.__paginationSeed = ObserverUI.result;
      const report = ObserverUI.result;
      ObserverUI.render({
        ...report,
        result: {
          ...report.result,
          rows: Array.from({ length: 56515 }, (_, i) => ({
            ...report.result.rows[i % report.result.rows.length],
            name: 'PAGED PASS ' + i,
          })),
        },
      });
    });
    assert.equal(await page.locator('#observer-results tbody tr').count(), 100);
    assert.equal(await page.locator('#observer-results .pass-map-button').count(), 100);
    assert(await page.locator('#observer-page-previous').isDisabled());
    assert.equal(await page.locator('#observer-page').getAttribute('max'), '566');
    await page.click('#observer-page-next');
    assert.match(
      await page.locator('#observer-results tbody tr').first().innerText(),
      /PAGED PASS 100/,
    );
    await page.fill('#observer-page', '566');
    await page.locator('#observer-page').press('Tab');
    assert.equal(await page.locator('#observer-results tbody tr').count(), 15);
    assert.match(
      await page.locator('#observer-results tbody tr').last().innerText(),
      /PAGED PASS 56514/,
    );
    assert(await page.locator('#observer-page-next').isDisabled());
    assert.equal(await page.evaluate(() => ObserverUI.result.result.rows.length), 56515);
    assert.equal(
      await page.evaluate(() => ReportExports.passRows(ObserverUI.result).length),
      56516,
    );
    await page.fill('#observer-page', '99999');
    await page.locator('#observer-page').press('Tab');
    assert.equal(await page.locator('#observer-page').inputValue(), '566');
    await page.fill('#observer-page', '');
    await page.locator('#observer-page').press('Tab');
    assert.equal(await page.locator('#observer-page').inputValue(), '566');
    await page.click('#observer-page-previous');
    assert.match(
      await page.locator('#observer-results tbody tr').first().innerText(),
      /PAGED PASS 56400/,
    );
    await page.click('#language-toggle');
    await page.waitForFunction(() =>
      document.querySelector('#observer-page-status').textContent.includes('Passes'),
    );
    assert.equal(await page.locator('#observer-results tbody tr').count(), 100);
    assert.equal(await page.locator('#observer-page').inputValue(), '1');
    await page.click('#language-toggle');
    await page.screenshot({ path: output + '/observer-large-pagination.png' });
    await page.evaluate(() => ObserverUI.render(window.__paginationSeed));
    for (const language of ['ar', 'en']) {
      if (language === 'en') await page.click('#language-toggle');
      await page.click('#observer-word');
      await page.waitForFunction(
        () => !document.getElementById('observer-download').hidden,
        {},
        { timeout: 45000 },
      );
      assert((await page.locator('#observer-download').getAttribute('download')).endsWith('.zip'));
      const bytes = Buffer.from(
        await page.evaluate(async () =>
          Array.from(
            new Uint8Array(await (await StateStore.get('observer-word')).blob.arrayBuffer()),
          ),
        ),
      );
      checkWordBundle(bytes, language);
    }
    // Cancel a second preparation without throwing away the computed passes.
    await page.click('#observer-word');
    await page.click('#observer-cancel');
    assert.equal(await page.evaluate(() => ObserverUI.result.result.rows.length), 1001);
    assert.equal(await page.locator('#observer-form').getAttribute('aria-busy'), 'false');
    assert(await page.locator('#observer-download').isHidden());
    await page.screenshot({ path: output + '/observer-word-bundle.png' });
    assert.deepEqual(errors, []);
  } catch (error) {
    console.error(
      'Observer scope diagnostic',
      await page.evaluate(() => ({
        scope: document.getElementById('observer-scope').value,
        status: document.getElementById('observer-status').textContent,
        total: window.ObserverUI?.result?.result.total,
        invalid: [...document.querySelectorAll('#observer-form [aria-invalid=true]')].map(
          (n) => n.id,
        ),
      })),
      errors,
    );
    await page.screenshot({ path: output + '/observer-scopes-failure.png' });
    throw error;
  } finally {
    await context.close();
  }
  console.log(
    'PASS: observer active/current catalogs above 500, military/intelligence, multi-type deduplication, exact archived inputs and cancellation',
  );
}
module.exports = { checkBrowserObserverScopes };
