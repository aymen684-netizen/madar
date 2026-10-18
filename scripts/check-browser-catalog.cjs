const assert = require('assert/strict'),
  fs = require('fs');
async function checkBrowserCatalog(browser, url, output) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    page = await context.newPage(),
    errors = [];
  const fixture = JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json', 'utf8'));
  const data = [
    {
      ...fixture,
      NORAD_CAT_ID: 25544,
      OBJECT_NAME: 'ISS (ZARYA)',
      OBJECT_ID: '1998-067A',
      EPOCH: new Date().toISOString(),
    },
    ...Array.from({ length: 300 }, (_, i) => ({
      ...fixture,
      NORAD_CAT_ID: 100001 + i,
      OBJECT_NAME: 'TEST OMM ' + (i + 1),
      EPOCH: new Date(Date.now() - 5 * 86400000).toISOString(),
    })),
  ];
  data[1].OBJECT_NAME = 'ZULU';
  data[2].OBJECT_NAME = 'ALPHA';
  data[3].EPOCH = new Date(Date.now() - 3 * 86400000).toISOString();
  await page.route('**/data/mission-profiles.json*', (r) =>
    r.fulfill({ contentType: 'application/json', body: '{"programs":{},"satellites":{}}' }),
  );
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://celestrak.org/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) }),
  );
  try {
    await page.goto(url);
    await page.waitForFunction(
      () => objects.length === 301 && document.querySelectorAll('#list button').length === 100,
    );
    assert((await page.locator('#results-summary').textContent()).includes('301'));
    await page.click('#saved');
    assert(await page.locator('#catalog-empty-browse').isVisible());
    assert(await page.locator('.sat-identity').isHidden());
    assert(await page.locator('#epoch').isHidden());
    await page.locator('#catalog-empty-actions').scrollIntoViewIfNeeded();
    await page.screenshot({ path: output + '/empty-watchlist-desktop.png' });
    await page.click('#catalog-empty-browse');
    assert.equal(await page.evaluate(() => onlySaved), false);
    assert(await page.locator('.sat-identity').isVisible());
    assert(await page.locator('#epoch').isVisible());
    assert.equal(await page.locator('#list button').count(), 100);
    let releaseRefresh;
    const gate = new Promise((resolve) => (releaseRefresh = resolve));
    await page.route('https://celestrak.org/**', async (r) => {
      await gate;
      await r.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.selectOption('#group', 'weather');
    await page.waitForFunction(
      () => document.querySelector('.catalog').getAttribute('aria-busy') === 'true',
    );
    assert(await page.locator('#catalog-loading').isVisible());
    assert(await page.locator('#refresh').isDisabled());
    assert.equal(await page.locator('#list button').count(), 100);
    await page.locator('#catalog-loading').scrollIntoViewIfNeeded();
    await page.screenshot({ path: output + '/catalog-loading-desktop.png' });
    releaseRefresh();
    await page.waitForFunction(
      () => document.querySelector('.catalog').getAttribute('aria-busy') === 'false',
    );
    assert(await page.locator('#catalog-loading').isHidden());

    assert(await page.locator('#list-previous').isDisabled());
    await page.click('#list-next');
    assert((await page.locator('#list button').first().textContent()).includes('100100'));
    await page.click('#list-next');
    await page.click('#list-next');
    assert.equal(await page.locator('#list button').count(), 1);
    assert((await page.locator('#list button').textContent()).includes('100300'));
    assert(await page.locator('#list-next').isDisabled());
    await page.fill('#search', '٢٥٥٤٤');
    assert.equal(await page.locator('#list button').count(), 1);
    assert((await page.locator('#list button').textContent()).includes('ISS'));
    assert(await page.locator('#list-pagination').isHidden());
    await page.fill('#search', '1998–067A');
    assert.equal(await page.locator('#list button').count(), 1);
    await page.fill('#search', 'NORAD ١٠٠٢٥٧');
    assert.equal(await page.locator('#list button').count(), 1);
    assert((await page.locator('#list button').textContent()).includes('TEST OMM 257'));
    assert((await page.locator('#list .catalog-quality').textContent()).includes('72 ساعة'));
    assert((await page.locator('#list .catalog-quality').textContent()).includes('غير موثقة'));
    await page.locator('#list button').click();
    await page.click('#globe-card-favorite');
    await page.keyboard.press('Escape');
    await page.click('#saved');
    assert.equal(await page.locator('#list button').count(), 1);
    await page.fill('#search', 'لا يوجد هذا القمر');
    assert.equal(await page.locator('#list button').count(), 0);
    assert((await page.locator('#list').textContent()).includes('ضمن المفضلة'));
    assert.equal(await page.evaluate(() => selection.current), null);
    assert(await page.locator('#catalog-empty-reset').isVisible());
    await page.click('#catalog-empty-reset');
    assert.equal(await page.locator('#list button').count(), 1);
    await page.click('#all');
    assert.equal(await page.locator('#list button').count(), 100);
    await page.click('#list-next');
    await page.selectOption('#catalog-freshness', 'recent');
    assert.equal(await page.locator('#list button').count(), 1);
    assert((await page.locator('#list button').textContent()).includes('ISS'));
    assert(await page.locator('#list-pagination').isHidden());
    await page.selectOption('#catalog-freshness', 'old');
    assert.equal(await page.evaluate(() => rows().length), 300);
    assert((await page.locator('#health-range').textContent()).includes('300 من 300'));
    assert.equal(await page.locator('#list button').count(), 100);
    await page.selectOption('#catalog-sort', 'name');
    assert((await page.locator('#list button').first().textContent()).includes('ALPHA'));
    await page.selectOption('#catalog-sort', 'newest');
    assert.equal(await page.evaluate(() => rows()[0].id), 100003);
    await page.selectOption('#catalog-freshness', 'recent');
    await page.evaluate(() => {
      fixedTime = new Date(OrbitData.epoch(objects.find((o) => o.id === 100001)));
      update();
    });
    assert.equal(
      await page.evaluate(() => rows().length),
      299,
      'historical display time determines freshness',
    );
    await page.click('#live');
    assert.equal(await page.evaluate(() => rows().length), 1);
    await page.selectOption('#catalog-freshness', 'old');
    await page.waitForFunction(() => {
      const d = JSON.parse(localStorage.getItem('madar-draft-v1') || 'null');
      return (
        d?.fields?.['catalog-freshness'] === 'old' &&
        d.fields['catalog-sort'] === 'newest' &&
        !d.fixedTime
      );
    });
    await page.reload();
    await page.waitForFunction(
      () =>
        $('catalog-freshness').value === 'old' &&
        $('catalog-sort').value === 'newest' &&
        rows().length === 300,
    );
    assert.equal(await page.evaluate(() => rows()[0].id), 100003);
    await page.keyboard.press('Escape');
    await page.click('#reset-catalog-filters');
    assert.equal(await page.evaluate(() => rows().length), 301);
    assert.equal(await page.inputValue('#catalog-freshness'), 'all');
    assert.equal(await page.inputValue('#catalog-sort'), 'original');
    assert.equal(await page.evaluate(() => watchlist.items.length), 1);
    await page.click('#saved');
    await page.selectOption('#catalog-freshness', 'recent');
    assert.equal(await page.evaluate(() => rows().length), 0);
    await page.click('#reset-catalog-filters');
    assert.equal(await page.evaluate(() => onlySaved), true);
    assert.equal(await page.evaluate(() => rows().length), 1);
    await page.click('#all');
    await page.selectOption('#catalog-freshness', 'old');
    await page.selectOption('#catalog-sort', 'newest');
    await page.evaluate(() => {
      pausedAt = new Date(dateNow());
      paused = true;
      world?.pauseAnimation();
    });
    await page.locator('#catalog-freshness').scrollIntoViewIfNeeded();
    await page.screenshot({ path: output + '/catalog-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#results-summary').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.body.scrollWidth), 390);
    await page.screenshot({ path: output + '/catalog-mobile.png' });
    assert.deepEqual(errors, []);
    console.log(
      'PASS: all results reachable, Arabic search, 24/72-hour filtering at historical display time, sorting, persisted filters, safe reset and mobile width',
    );
  } finally {
    await context.close();
  }
}
module.exports = { checkBrowserCatalog };
