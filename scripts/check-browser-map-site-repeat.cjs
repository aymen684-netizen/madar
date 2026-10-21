const baseUrl = process.env.MADAR_TEST_URL || 'http://127.0.0.1:8080/';
const suite = process.env.MADAR_BROWSER_SUITE || 'all';
const { chromium } = require('playwright');
const fs = require('fs'),
  http = require('http'),
  path = require('path'),
  assert = require('assert/strict');
const root = path.resolve('public');
assert(
  ['all', 'observing', 'interface', 'reports', 'extras'].includes(suite),
  'Unknown browser suite',
);
const includes = (name) => suite === 'all' || suite === name;
const smoke = process.env.MADAR_BROWSER_SMOKE === '1';
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
        document.addEventListener('DOMContentLoaded', async () => {
          await window.MadarStartupReady?.catch(() => {});
          document.getElementById('welcome-start')?.click();
        });
      });
    return context;
  };
  const outcomes = [];
  try {
    const { installReportNavigation } = require('./browser-report-navigation.cjs');
    await installReportNavigation(browser);
    const { checkBrowserMapSite } = require('./check-browser-map-site.cjs');
    for (let i = 0; i < Number(process.env.MADAR_MAP_REPEATS || 3); i++) {
      const folder = path.join(output, 'map-repeat-' + i);
      fs.mkdirSync(folder, { recursive: true });
      try {
        await checkBrowserMapSite(browser, baseUrl, folder);
        outcomes.push({ round: i, passed: true });
      } catch (e) {
        console.error('MAP ROUND FAILURE', i, e);
        outcomes.push({ round: i, passed: false, error: e.message });
      }
    }
    fs.writeFileSync(
      path.join(output, 'map-repeat-summary.json'),
      JSON.stringify(outcomes, null, 2),
    );
    console.log('MAP REPEAT SUMMARY', JSON.stringify(outcomes));
    assert(
      outcomes.every((x) => x.passed),
      'A map-site round failed; inspect trace',
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
