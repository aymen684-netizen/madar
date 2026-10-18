const baseUrl = process.env.MADAR_TEST_URL || 'http://127.0.0.1:8080/';
const { chromium } = require('playwright');
const fs = require('fs'),
  http = require('http'),
  path = require('path'),
  assert = require('assert/strict');
const root = path.resolve('public');
const output = path.resolve('test-results');
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  const file = path.join(
    root,
    decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]),
  );
  if (!fs.existsSync(file)) {
    res.writeHead(404);
    return res.end();
  }
  const types = {
    '.js': 'text/javascript',
    '.html': 'text/html',
    '.json': 'application/json',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
  };
  res.setHeader('Content-Type', types[path.extname(file)] || 'text/plain');
  res.end(
    path.extname(file) === '.html'
      ? fs
          .readFileSync(file, 'utf8')
          .replace('<head>', '<head><meta name="madar-orbit-relay" content="enabled">')
      : fs.readFileSync(file),
  );
});
(async () => {
  await new Promise((r) => server.listen(8080, '127.0.0.1', r));
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const originalContext = browser.newContext.bind(browser);
  browser.newContext = async function (options = {}) {
    const { madarWelcome, ...actual } = options;
    const context = await originalContext(actual);
    if (!madarWelcome)
      await context.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
          document.getElementById('welcome-start')?.click();
        });
      });
    return context;
  };
  try {
    const { checkBrowserStartup } = require('./check-browser-startup.cjs');
    await checkBrowserStartup(browser, baseUrl, output);
    const { checkBrowserFleetExperience } = require('./check-browser-fleet-experience.cjs');
    await checkBrowserFleetExperience(browser, baseUrl, output);
    const { checkBrowserCalendar } = require('./check-browser-calendar.cjs');
    await checkBrowserCalendar(browser, baseUrl, output);
    const { checkBrowserOrbitFilter } = require('./check-browser-orbit-filter.cjs');
    await checkBrowserOrbitFilter(browser, baseUrl, output);
    const { checkBrowserMotion } = require('./check-browser-motion.cjs');
    await checkBrowserMotion(browser, baseUrl, output);
    const { checkBrowserMapFleet } = require('./check-browser-map-fleet.cjs');
    await checkBrowserMapFleet(browser, baseUrl, output);
    const { checkBrowserFleetPasses } = require('./check-browser-fleet-passes.cjs');
    await checkBrowserFleetPasses(browser, baseUrl, output);
    const { checkBrowserStartPaths } = require('./check-browser-start-paths.cjs');
    await checkBrowserStartPaths(browser, baseUrl, output);
    const { checkBrowserInventory } = require('./check-browser-inventory.cjs');
    await checkBrowserInventory(browser, baseUrl, output);
    const { checkBrowserShell } = require('./check-browser-shell.cjs');
    await checkBrowserShell(browser, baseUrl, output);
    const { checkBrowserMobileFocus } = require('./check-browser-mobile-focus.cjs');
    await checkBrowserMobileFocus(browser, baseUrl, output);
    const { installNavigation } = require('./browser-navigation.cjs');
    await installNavigation(browser);
    const { checkBrowserCatalog } = require('./check-browser-catalog.cjs');
    await checkBrowserCatalog(browser, baseUrl, output);
    const { checkBrowserHelpQuality } = require('./check-browser-help-quality.cjs');
    await checkBrowserHelpQuality(browser, baseUrl, output);
    const { checkBrowserPrivacy } = require('./check-browser-privacy.cjs');
    await checkBrowserPrivacy(browser, baseUrl, output);
    const { checkBrowserConnection } = require('./check-browser-connection.cjs');
    await checkBrowserConnection(browser, baseUrl, output);
    const { checkBrowserMapDisplay } = require('./check-browser-map-display.cjs');
    await checkBrowserMapDisplay(browser, baseUrl, output);
    const { checkBrowserPicking } = require('./check-browser-picking.cjs');
    await checkBrowserPicking(browser, baseUrl, output);
    const { checkBrowserExperience } = require('./check-browser-experience.cjs');
    await checkBrowserExperience(browser, baseUrl, output);
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    await page.route('https://celestrak.org/**', (route) => route.abort());
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') console.log('console:', m.text().slice(0, 240));
    });
    await page.goto(baseUrl);
    const downloadEvent = page.waitForEvent('download');
    await page.click('#program-overview');
    const overviewDownload = await downloadEvent;
    const overviewPath = await overviewDownload.path();
    assert(
      fs
        .readFileSync(overviewPath)
        .equals(fs.readFileSync(path.join(root, 'downloads/madar-overview.docx'))),
    );
    console.log('PASS: overview Word download matches static document before data load');
    await page.click('#shell-nav-map');
    await page.waitForFunction(
      () =>
        world && objects.length && world.particlesData().reduce((n, g) => n + g.length, 0) > 15000,
      {},
      { timeout: 45000 },
    );
    assert(
      (await page.locator('#status').textContent()).includes('2026-10-16'),
      'backup status must show the actual active snapshot date',
    );
    await page.evaluate(() => choose(objects.find((o) => o.id === 900)));
    await page.waitForFunction(() => $('sat-evidence').textContent.includes('مهمة موثقة'));
    assert((await page.locator('#sat-mission').textContent()).includes('معايرة'));
    assert((await page.locator('#sat-launch').textContent()).includes('1964'));
    assert((await page.locator('#globe-card-sources a').count()) >= 1);
    await page.screenshot({ path: output + '/metadata-individual.png' });
    const program = await page.evaluate(() => {
      const o = objects.find((o) => SatMetadata.get(o.id).missionKind === 'program');
      if (!o) return null;
      choose(o);
      return o.id;
    });
    assert(program);
    assert((await page.locator('#sat-evidence').textContent()).includes('غرض المنظومة موثق'));
    assert((await page.locator('#sat-profile-note').textContent()).includes('لا يؤكد'));
    await page.screenshot({ path: output + '/metadata-program.png' });
    await page.evaluate(() => {
      const o = objects.find((o) => SatMetadata.get(o.id).missionKind === 'unknown');
      if (!o) throw Error('Missing unknown-mission fixture');
      choose(o);
    });
    assert((await page.locator('#sat-evidence').textContent()).includes('غير موثقة'));
    assert((await page.locator('#sat-profile-note').textContent()).includes('لا تُستنتج'));
    await page.evaluate(() => choose(objects.find((o) => o.id === 900)));
    console.log(
      'PASS: sourced individual and constellation missions, launch date, source links and honest unknown-mission UI',
    );
    await page.screenshot({ path: output + '/desktop.png' });
    console.log(
      'desktop',
      await page.evaluate(() => ({
        particles: world.particlesData().reduce((n, g) => n + g.length, 0),
        status: $('status').textContent,
        globeError: $('map-error').hidden,
        types: document.querySelectorAll('#catalog-types input').length,
      })),
    );

    await page.selectOption('#group', 'stations');
    await page.click('#shell-nav-map');
    await page.waitForFunction(() => objects.length < 100 && world.particlesData().length === 0);
    await page.locator('#list button').first().click();
    await page.waitForFunction(() => !$('globe-card').hidden);
    assert(await page.locator('#globe-card').isVisible());
    const cardBounds = await page.locator('#globe-card').boundingBox();
    assert(cardBounds.y >= 0 && cardBounds.y + cardBounds.height <= 1001);
    await page.click('#globe-card-favorite');
    assert.equal(await page.getAttribute('#globe-card-favorite', 'aria-pressed'), 'true');
    assert.equal(await page.getAttribute('#favorite', 'aria-pressed'), 'true');
    assert(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem('orbit-favorites')).some(
          (o) => o.id === selection.current.id,
        ),
      ),
    );
    await page.click('#saved');
    assert.equal(await page.locator('#list button').count(), 1);
    await page.click('#favorite');
    assert.equal(await page.getAttribute('#globe-card-favorite', 'aria-pressed'), 'false');
    assert.equal(await page.getAttribute('#favorite', 'aria-pressed'), 'false');
    assert.equal(await page.locator('#list button').count(), 0);
    assert.deepEqual(
      await page.evaluate(() => [selection.current, selection.byUser, selection.tracking]),
      [null, false, false],
    );
    await page.click('#all');
    await page.locator('#list button').first().click();
    await page.click('#globe-card-favorite');
    const persistedSelectionId = await page.evaluate(() => {
      DraftState.save();
      const saved = JSON.parse(localStorage.getItem('madar-draft-v1'));
      if (!saved.selectedByUser || saved.selected.id !== selection.current.id)
        throw Error('Explicit selection must retain the existing draft schema');
      return selection.current.id;
    });
    await page.reload();
    await page.waitForFunction(
      (id) => objects.length && selection.current?.id === id && !selection.byUser,
      persistedSelectionId,
    );
    assert(await page.locator('#globe-card').isHidden());
    await page.locator('#list button').first().click();
    assert.equal(await page.getAttribute('#globe-card-favorite', 'aria-pressed'), 'true');
    assert.equal(await page.getAttribute('#favorite', 'aria-pressed'), 'true');
    await page.click('#globe-card-favorite');
    console.log('PASS: card watchlist add/remove, sidebar sync and persisted reload');
    await page.click('#track-selected');
    assert.equal(await page.getAttribute('#track-selected', 'aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => selection.tracking), true);
    await page.selectOption('#marker-style', 'circle');
    await page.click('#pause');
    await page.click('#scene-live');
    assert.equal(await page.getAttribute('#pause', 'aria-label'), 'إيقاف التحديث مؤقتًا');
    await page.screenshot({ path: output + '/selected.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: output + '/mobile.png' });
    console.log(
      'mobile',
      await page.evaluate(() => ({
        width: innerWidth,
        body: document.body.scrollWidth,
        globe: document.getElementById('globe').getBoundingClientRect().toJSON(),
      })),
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('#report-panel>summary').click();
    await page.locator('#report-types .type-advanced>summary').click();
    await page.locator('#report-types .type-section').first().locator('summary').click();
    await page.locator('#report-types input[value=stations]').check();
    await page.selectOption('#report-step', '60');
    await page.click('#report-run');
    await page.waitForFunction(
      () => finishedReport && $('report-progress').value === 100,
      {},
      { timeout: 45000 },
    );
    await page.waitForFunction(() => !$('report-download').hidden, {}, { timeout: 30000 });
    const delivered = await page.evaluate(async () => {
      const r = await StateStore.get('report-word');
      return Array.from(new Uint8Array(await r.blob.arrayBuffer()));
    });
    const { validDocx } = await import('../worker/docx-validation.js');
    assert(
      validDocx(Uint8Array.from(delivered)),
      'generated report must pass strengthened Word validation',
    );
    console.log(
      'report',
      await page.evaluate(() => ({
        scope: finishedReport.scopeName,
        passes: finishedReport.result.rows.length,
        word: $('report-download').download,
      })),
    );
    await page.screenshot({ path: output + '/report.png' });
    const { checkBrowserReports } = require('./check-browser-reports.cjs');
    await checkBrowserReports(page, output);
    console.log('pageErrors', errors);
    assert.equal(errors.length, 0);
    await page.unroute('https://celestrak.org/**');
    const live = await page.evaluate(async () => {
      try {
        const r = await SatGroups.fetchGroup('stations', parse, { force: true });
        return {
          source: r.source,
          count: r.data.length,
          modes: [...new Set(r.data.map((o) => o.provenance?.mode))],
          note: r.note || '',
          fetchedAt: r.fetchedAt,
        };
      } catch (e) {
        return { error: e.message };
      }
    });
    console.log('browser celestrak:', live);
    fs.writeFileSync(output + '/celestrak.json', JSON.stringify(live, null, 2));
    assert(live.count > 0);
    assert(['live', 'cache', 'local', 'derived'].includes(live.source));
    assert.deepEqual(
      live.modes,
      [live.source],
      'every record must retain the reported source mode',
    );
    if (live.source === 'live' || live.source === 'cache')
      assert(Number.isFinite(live.fetchedAt) && live.fetchedAt > 0);
    else {
      assert(live.note, 'unavailable upstream must retain an explanatory note');
      assert.equal(live.fetchedAt, null, 'fallback must not invent a fresh fetch timestamp');
    }
    await page.close();
    const { checkBrowserComprehensive } = require('./check-browser-comprehensive.cjs');
    await checkBrowserComprehensive(browser, baseUrl, output);
    const { checkBrowserProgramExtras } = require('./check-browser-program-extras.cjs');
    await checkBrowserProgramExtras(browser, baseUrl, output);
    const { checkBrowserOrbits } = require('./check-browser-orbits.cjs');
    await checkBrowserOrbits(browser, baseUrl, output);
    const { checkBrowserGuide } = require('./check-browser-guide.cjs');
    await checkBrowserGuide(browser, baseUrl, output);
    const { checkBrowserWatchlist } = require('./check-browser-watchlist.cjs');
    await checkBrowserWatchlist(browser, baseUrl, output);
    const { checkBrowserLifecycle } = require('./check-browser-lifecycle.cjs');
    await checkBrowserLifecycle(browser, baseUrl, output);
    const { checkBrowserSecurity } = require('./check-browser-security.cjs');
    await checkBrowserSecurity(browser, baseUrl);
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
