const fs = require('fs'),
  assert = require('assert/strict');
async function checkBrowserReports(page, output) {
  const fixture = JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json'));
  await page.evaluate(async (fixture) => {
    pausedAt = new Date(dateNow());
    paused = true;
    world?.pauseAnimation();
    const o = OrbitData.fromOmm(fixture);
    o.name = 'TEST ONLY · مرور مرجعي';
    o.provenance = { mode: 'imported', format: 'OMM JSON' };
    const t = OrbitData.epoch(o),
      rec = OrbitData.satrec(satellite, o),
      v = satellite.propagate(rec, new Date(t)),
      g = satellite.eciToGeodetic(v.position, satellite.gstime(new Date(t))),
      lng = (g.longitude * 180) / Math.PI,
      lat = (g.latitude * 180) / Math.PI;
    const country = {
      id: 'TEST',
      displayName: 'منطقة اختبار حسابية',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [lng - 5, lat - 5],
            [lng + 5, lat - 5],
            [lng + 5, lat + 5],
            [lng - 5, lat + 5],
            [lng - 5, lat - 5],
          ],
        ],
      },
    };
    const scan = (start, end) =>
      new Promise((resolve, reject) => {
        const worker = new Worker('report-worker.js?v=25');
        worker.onmessage = (e) => {
          if (e.data.type === 'done') {
            worker.terminate();
            resolve(e.data.result);
          } else if (e.data.type === 'error') {
            worker.terminate();
            reject(Error(e.data.message));
          }
        };
        worker.onerror = (e) => reject(Error(e.message));
        worker.postMessage({ objects: [OrbitData.serialize(o)], country, start, end, step: 10000 });
      });
    const result = await scan(t, t + 600000);
    window.testReport = {
      country,
      countryName: country.displayName,
      start: t,
      end: t + 600000,
      offset: 3,
      zoneLabel: 'الرياض UTC+03:00',
      day: 'اختبار',
      scopeName: 'TEST ONLY',
      step: 10,
      result,
    };
    finishedReport = window.testReport;
    renderReport(finishedReport);
    await prepareReportDownload();
    const windows = [
      { start: t, end: t + 600000, day: 'اختبار 1', result },
      {
        start: t + 30000,
        end: t + 630000,
        day: 'اختبار 2',
        result: await scan(t + 30000, t + 630000),
      },
    ];
    analyticResult = {
      ...window.testReport,
      windows,
      tolerance: 5,
      purpose: 'TEST ONLY',
      analysis: AnalysisCore.analyze(windows, 3, 5),
    };
    renderAnalysis(analyticResult);
    await prepareAnalyticWord();
  }, fixture);
  assert.equal(await page.locator('#report-summary canvas').count(), 2);
  assert.equal(await page.locator('#analysis-insights canvas').count(), 2);
  assert.equal(await page.locator('#report-summary .report-brief>p').count(), 4);
  assert.equal(
    await page.locator('#report-summary .report-brief-details').getAttribute('open'),
    null,
  );
  assert(await page.locator('#report-summary canvas').first().isVisible());
  assert(!(await page.locator('#report-summary').innerText()).includes('المصادر لكل الأقمار'));
  await page.locator('#report-summary .report-brief-details>summary').click();
  assert((await page.locator('#report-summary').innerText()).includes('بيانات مستوردة 1'));
  assert(
    (await page.locator('#report-summary').innerText()).includes(
      'مهمة فردية أو وصف منظومة موثق 0 من 1',
    ),
  );
  await page.evaluate(() => (document.getElementById('analysis-panel').open = true));
  await page.selectOption('#analysis-visual-period', '1');
  await page.locator('#analysis-insights .report-brief-details>summary').click();
  assert((await page.locator('#analysis-insights').innerText()).includes('ضمن 24 ساعة 1'));
  const results = await page.evaluate(async () => ({
    tracks: testReport.result.rows.map((r) => r.track),
    quality: testReport.result.quality,
    report: Array.from(
      new Uint8Array(await (await StateStore.get('report-word')).blob.arrayBuffer()),
    ),
    analysis: Array.from(
      new Uint8Array(await (await StateStore.get('analysis-word')).blob.arrayBuffer()),
    ),
  }));
  assert(results.tracks.length > 0);
  assert(results.tracks.every((t) => t.length === 61 && t.flat().every(Number.isFinite)));
  assert.equal(results.quality.recent, 1);
  const { validDocx } = await import('../worker/docx-validation.js');
  for (const kind of ['report', 'analysis']) {
    const b = Buffer.from(results[kind]);
    assert(validDocx(b));
    fs.writeFileSync(output + '/' + kind + '-insights.docx', b);
  }
  for (const kind of ['report', 'analysis']) {
    await page.selectOption('#' + kind + '-export-detail', 'brief');
    await page.waitForFunction(
      (kind) =>
        !document.getElementById(kind + '-download').hidden &&
        document.getElementById(kind + '-download').download.includes('-brief'),
      kind,
    );
    const bytes = await page.evaluate(
      async (kind) =>
        Array.from(new Uint8Array(await (await StateStore.get(kind + '-word')).blob.arrayBuffer())),
      kind,
    );
    const xml = require('./check-browser-inventory.cjs').docxXml(Buffer.from(bytes));
    assert(!xml.includes('<w:tbl>'));
    assert(xml.includes('الملخص التنفيذي'));
    await page.selectOption('#' + kind + '-export-detail', 'full');
    await page.waitForFunction(
      (kind) =>
        !document.getElementById(kind + '-download').hidden &&
        !document.getElementById(kind + '-download').download.includes('-brief'),
      kind,
    );
  }
  await page.locator('#report-summary .report-brief-details').evaluate((el) => (el.open = false));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    document.getElementById('report-panel').open = true;
    document.getElementById('report-summary').scrollIntoView();
  });
  await page.screenshot({ path: output + '/report-insights-desktop.png' });
  await page.locator('#report-summary canvas').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + '/report-map-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#report-summary').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.body.scrollWidth), 390);
  await page.screenshot({ path: output + '/report-insights-mobile.png' });
  await page.locator('#report-summary canvas').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + '/report-map-mobile.png' });
  await page.locator('#report-summary canvas').nth(1).scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + '/report-timeline-mobile.png' });
  await page.evaluate(() => {
    document.getElementById('analysis-panel').open = true;
    document.getElementById('analysis-insights').scrollIntoView();
  });
  await page.screenshot({ path: output + '/analysis-insights-mobile.png' });
  // Empty results and antimeridian polygons must remain drawable and honest.
  const special = await page.evaluate(() => {
    const w = { start: 0, end: 60000, result: { rows: [], total: 0, unique: 0, invalid: 0 } };
    const c = {
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [179, -5],
            [-179, -5],
            [-179, 5],
            [179, 5],
            [179, -5],
          ],
        ],
      },
    };
    return ReportInsights.visuals(w, c, 0, ReportDocument.stamp).map.length;
  });
  assert(special > 1000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(async (fixture) => {
    const o = OrbitData.fromOmm(fixture);
    o.provenance = { mode: 'imported', format: 'OMM JSON' };
    testReport.archive = await ReportArchive.capture('country', [o], {
      country: testReport.country,
      start: testReport.start,
      end: testReport.end,
      offset: 3,
      step: 10,
      scopeName: 'TEST ONLY',
    });
    finishedReport = testReport;
    renderReport(finishedReport);
    await prepareReportDownload();
    analyticResult.archive = await ReportArchive.capture('comparison', [o], {
      country: testReport.country,
      windows: analyticResult.windows.map((w) => ({ start: w.start, end: w.end })),
      offset: 3,
      step: 10,
      tolerance: 5,
    });
    renderAnalysis(analyticResult);
    await prepareAnalyticWord();
    window.observerTestObject = o;
  }, fixture);
  const csvEvent = page.waitForEvent('download');
  await page.locator('#report-exports button').filter({ hasText: 'تنزيل CSV لـ Excel' }).click();
  const csvFile = await csvEvent;
  const csvBytes = fs.readFileSync(await csvFile.path());
  assert.equal(csvBytes.subarray(0, 3).toString('hex'), 'efbbbf');
  assert(csvBytes.toString().includes('100001'));
  fs.writeFileSync(output + '/passes.csv', csvBytes);
  const jsonEvent = page.waitForEvent('download');
  await page
    .locator('#report-exports button')
    .filter({ hasText: 'تنزيل لقطة المدارات JSON' })
    .click();
  const jsonFile = await jsonEvent,
    archive = JSON.parse(fs.readFileSync(await jsonFile.path(), 'utf8'));
  assert.equal(
    require('crypto').createHash('sha256').update(JSON.stringify(archive.payload)).digest('hex'),
    archive.sha256,
  );
  assert.equal(archive.payload.objects[0].id, 100001);
  const popupEvent = page.waitForEvent('popup');
  await page.locator('#report-exports button').filter({ hasText: 'طباعة / حفظ PDF' }).click();
  const popup = await popupEvent;
  assert((await popup.locator('body').innerText()).includes(archive.id));
  await popup.pdf({
    path: output + '/country-print.pdf',
    format: 'A4',
    landscape: true,
    printBackground: true,
  });
  await popup.close();
  await page.evaluate(() => {
    document.getElementById('observer-panel').open = true;
    window.beforeObserverSelected = selection.current;
    selection.restore(observerTestObject, selection.byUser);
    const o = observerTestObject,
      t = OrbitData.epoch(o),
      pv = satellite.propagate(OrbitData.satrec(satellite, o), new Date(t)),
      g = satellite.eciToGeodetic(pv.position, satellite.gstime(new Date(t)));
    for (const [id, value] of Object.entries({
      lat: (g.latitude * 180) / Math.PI,
      lon: (g.longitude * 180) / Math.PI,
      date: new Date(t).toISOString().slice(0, 10),
      start: new Date(t).toISOString().slice(11, 19),
      end: new Date(t + 600000).toISOString().slice(11, 19),
      zone: 0,
      name: 'TEST ONLY · رصد مرجعي',
    }))
      document.getElementById('observer-' + id).value = value;
    document.getElementById('observer-next').checked = false;
  });
  await page.evaluate(() => {
    window.originalCapture = ReportArchive.capture;
    ReportArchive.capture = (...args) =>
      new Promise((resolve) => {
        window.releaseObserverCapture = () => resolve(originalCapture(...args));
      });
  });
  await page.locator('#observer-form button[type=submit]').click();
  await page.waitForFunction(() => !!window.releaseObserverCapture);
  assert.equal(await page.locator('#observer-form').getAttribute('aria-busy'), 'true');
  assert.equal(await page.locator('#observer-progress').getAttribute('value'), null);
  await page.click('#observer-cancel');
  await page.evaluate(async () => {
    await releaseObserverCapture();
    ReportArchive.capture = originalCapture;
  });
  assert.equal(await page.locator('#observer-form').getAttribute('aria-busy'), 'false');
  assert.equal(await page.locator('#observer-progress').getAttribute('value'), '0');
  assert.equal(await page.evaluate(() => ObserverUI.result), null);
  await page.locator('#observer-form button[type=submit]').click();
  await page.waitForFunction(() => ObserverUI.result?.result.rows.length > 0);
  assert.equal(await page.locator('#observer-progress').getAttribute('value'), '100');
  assert(await page.evaluate(() => ObserverUI.result.result.rows[0].elevation > 89.99));
  assert((await page.locator('#observer-results').textContent()).includes('لا يضمن رؤيته'));
  await page.click('#observer-word');
  await page.waitForFunction(() => !document.getElementById('observer-download').hidden);
  const actualWords = await page.evaluate(async () => {
    const out = {};
    for (const kind of ['report', 'analysis', 'observer'])
      out[kind] = Array.from(
        new Uint8Array(await (await StateStore.get(kind + '-word')).blob.arrayBuffer()),
      );
    return out;
  });
  for (const [kind, bytes] of Object.entries(actualWords)) {
    assert(validDocx(Uint8Array.from(bytes)));
    fs.writeFileSync(output + '/' + kind + '-final.docx', Buffer.from(bytes));
  }
  const reportStatus = await page.locator('#report-status').textContent();
  await page.waitForFunction(() => !document.getElementById('observer-share').hidden);
  const shareDownload = page.waitForEvent('download');
  await page.click('#observer-share');
  const shared = await shareDownload;
  assert(shared.suggestedFilename().endsWith('.docx'));
  assert((await page.locator('#observer-status').textContent()).includes('غير مدعومة'));
  assert.equal(await page.locator('#report-status').textContent(), reportStatus);
  await page.locator('#observer-results').scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + '/observer-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.body.scrollWidth), 390);
  await page.locator('#observer-form').scrollIntoViewIfNeeded();
  const actionBoxes = await page.locator('.report-actions>*:visible').evaluateAll((nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
    }),
  );
  for (let i = 0; i < actionBoxes.length; i++)
    for (let j = i + 1; j < actionBoxes.length; j++) {
      const a = actionBoxes[i],
        b = actionBoxes[j];
      assert(
        a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y,
        'observer report actions must not overlap',
      );
    }
  await page.screenshot({ path: output + '/observer-form-mobile.png' });
  await page.locator('#observer-results').scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + '/observer-mobile.png' });
  await page.evaluate(() => selection.restore(beforeObserverSelected, selection.byUser));
  console.log(
    'PASS: normalized comparison, BOM CSV for Excel, verified downloadable SHA-256 input archive, PDF print view, real observer worker and Word with overhead geometry, mobile layout',
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log(
    'PASS: actual worker paths, imported source quality, report/analysis Word with charts, selectable periods, empty/antimeridian maps and mobile layout',
  );
}
module.exports = { checkBrowserReports };
