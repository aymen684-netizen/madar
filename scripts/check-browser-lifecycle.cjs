const assert = require('assert/strict'),
  fs = require('fs');
async function checkBrowserLifecycle(browser, url, output) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    page = await context.newPage(),
    errors = [];
  const fixture = {
      ...JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json', 'utf8')),
      EPOCH: new Date().toISOString(),
    },
    data = Array.from({ length: 1601 }, (_, i) => ({
      ...fixture,
      NORAD_CAT_ID: 100001 + i,
      OBJECT_NAME: 'TEST LIFECYCLE ' + i,
    }));
  await context.addInitScript(() => {
    window.__workerTicks = 0;
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (m, ...args) {
      if (m?.type === 'tick') {
        window.__workerTicks++;
        window.__lastTick = m.time;
      }
      return send.call(this, m, ...args);
    };
  });
  await page.route('https://celestrak.org/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) }),
  );
  page.on('pageerror', (e) => errors.push(e.message));
  const hideScene = async () => {
      await page.click('#program-guide');
      await page.waitForFunction(() => !RenderLifecycle.sceneActive());
    },
    showScene = async () => {
      await page.click('#guide-close');
      await page.locator('#globe').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => RenderLifecycle.sceneActive());
    };
  try {
    await page.goto(url);
    await page.waitForFunction(
      () => world && objects.length === 1601 && world.particlesData()[0]?.length === 1601,
    );
    await page.evaluate(() => {
      window.__renderCounts = { pause: 0, resume: 0 };
      for (const [method, key] of [
        ['pauseAnimation', 'pause'],
        ['resumeAnimation', 'resume'],
      ]) {
        const original = world[method];
        world[method] = function (...args) {
          __renderCounts[key]++;
          return original.apply(this, args);
        };
      }
      window.__propagations = 0;
      const propagate = S.propagate;
      S.propagate = (...args) => {
        __propagations++;
        return propagate(...args);
      };
    });
    const start = await page.evaluate(() => __workerTicks);
    await page.waitForFunction((n) => __workerTicks >= n + 2, start);
    const visibleTicks = (await page.evaluate(() => __workerTicks)) - start;
    await hideScene();
    const offscreenTicks = await page.evaluate(() => __workerTicks);
    await page.waitForTimeout(2200);
    assert.equal(await page.evaluate(() => __workerTicks), offscreenTicks);
    assert.equal(await page.evaluate(() => paused), false);
    assert((await page.evaluate(() => __renderCounts.pause)) > 0);
    await showScene();
    await page.waitForFunction((n) => __workerTicks > n, offscreenTicks);
    assert(Math.abs(Date.now() - (await page.evaluate(() => __lastTick))) < 10000);
    await page.click('#pause');
    const frozen = await page.evaluate(() => +dateNow());
    assert(await page.evaluate(() => paused));
    await hideScene();
    await showScene();
    assert.equal(await page.evaluate(() => +dateNow()), frozen);
    assert(await page.evaluate(() => paused));
    const fixed = Date.UTC(2026, 9, 13, 12);
    await page.evaluate((t) => {
      fixedTime = new Date(t);
      paused = false;
      pausedAt = null;
      pathAt = 0;
      update();
    }, fixed);
    await hideScene();
    await showScene();
    assert.equal(await page.evaluate(() => +dateNow()), fixed);
    assert.equal(await page.evaluate(() => paused), false);
    await page.click('#live');
    await page.evaluate(() => {
      window.__hiddenForTest = true;
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => window.__hiddenForTest,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => !RenderLifecycle.pageActive());
    const hidden = await page.evaluate(() => ({
      ticks: __workerTicks,
      propagations: __propagations,
    }));
    await page.waitForTimeout(2200);
    assert.deepEqual(
      await page.evaluate(() => ({ ticks: __workerTicks, propagations: __propagations })),
      hidden,
    );
    await page.evaluate(() => {
      window.__hiddenForTest = false;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction((n) => __workerTicks > n, hidden.ticks);
    assert.equal(await page.evaluate(() => fixedTime), null);
    assert.equal(await page.evaluate(() => paused), false);
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#watchlist-backup').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => !RenderLifecycle.sceneActive());
    const mobileTicks = await page.evaluate(() => __workerTicks);
    await page.waitForTimeout(1100);
    assert.equal(await page.evaluate(() => __workerTicks), mobileTicks);
    await page.locator('#globe').scrollIntoViewIfNeeded();
    await page.waitForFunction(
      (n) => RenderLifecycle.sceneActive() && __workerTicks > n,
      mobileTicks,
    );
    assert.equal(await page.evaluate(() => document.body.scrollWidth), 390);
    const renderCalls = await page.evaluate(() => __renderCounts);
    await page.click('#pause');
    const restoredPauseTime = await page.evaluate(() => {
      DraftState.save();
      return +dateNow();
    });
    await page.reload();
    await page.waitForFunction(
      () => paused && world && !document.getElementById('restore-notice').hidden,
    );
    assert.equal(await page.evaluate(() => +dateNow()), restoredPauseTime);
    assert.equal(await page.getAttribute('#pause', 'aria-label'), 'استئناف التحديث');
    assert.equal(await page.locator('#pause').textContent(), '▶');
    assert(await page.locator('#pause').evaluate((button) => button.classList.contains('active')));
    await page.click('#pause');
    assert.equal(await page.evaluate(() => paused), false);
    assert.equal(await page.getAttribute('#pause', 'aria-label'), 'إيقاف التحديث مؤقتًا');
    const result = {
      visibleWorkerTicks: visibleTicks,
      offscreenAdditionalTicks: 0,
      hiddenAdditionalTicks: 0,
      hiddenAdditionalMainPropagations: 0,
      mobileOffscreenAdditionalTicks: 0,
      manualPauseTimePreserved: true,
      restoredPauseControlMatchesState: true,
      fixedTimePreserved: true,
      backgroundVisibilitySimulated: true,
      renderCalls,
    };
    fs.writeFileSync(output + '/render-lifecycle.json', JSON.stringify(result, null, 2));
    assert.deepEqual(errors, []);
    console.log(
      'PASS: 1601-object scene stops worker ticks offscreen, hides renderer, resumes current time, preserves manual/fixed time, suppresses hidden-page propagation and works on mobile',
      result,
    );
  } finally {
    await context.close();
  }
}
module.exports = { checkBrowserLifecycle };
