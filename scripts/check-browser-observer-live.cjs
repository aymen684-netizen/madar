// Opt-in integration check: public Riyadh coordinates, live catalog, no orbital fixtures.
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  { execFileSync } = require('node:child_process'),
  { chromium } = require('playwright');
const url = process.env.MADAR_TEST_URL;
assert(
  url && new URL(url).hostname.endsWith('.workers.dev'),
  'Explicit Workers test origin required',
);
const output = path.resolve('test-results/observer-live');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-webgl'],
    }),
    context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    }),
    page = await context.newPage(),
    errors = [],
    began = Date.now();
  let monitor;
  page.setDefaultTimeout(60000);
  page.on('pageerror', (e) => errors.push(e.message));
  const evidence = {
    url,
    source: 'Live application catalog, no route interception or fixtures',
    period: '2026-10-21 18:00 to 2026-10-22 18:00 UTC+03:00',
    observer: { lat: 24.7136, lon: 46.6753, height: 0, minElevation: 10 },
    bundles: [],
  };
  try {
    // Establish that the deployed application assets are exactly those being reviewed.
    for (const file of ['index.html', 'observer.js', 'i18n.js', 'data/en.json']) {
      const response = await context.request.get(new URL(file, url).href);
      assert(response.ok(), file);
      assert(
        (await response.body()).equals(fs.readFileSync('public/' + file)),
        'Deployed asset differs: ' + file,
      );
    }
    evidence.observerJsSha256 = crypto
      .createHash('sha256')
      .update(fs.readFileSync('public/observer.js'))
      .digest('hex');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.ObserverUI && window.MadarShell, null, {
      timeout: 180000,
    });
    await page.evaluate(() => MadarI18n.ready);
    await page.locator('#welcome-report').click();
    await page.locator('#shell-report-observer').click();
    if ((await page.locator('#observer-form').getAttribute('data-report-guided')) === 'true')
      await page.locator('#observer-guide-toggle').click();
    await page.locator('#observer-name').fill('اختبار الرياض العام');
    await page.locator('#observer-lat').fill('24.7136');
    await page.locator('#observer-lon').fill('46.6753');
    await page.locator('#observer-height').fill('0');
    if (!(await page.locator('#observer-elevation').isVisible()))
      await page.locator('#observer-guide-advanced > summary').click();
    await page.locator('#observer-elevation').fill('10');
    await page.locator('#observer-zone').selectOption('3');
    await page.locator('#observer-date').fill('2026-10-21');
    await page.locator('#observer-start').fill('18:00:00');
    await page.locator('#observer-end').fill('18:00:00');
    await page.locator('#observer-next').check();
    await page.locator('#observer-scope').selectOption('active');
    monitor = setInterval(async () => {
      try {
        console.log(
          'LIVE PROGRESS',
          await page.locator('#observer-status').textContent({ timeout: 5000 }),
        );
      } catch {}
    }, 15000);
    await page.locator('#observer-form button[type=submit]').click();
    await page.waitForFunction(
      () => window.ObserverUI.result && !document.getElementById('observer-word').disabled,
      null,
      { timeout: 900000 },
    );
    evidence.calculationMs = Date.now() - began;
    const actual = await page.evaluate(() => {
      const r = ObserverUI.result;
      return {
        scanned: r.result.total,
        passes: r.result.rows.length,
        unique: r.result.unique,
        invalid: r.result.invalid,
        quality: r.result.quality,
        archive: { id: r.archive.id, sha256: r.archive.sha256 },
        expected: r.result.rows.map((p) => ({ name: p.name, id: p.id })),
      };
    });
    const expectedPath = path.join(output, 'expected-passes.json');
    fs.writeFileSync(expectedPath, JSON.stringify(actual.expected));
    const { expected, ...summary } = actual;
    Object.assign(evidence, summary);
    assert(actual.scanned > 500, 'Full catalog, not a selected/favorites subset');
    assert(actual.passes > 500, 'Large actual orbital result is required');
    assert.equal(await page.locator('#observer-results tbody tr').count(), 100);
    assert.equal(await page.locator('#observer-results .pass-map-button').count(), 100);
    const pages = Math.ceil(actual.passes / 100);
    await page.locator('#observer-page').fill(String(pages));
    await page.locator('#observer-page').press('Tab');
    assert.equal(
      await page.locator('#observer-results tbody tr').count(),
      actual.passes - (pages - 1) * 100,
    );
    assert(
      (await page.locator('#observer-results tbody tr').last().textContent()).includes(
        actual.expected.at(-1).name,
      ),
    );
    await page.locator('#observer-page').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'pagination-last-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#observer-page').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'pagination-last-mobile.png') });
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const language of ['ar', 'en']) {
      if (language === 'en') await page.locator('#language-toggle').click();
      const started = Date.now();
      await page.locator('#observer-word').click();
      await page.waitForFunction(
        () =>
          !document.getElementById('observer-download').hidden &&
          document.getElementById('observer-download').download.endsWith('.zip'),
        null,
        { timeout: 240000 },
      );
      const readyMs = Date.now() - started,
        downloadPromise = page.waitForEvent('download');
      await page.locator('#observer-download').click();
      const downloaded = await downloadPromise,
        bundlePath = path.join(output, 'observer-' + language + '.zip');
      await downloaded.saveAs(bundlePath);
      const bytes = fs.readFileSync(bundlePath);
      const validation = JSON.parse(
        execFileSync(
          'python3',
          [
            '-c',
            `
import io,json,sys,zipfile,xml.etree.ElementTree as E
expected=json.load(open(sys.argv[2]))
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
index=0
counts=[]
with zipfile.ZipFile(sys.argv[1]) as package:
 assert package.testzip() is None
 docs=[n for n in package.namelist() if n.endswith('.docx')]
 assert len(docs)==(len(expected)+499)//500
 for name in docs:
  with zipfile.ZipFile(io.BytesIO(package.read(name))) as doc:
   assert doc.testzip() is None
   root=E.fromstring(doc.read('word/document.xml'))
   table=root.find('.//w:tbl',ns)
   rows=table.findall('w:tr',ns)[1:]
   assert 0<len(rows)<=500
   counts.append(len(rows))
   for row in rows:
    cells=row.findall('w:tc',ns)
    assert len(cells)==6
    text=''.join(cells[0].itertext())
    # Only Word text nodes contribute to the displayed satellite identity.
    text=''.join(t.text or '' for t in cells[0].findall('.//w:t',ns))
    p=expected[index]
    assert text==p['name']+str(p['id']),(index,text,p)
    index+=1
assert index==len(expected)
print(json.dumps({'documents':len(counts),'passes':index,'partRows':counts}))
`,
            bundlePath,
            expectedPath,
          ],
          { encoding: 'utf8' },
        ),
      );
      evidence.bundles.push({
        language,
        readyMs,
        bytes: bytes.length,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        ...validation,
      });
      assert.equal(await page.evaluate(() => ObserverUI.result.result.rows.length), actual.passes);
      await page.locator('#observer-word').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, 'word-ready-' + language + '.png') });
      console.log('LIVE BUNDLE VERIFIED', JSON.stringify(evidence.bundles.at(-1)));
    }
    assert.deepEqual(errors, []);
    evidence.passed = true;
    console.log(
      'PASS: real full-day full-catalog observing result, responsive pagination, desktop/mobile views and complete Arabic/English downloaded Word bundles',
      JSON.stringify(evidence),
    );
  } catch (error) {
    evidence.passed = false;
    evidence.error = error.message;
    evidence.pageErrors = errors;
    try {
      evidence.status = await page.locator('#observer-status').textContent({ timeout: 5000 });
      await page.screenshot({ path: path.join(output, 'failure.png'), timeout: 10000 });
    } catch {}
    throw error;
  } finally {
    clearInterval(monitor);
    fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
