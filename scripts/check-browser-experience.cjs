const fs = require('fs'),
  assert = require('assert/strict'),
  { inflateRawSync } = require('zlib');
function documentXml(b) {
  for (let i = 0; i < b.length - 46; i++)
    if (b.readUInt32LE(i) === 0x02014b50) {
      const n = b.readUInt16LE(i + 28);
      if (b.subarray(i + 46, i + 46 + n).toString() === 'word/document.xml') {
        const at = b.readUInt32LE(i + 42),
          start = at + 30 + b.readUInt16LE(at + 26) + b.readUInt16LE(at + 28),
          bytes = b.subarray(start, start + b.readUInt32LE(i + 20));
        return (b.readUInt16LE(i + 10) === 8 ? inflateRawSync(bytes) : bytes).toString();
      }
    }
  throw Error('Missing document XML');
}

async function checkBrowserExperience(browser, url, output) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    madarWelcome: true,
  });
  const page = await context.newPage(),
    errors = [],
    requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requests.push(r.url()));
  const fixture = {
    ...JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json')),
    EPOCH: new Date().toISOString(),
  };
  await page.route('https://celestrak.org/**', (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify([fixture]) }),
  );
  await page.route('**/data/satellite-metadata*.json*', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ owners: {}, satellites: {} }),
    }),
  );
  await page.route('**/data/mission-profiles.json*', (r) =>
    r.fulfill({ contentType: 'application/json', body: '{"satellites":{},"programs":{}}' }),
  );
  await page.route('https://www.youtube-nocookie.com/**', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body>TEST STREAM FRAME</body></html>',
    }),
  );
  try {
    await page.goto(url);
    await page.waitForFunction(
      () =>
        window.MadarI18n && window.MadarShell && window.MadarDataRefresh && objects.length === 1,
    );
    await page.evaluate(() => MadarI18n.ready);
    const translationProbe = await page.evaluate(async () => {
      const host = document.createElement('span'),
        node = document.createTextNode('إنشاء التقرير'),
        native = Object.getOwnPropertyDescriptor(Node.prototype, 'nodeValue'),
        settle = () => new Promise((resolve) => setTimeout(resolve, 0));
      let reads = 0;
      Object.defineProperty(node, 'nodeValue', {
        get() {
          reads++;
          return native.get.call(node);
        },
        set(value) {
          native.set.call(node, value);
        },
      });
      host.append(node);
      document.body.append(host);
      await settle();
      const arabicReads = reads;
      MadarI18n.setLanguage('en');
      await settle();
      const englishInitial = native.get.call(node);
      reads = 0;
      node.nodeValue = 'جارٍ تجهيز Word…';
      await settle();
      const englishReads = reads,
        englishDynamic = native.get.call(node);
      MadarI18n.setLanguage('ar');
      await settle();
      const restored = native.get.call(node);
      reads = 0;
      node.nodeValue = 'إنشاء التقرير';
      await settle();
      const returnedArabicReads = reads,
        original = MadarI18n.original(node);
      host.remove();
      return {
        arabicReads,
        englishInitial,
        englishReads,
        englishDynamic,
        restored,
        returnedArabicReads,
        original,
      };
    });
    assert.equal(translationProbe.arabicReads, 0);
    assert.equal(translationProbe.englishInitial, 'Generate report');
    assert(translationProbe.englishReads > 0);
    assert.equal(translationProbe.englishDynamic, 'Preparing Word…');
    assert.equal(translationProbe.restored, 'جارٍ تجهيز Word…');
    assert.equal(translationProbe.returnedArabicReads, 0);
    assert.equal(translationProbe.original, 'إنشاء التقرير');
    console.log(
      'PASS: real DOM translation probe is idle in Arabic, translates dynamic English and restores current Arabic originals',
    );
    assert(await page.locator('#welcome-dialog').isVisible());
    assert.equal(await page.locator('#welcome-title').count(), 0);
    assert(!(await page.locator('#welcome-dialog').textContent()).includes('جاهز للاستكشاف'));
    await page.screenshot({ path: output + '/experience-welcome-ar.png' });
    await page.click('#welcome-language');
    await page.waitForFunction(() => document.documentElement.lang === 'en');
    assert.equal(await page.locator('html').getAttribute('dir'), 'ltr');
    assert.equal(await page.locator('#welcome-start').textContent(), 'Launch Madar');
    await page.screenshot({ path: output + '/experience-welcome-en.png' });
    await page.click('#welcome-start');
    assert(await page.locator('#welcome-dialog').isHidden());
    await page.waitForFunction(() => selection.current);
    assert.equal(await page.locator('#shell-nav-reports').textContent(), 'Reports');
    assert(await page.locator('.brand img').isVisible());
    await page.waitForFunction(
      () =>
        document.querySelector('.brand img').naturalWidth > 0 &&
        document.querySelector('#welcome-dialog img').naturalWidth > 0,
    );
    await page.click('#shell-nav-reports');
    assert.equal(await page.locator('#report-run').textContent(), 'Generate report');
    assert.equal(
      await page.locator('#report-country option[value="682"]').textContent(),
      'Saudi Arabia',
    );
    const v = await page.locator('#report-start-date').evaluate((e) => ({
      size: parseFloat(getComputedStyle(e).fontSize),
      color: getComputedStyle(e).color,
      bg: getComputedStyle(e).backgroundColor,
    }));
    assert(v.size >= 18);
    assert(!['rgb(255, 255, 255)', 'rgb(231, 237, 245)'].includes(v.color));
    assert.equal(v.bg, 'rgb(22, 56, 73)');
    await page.check('#report-build-mission-on');
    await page.fill('#report-build-mission', 'communications');
    await page.evaluate(() => {
      const c = {
        group: 'mission',
        ownerEnabled: false,
        missionEnabled: true,
        mission: 'communications',
        evidence: 'all',
        altitudeEnabled: false,
        timeEnabled: false,
      };
      if (
        !CountryReportCore.metadataMatches(
          { missionLabel: 'اتصالات تجريبية', missionKind: 'category' },
          c,
        )
      )
        throw Error('English mission search failed');
    });
    await page.screenshot({ path: output + '/experience-reports-en.png' });
    await page
      .locator('#report-scope-step')
      .screenshot({ path: output + '/experience-report-fields-en.png' });
    await page.uncheck('#report-build-mission-on');
    await page.check('#report-build-owner-on');
    await page.selectOption('#report-build-owners', ['unknown']);
    await page.selectOption('#report-scope', 'group');
    await page.click('#report-run');
    await page.waitForFunction(
      () => finishedReport && !document.getElementById('report-download').hidden,
      {},
      { timeout: 30000 },
    );
    assert.equal(
      await page.evaluate(() => finishedReport.criteria.ownerLabels[0]),
      'الدولة أو الجهة غير متاحة',
    );
    let fileEvent = page.waitForEvent('download');
    await page.click('#report-download');
    let generated = await fileEvent;
    await generated.saveAs(output + '/experience-country-en.docx');
    let xml = documentXml(fs.readFileSync(await generated.path()));
    assert(xml.includes('Satellite pass report over'));
    assert(!/[\u0620-\u064a]/.test(xml), 'English Word contains untranslated text');
    await page.click('#language-toggle');
    await page.waitForFunction(() => !document.getElementById('report-download').hidden);
    fileEvent = page.waitForEvent('download');
    await page.click('#report-download');
    generated = await fileEvent;
    xml = documentXml(fs.readFileSync(await generated.path()));
    assert(xml.includes('تقرير مرور الأقمار فوق'));
    await page.click('#language-toggle');
    await page.waitForFunction(() => !document.getElementById('report-download').hidden);

    const leftovers = [];
    async function collect() {
      leftovers.push(
        ...(await page.evaluate(() => {
          const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT),
            out = [];
          let n;
          while ((n = walk.nextNode())) {
            const e = n.parentElement;
            if (
              !e ||
              e.closest('script,style,[data-no-translate],#welcome-language,#language-toggle') ||
              !e.checkVisibility()
            )
              continue;
            if (/[\u0600-\u06ff]/.test(n.textContent)) out.push(n.textContent.trim());
          }
          return out;
        })),
      );
    }
    await collect();
    await page.click('#shell-report-analysis');
    await collect();
    await page.click('#shell-report-observer');
    await collect();
    await page.click('#shell-nav-help');
    await page.click('#program-guide');
    await page.fill('#guide-search', 'eccentricity');
    assert.equal(await page.locator('.guide-term:visible').count(), 1);
    await page.fill('#guide-search', '');
    await collect();
    await page.click('#overview-preview');
    await page.waitForFunction(() =>
      document.getElementById('overview-content').textContent.includes('Accuracy limits'),
    );
    const download = page.waitForEvent('download');
    await page.locator('#overview-dialog>a').click();
    assert(
      fs
        .readFileSync(await (await download).path())
        .equals(fs.readFileSync('public/downloads/madar-overview-en.docx')),
    );
    await page.screenshot({ path: output + '/experience-overview-en.png' });
    await page.keyboard.press('Escape');
    await page.click('#shell-nav-map');
    await page.click('#live-video-open');
    assert(!requests.some((u) => /youtube-nocookie/.test(u)));
    await page.selectOption('#live-source', 'sen');
    assert.equal(
      await page.locator('#live-video-source').getAttribute('href'),
      'https://www.sen.com/',
    );
    assert(await page.locator('#live-video-play').isHidden());
    assert.equal(await page.locator('#live-video-frame iframe').count(), 0);
    await page.selectOption('#live-source', 'esa');
    assert.equal(
      await page.locator('#live-video-source').getAttribute('href'),
      'https://watch.esa.int/',
    );
    await page.selectOption('#live-source', 'nasa');
    assert(await page.locator('#live-video-play').isHidden());
    assert.equal(await page.locator('#live-video-frame iframe').count(), 0);
    assert(!requests.some((u) => /youtube-nocookie/.test(u)));
    await page.selectOption('#live-source', 'sen');
    assert.equal(await page.locator('#live-video-frame iframe').count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.body.scrollWidth), 390);
    await page.screenshot({ path: output + '/experience-streams-en-mobile.png' });
    await page.click('#shell-nav-reports');
    await page.click('#shell-report-country');
    assert.equal(await page.evaluate(() => document.body.scrollWidth), 390);
    await page.screenshot({ path: output + '/experience-reports-en-mobile.png' });
    await page
      .locator('#report-scope-step')
      .screenshot({ path: output + '/experience-report-fields-en-mobile.png' });
    await page.click('#language-toggle');
    assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
    assert.equal(await page.locator('#report-run').textContent(), 'إنشاء التقرير');
    await page.screenshot({ path: output + '/experience-reports-ar-mobile.png' });
    await page
      .locator('#report-scope-step')
      .screenshot({ path: output + '/experience-report-fields-ar-mobile.png' });
    await page.click('#language-toggle');
    await page.goto(url);
    await page.waitForFunction(() => document.documentElement.lang === 'en' && window.MadarShell);
    assert(await page.locator('#welcome-dialog').isVisible());
    assert(await page.locator('#globe-card').isHidden());
    await page.click('#welcome-start');
    assert.equal(await page.locator('#report-run').textContent(), 'Generate report');
    fs.writeFileSync(
      output + '/english-untranslated.json',
      JSON.stringify([...new Set(leftovers)], null, 2),
    );
    console.log('English translation audit:', [...new Set(leftovers)]);
    assert(
      !leftovers.some((s) => /[\u0620-\u064a]/.test(s)),
      'Untranslated English interface labels',
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS: first-visit welcome, language direction and persistence, reversible labels, readable report fields, English mission search and glossary, English overview download, official alternate streams and mobile layouts',
    );
  } finally {
    await context.close();
  }
}
module.exports = { checkBrowserExperience };
