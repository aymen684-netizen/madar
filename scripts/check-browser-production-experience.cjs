const { chromium } = require('playwright');
const fs = require('fs');
const { installReportNavigation } = require('./browser-report-navigation.cjs');
const { installNavigation } = require('./browser-navigation.cjs');
const { checkBrowserExperience } = require('./check-browser-experience.cjs');
(async () => {
  fs.mkdirSync('test-results', { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const originalContext = browser.newContext.bind(browser);
  browser.newContext = async function ({ madarWelcome, ...options } = {}) {
    return originalContext(options);
  };
  try {
    await installReportNavigation(browser);
    await installNavigation(browser);
    await checkBrowserExperience(browser, process.env.MADAR_TEST_URL, 'test-results');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
