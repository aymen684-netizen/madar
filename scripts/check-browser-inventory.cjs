const fs = require('node:fs'),
  assert = require('node:assert/strict'),
  zlib = require('node:zlib');
function docxXml(bytes) {
  for (let p = bytes.length - 22; p >= 0; p--) {
    if (bytes.readUInt32LE(p) !== 0x06054b50) continue;
    let at = bytes.readUInt32LE(p + 16);
    const count = bytes.readUInt16LE(p + 10);
    for (let n = 0; n < count; n++) {
      assert.equal(bytes.readUInt32LE(at), 0x02014b50);
      const method = bytes.readUInt16LE(at + 10),
        size = bytes.readUInt32LE(at + 20),
        length = bytes.readUInt16LE(at + 28),
        extra = bytes.readUInt16LE(at + 30),
        comment = bytes.readUInt16LE(at + 32),
        offset = bytes.readUInt32LE(at + 42),
        name = bytes.subarray(at + 46, at + 46 + length).toString();
      if (name === 'word/document.xml') {
        const start =
            offset + 30 + bytes.readUInt16LE(offset + 26) + bytes.readUInt16LE(offset + 28),
          data = bytes.subarray(start, start + size);
        return (method === 8 ? zlib.inflateRawSync(data) : data).toString();
      }
      at += 46 + length + extra + comment;
    }
    break;
  }
  throw Error('Word XML missing');
}
async function checkBrowserInventory(browser, url, output) {
  const source = JSON.parse(fs.readFileSync('public/data/satellite-metadata-summary.json')),
    payloads = Object.values(source.satellites).filter((r) => r.type === 'PAY').length;
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
        isMobile: mobile,
        hasTouch: mobile,
      }),
      page = await context.newPage(),
      requests = [],
      errors = [];
    const fixture = {
      ...JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json')),
      EPOCH: new Date().toISOString(),
    };
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) =>
      requests.push({ url: r.url(), method: r.method(), body: r.postData() }),
    );
    await page.route('**/api/orbits?*', (r) =>
      r.fulfill({
        contentType: 'application/json',
        headers: { 'X-Madar-Fetched-At': String(Date.now()), 'X-Madar-Connection': 'upstream' },
        body: JSON.stringify([fixture]),
      }),
    );
    await page.route('https://celestrak.org/**', (r) =>
      r.fulfill({ contentType: 'application/json', body: JSON.stringify([fixture]) }),
    );
    try {
      await page.goto(url);
      await page.waitForFunction(() => window.MadarShell && objects.length);
      await page.evaluate(() => MadarI18n.ready);
      assert(!requests.some((r) => r.url.includes('/satellite-metadata.json')));
      assert.equal(await page.locator('#inventory-owner option').count(), 1);
      await page.click('#shell-nav-reports');
      await page.click('#shell-report-inventory');
      await page.waitForFunction(
        () => document.getElementById('inventory-owner').options.length > 100,
      );
      assert(
        !requests.some((r) => r.url.includes('/satellite-metadata.json')),
        'inventory tab itself must not download expanded catalog',
      );
      await page.selectOption('#inventory-owner', 'SAUD');
      await page.click('#inventory-run');
      await page.waitForFunction(
        () =>
          CountryInventory.current()?.owner === 'SAUD' ||
          document.getElementById('inventory-status').textContent.startsWith('تعذّر'),
      );
      assert.equal(
        await page.evaluate(() => CountryInventory.current()?.owner),
        'SAUD',
        await page.locator('#inventory-status').innerText(),
      );
      const r = await page.evaluate(() => ({
        report: CountryInventory.current(),
        expected: SatMetadata.inventoryRecords('SAUD'),
      }));
      assert.equal(r.report.rows.length, r.expected.length);
      assert(r.report.rows.length > 0);
      assert(r.report.rows.every((x) => x.ownerCode === 'SAUD'));
      assert.equal(r.report.sourceSha256, source.sourceSha256);
      assert.equal(
        r.report.rows[0].launch,
        r.expected.find((x) => x.id === r.report.rows[0].id).launch,
      );
      assert.equal(requests.filter((r) => r.url.includes('/satellite-metadata.json')).length, 1);
      assert((await page.locator('#inventory-note').innerText()).includes('المشتركة'));
      assert.equal(
        await page.locator('#inventory-table tbody tr').count(),
        Math.min(50, r.report.rows.length),
      );
      const jsonEvent = page.waitForEvent('download');
      await page.click('#inventory-json');
      const json = JSON.parse(fs.readFileSync(await (await jsonEvent).path()));
      assert.equal(json.rows.length, r.report.rows.length);
      assert.equal(json.sourceSha256, source.sourceSha256);
      await page.click('#inventory-word');
      await page.waitForFunction(
        () => !document.getElementById('inventory-download').hidden,
        {},
        { timeout: 60000 },
      );
      const wordEvent = page.waitForEvent('download');
      await page.click('#inventory-download');
      const word = fs.readFileSync(await (await wordEvent).path());
      const { validDocx } = await import('../worker/docx-validation.js');
      assert(validDocx(word));
      const xml = docxXml(word);
      assert(xml.includes('landscape'));
      assert(xml.includes(String(r.report.rows[0].id)));
      assert(xml.includes(r.report.rows[0].launch));
      assert(xml.includes('tblHeader'));
      assert(xml.includes('سجل الفهرس'));
      assert.equal(await page.evaluate(() => !!window.docx), false, 'Word library stays in worker');
      await page.waitForFunction(() => !document.getElementById('inventory-share').hidden);
      const popupEvent = page.waitForEvent('popup');
      await page.click('#inventory-print');
      const popup = await popupEvent;
      await popup.waitForFunction(() => document.querySelector('button')?.disabled === false);
      assert.equal(await popup.locator('tbody tr').count(), r.report.rows.length);
      assert.equal(await popup.locator('html').getAttribute('dir'), 'rtl');
      await popup.close();
      await page.screenshot({
        path: output + '/inventory-' + (mobile ? 'mobile' : 'desktop') + '.png',
      });
      await page.selectOption('#inventory-owner', 'all');
      assert(await page.locator('#inventory-results').isHidden());
      await page.click('#inventory-run');
      await page.waitForFunction(() => CountryInventory.current()?.owner === 'all');
      assert.equal(await page.evaluate(() => CountryInventory.current().rows.length), payloads);
      assert.equal(await page.locator('#inventory-table tbody tr').count(), 50);
      const before = await page.locator('#inventory-table tbody tr').first().innerText();
      await page.click('#inventory-next');
      assert.notEqual(await page.locator('#inventory-table tbody tr').first().innerText(), before);
      const csvEvent = page.waitForEvent('download');
      await page.click('#inventory-csv');
      const csv = fs.readFileSync(await (await csvEvent).path(), 'utf8');
      assert(csv.startsWith('\uFEFF'));
      const last = await page.evaluate(() => CountryInventory.current().rows.at(-1).id);
      assert(csv.includes('"' + last + '"'));
      await page.click('#inventory-word');
      await page.click('#inventory-cancel');
      assert(await page.locator('#inventory-cancel').isHidden());
      assert(await page.locator('#inventory-word').isEnabled());
      assert(await page.locator('#inventory-download').isHidden());
      assert.equal(await page.locator('#inventory-brief .report-quality-metrics dd').count(), 5);
      await page.locator('#inventory-brief').scrollIntoViewIfNeeded();
      await page.screenshot({
        path: output + '/inventory-quality-' + (mobile ? 'mobile' : 'desktop') + '.png',
      });
      await page.selectOption('#inventory-detail', 'brief');
      await page.click('#inventory-word');
      await page.waitForFunction(
        () => !document.getElementById('inventory-download').hidden,
        {},
        { timeout: 60000 },
      );
      const briefEvent = page.waitForEvent('download');
      await page.click('#inventory-download');
      const briefBytes = fs.readFileSync(await (await briefEvent).path()),
        briefXml = docxXml(briefBytes);
      assert(!briefXml.includes('<w:tbl>'));
      assert(briefXml.includes('الملخص التنفيذي'));
      assert(briefXml.includes(String(payloads)));
      fs.writeFileSync(
        output + '/inventory-all-brief-' + (mobile ? 'mobile' : 'desktop') + '.docx',
        briefBytes,
      );
      const briefPopupEvent = page.waitForEvent('popup');
      await page.click('#inventory-print');
      const briefPopup = await briefPopupEvent;
      await briefPopup.waitForFunction(() => document.querySelector('button')?.disabled === false);
      assert.equal(await briefPopup.locator('tbody tr').count(), 0);
      assert((await briefPopup.locator('body').innerText()).includes(String(payloads)));
      await briefPopup.close();
      await page.selectOption('#inventory-detail', 'full');
      assert(await page.locator('#inventory-download').isHidden());
      await page.click('#language-toggle');
      await page.waitForFunction(() => document.documentElement.lang === 'en');
      const english = await page.locator('#inventory-panel').innerText();
      assert(!/[\u0620-\u064a]/.test(english), english);
      if (mobile) assert.equal(await page.evaluate(() => document.body.scrollWidth), 390);
      await page.screenshot({
        path: output + '/inventory-en-' + (mobile ? 'mobile' : 'desktop') + '.png',
      });
      assert(requests.every((r) => r.method === 'GET' && !r.body));
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
  console.log(
    'PASS: inventory lazy catalog, source SHA, country isolation, all payloads with bounded DOM, full JSON/CSV/Word/PDF, real Word worker/cancel, bilingual desktop/mobile and zero uploads',
  );
}
module.exports = { checkBrowserInventory, docxXml };
