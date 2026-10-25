const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  { chromium } = require('playwright');

// No Playwright request routing: routing disables HTTP cache and would invalidate this test.
(async () => {
  const baseline = path.resolve(
      process.env.MADAR_CACHE_BASELINE_ROOT || 'build/cache-baseline/public',
    ),
    candidate = path.resolve('build/runtime-preview'),
    report = JSON.parse(fs.readFileSync('build/runtime-preview-report.json')),
    traffic = [],
    output = path.resolve('test-results');
  fs.mkdirSync(output, { recursive: true });
  let root = baseline,
    phase = 'old';
  assert(fs.existsSync(path.join(baseline, 'index.html')), 'prepared baseline required');
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    traffic.push({ phase, url: req.url });
    const relative = url.pathname.replace(/^\/project\//, '') || 'index.html';
    const file = path.resolve(root, relative);
    if (
      !url.pathname.startsWith('/project/') ||
      !file.startsWith(root + path.sep) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile()
    ) {
      res.writeHead(404);
      return res.end();
    }
    const types = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.json': 'application/json',
      '.css': 'text/css',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
    };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    // Model a revalidated document plus still-fresh cached assets at the same origin.
    res.setHeader('Cache-Control', file.endsWith('.html') ? 'no-cache' : 'public, max-age=3600');
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(() => {
      localStorage.setItem('madar-public-updates', 'false');
      localStorage.setItem('madar-language', 'en');
    });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const url = 'http://127.0.0.1:' + server.address().port + '/project/';
    async function load() {
      await page.goto(url);
      await page.waitForFunction(() => window.MadarShell && window.MadarStartupReady);
      await page.evaluate(() => MadarStartupReady);
      await page.waitForFunction(
        () =>
          typeof objects !== 'undefined' &&
          objects.length > 0 &&
          !document.getElementById('welcome-start').disabled,
      );
      await page.click('#welcome-start');
    }
    await load();
    await page.evaluate(() => {
      const value = JSON.stringify([objects[0]]);
      localStorage.setItem('orbit-favorites', value);
      return value;
    });
    const oldScripts = traffic.filter((r) => /\.js\?v=\d+$/.test(r.url));
    assert(oldScripts.length > 10, 'baseline uses cached numeric URLs');
    await page.goto('about:blank');
    phase = 'warm-old';
    await load();
    const oldApp = oldScripts.find((r) => /\/app\.js\?v=/.test(r.url));
    assert(oldApp);
    assert(
      !traffic.some((r) => r.phase === 'warm-old' && r.url === oldApp.url),
      'old app.js must actually come from HTTP cache',
    );
    const favorites = await page.evaluate(() => localStorage.getItem('orbit-favorites'));
    await page.goto('about:blank');
    root = candidate;
    phase = 'candidate';
    await load();
    assert.equal(await page.evaluate(() => localStorage.getItem('orbit-favorites')), favorites);
    assert.equal(await page.evaluate(() => localStorage.getItem('madar-language')), 'en');
    assert.equal(await page.evaluate(() => localStorage.getItem('madar-public-updates')), 'false');
    // Exercise computed script URLs and the English overview after the same-origin upgrade.
    await page.evaluate(() => {
      document.getElementById('map-fleet-panel').open = true;
    });
    await page.waitForFunction(() => window.FleetPasses);
    await page.click('#shell-nav-help');
    await page.click('#overview-preview');
    await page.waitForFunction(
      () => document.getElementById('overview-content').children.length > 0,
    );
    for (const name of [
      'fleet-pass-core.js',
      'fleet-experience.js',
      'fleet-passes.js',
      'data/program-overview-en.json',
    ]) {
      const reference = report.references.find((r) => r.asset === name && r.from !== 'index.html');
      assert(reference, name);
      assert(
        traffic.some((r) => r.phase === 'candidate' && r.url === '/project/' + reference.target),
        name + ' uses current hash',
      );
    }
    // A real classic worker must resolve its rewritten importScripts and answer.
    const workerUrl = report.references.find(
      (r) => r.from === 'app.js' && r.asset === 'positions-worker.js',
    ).target;
    const message = await page.evaluate(
      (workerUrl) =>
        new Promise((resolve, reject) => {
          const worker = new Worker(workerUrl),
            timer = setTimeout(() => {
              worker.terminate();
              reject(Error('worker timeout'));
            }, 15000);
          worker.onerror = (event) => {
            clearTimeout(timer);
            worker.terminate();
            reject(Error(event.message));
          };
          worker.onmessage = (event) => {
            clearTimeout(timer);
            worker.terminate();
            resolve({
              type: event.data.type,
              token: event.data.token,
              length: event.data.buf.length,
            });
          };
          worker.postMessage({ type: 'set', token: 7, objects: [] });
          worker.postMessage({ type: 'tick', token: 7, time: Date.now() });
        }),
      workerUrl,
    );
    assert.deepEqual(message, { type: 'positions', token: 7, length: 0 });
    const candidateScripts = traffic.filter(
      (r) => r.phase === 'candidate' && /\.js\?v=/.test(r.url),
    );
    assert(candidateScripts.length > 10);
    assert(
      candidateScripts.every((r) => /\?v=[a-f0-9]{64}$/.test(r.url)),
      'new page never requests old numeric scripts',
    );
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(output, 'asset-cache-update.json'),
      JSON.stringify(
        {
          baseline,
          oldScriptRequests: oldScripts.length,
          warmOldAppScriptRequests: 0,
          candidateScriptRequests: candidateScripts.length,
          worker: message,
          storagePreserved: true,
          traffic,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(
      'PASS: warm numeric cache -> fingerprinted HTML, dynamic scripts/data and real Worker; language, privacy and favorites preserved under /project/',
    );
    await context.close();
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
