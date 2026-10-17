// Lab diagnostics only: mobile viewport and CPU throttling are not physical-phone measurements.
const { chromium } = require('playwright'),
  http = require('http'),
  fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict');
const root = path.resolve(process.env.MADAR_PERF_ROOT || 'public'),
  output = process.env.MADAR_PERF_OUTPUT || 'test-results/performance-candidate.json',
  candidate = process.env.MADAR_PERF_STABLE === '1';
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(req.url.split('?')[0]),
    file = path.join(root, name === '/' ? 'index.html' : name);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {
    res.writeHead(404);
    return res.end();
  }
  res.setHeader(
    'Content-Type',
    {
      '.js': 'text/javascript',
      '.html': 'text/html',
      '.css': 'text/css',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
    }[path.extname(file)] || 'application/octet-stream',
  );
  res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise((r) => server.listen(8082, '127.0.0.1', r));
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      }),
      page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await context.addInitScript(() => {
      localStorage.setItem('madar-started', '1');
      window.__lab = { longTasks: [], cls: 0, lcp: null };
      for (const type of ['longtask', 'layout-shift', 'largest-contentful-paint'])
        try {
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
              if (type === 'longtask') __lab.longTasks.push(e.duration);
              if (type === 'layout-shift' && !e.hadRecentInput) __lab.cls += e.value;
              if (type === 'largest-contentful-paint') __lab.lcp = e.startTime;
            }
          }).observe({ type, buffered: true });
        } catch {}
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const data = fs.readFileSync(path.join(root, 'data/active-omm.json'), 'utf8');
    await page.route('https://celestrak.org/**', (r) =>
      r.fulfill({ contentType: 'application/json', body: data }),
    );
    await page.goto('http://127.0.0.1:8082/');
    await page.waitForFunction(
      () =>
        world &&
        objects.length > 15000 &&
        world.particlesData().reduce((n, g) => n + g.length, 0) > 15000,
      {},
      { timeout: 90000 },
    );
    const readyMs = await page.evaluate(() => performance.now());
    await page.click('#map-tools-open');
    await page.click('#pause');
    await page.click('#map-tools-close');
    await page.waitForTimeout(500);
    const result = await page.evaluate(() => {
      const originalJson = S.json2satrec,
        originalTle = S.twoline2satrec;
      let modelBuilds = 0;
      S.json2satrec = (...a) => {
        modelBuilds++;
        return originalJson(...a);
      };
      S.twoline2satrec = (...a) => {
        modelBuilds++;
        return originalTle(...a);
      };
      const prepareStart = performance.now(),
        prepared = prepare(objects),
        prepareMs = performance.now() - prepareStart,
        eagerModelBuilds = modelBuilds;
      const sampleTime = new Date('2026-10-16T00:00:00Z'),
        sampleModel = prepared[0].rec;
      S.json2satrec = originalJson;
      S.twoline2satrec = originalTle;
      const independent = OrbitData.satrec(S, objects[0]),
        actualPosition = S.propagate(sampleModel, sampleTime).position,
        expectedPosition = S.propagate(independent, sampleTime).position;
      const modelPositionIdentical =
        JSON.stringify(actualPosition) === JSON.stringify(expectedPosition);
      const host = document.getElementById('metrics');
      update({ scene: false });
      window.__metricFirst = host.firstElementChild;
      const observer = new MutationObserver(() => {});
      observer.observe(host, { childList: true, subtree: true, characterData: true });
      const times = [];
      for (let round = 0; round < 5; round++) {
        const start = performance.now();
        for (let i = 0; i < 10; i++) update({ scene: false });
        times.push((performance.now() - start) / 10);
      }
      const records = observer.takeRecords();
      observer.disconnect();
      return {
        prepareMs,
        eagerModelBuilds,
        modelPositionIdentical,
        updateMs: times,
        metricNodesAdded: records.reduce((n, r) => n + r.addedNodes.length, 0),
        metricRowsRemoved: records
          .filter((r) => r.target === host)
          .reduce((n, r) => n + r.removedNodes.length, 0),
        firstMetricRetained: host.firstElementChild === __metricFirst,
        metricRows: host.children.length,
        satellites: objects.length,
        pixelRatio: world.renderer().getPixelRatio(),
        lab: __lab,
        userAgent: navigator.userAgent,
      };
    });
    result.readyMs = readyMs;
    result.environment = {
      viewport: '390x844',
      deviceScaleFactor: 3,
      cpuSlowdown: 4,
      renderer: 'headless Chromium with SwiftShader',
      network: 'local static server; fixed orbital snapshot',
      physicalPhone: false,
    };
    result.medianUpdateMs = [...result.updateMs].sort((a, b) => a - b)[2];
    if (candidate) {
      assert(result.firstMetricRetained);
      assert.equal(result.eagerModelBuilds, 0);
      assert.equal(result.metricNodesAdded, 0);
      assert.equal(result.metricRowsRemoved, 0);
    }
    assert(result.modelPositionIdentical);
    assert.equal(result.metricRows, 12);
    assert(result.satellites > 15000);
    assert(result.pixelRatio <= 1.5);
    assert.equal(await page.evaluate(() => document.body.scrollWidth), 390);
    assert.deepEqual(errors, []);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(result, null, 2));
    console.log(
      JSON.stringify({
        output,
        readyMs,
        medianUpdateMs: result.medianUpdateMs,
        prepareMs: result.prepareMs,
        eagerModelBuilds: result.eagerModelBuilds,
        metricNodesAdded: result.metricNodesAdded,
        metricRowsRemoved: result.metricRowsRemoved,
        physicalPhone: false,
      }),
    );
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
