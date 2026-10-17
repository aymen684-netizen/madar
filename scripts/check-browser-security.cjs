const assert = require('assert/strict');
async function checkBrowserSecurity(browser, url) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('https://celestrak.org/**', (r) => r.abort());
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  try {
    await page.goto(url);
    await page.waitForFunction(
      () => typeof Privacy !== 'undefined' && typeof StateStore !== 'undefined' && objects.length,
    );
    assert(!requests.some((u) => u.includes('googleapis.com') || u.includes('gstatic.com')));
    await page.route('**/security-probe.js', (r) =>
      r.fulfill({
        contentType: 'text/javascript',
        body: "try{eval('window.__unsafeEval=1');window.__evalDenied=false}catch(e){window.__evalDenied=e.name==='EvalError'}const s=document.createElement('script');s.textContent='window.__unsafeInline=1';document.head.append(s);",
      }),
    );
    await page.evaluate(() => {
      const s = document.createElement('script');
      s.src = 'security-probe.js';
      document.head.append(s);
    });
    await page.waitForFunction(() => typeof window.__evalDenied === 'boolean');
    const blocked = await page.evaluate(() => ({
      denied: window.__evalDenied,
      inline: window.__unsafeInline,
    }));
    assert(blocked.denied);
    assert.equal(blocked.inline, undefined);
    await page.evaluate(async () => {
      localStorage.setItem('other-app-data', 'keep');
      Privacy.localSet('orbit-favorites', '[]');
      await StateStore.put('security-test', { seed: true });
    });
    await page.locator('#privacy-panel>summary').click();
    page.once('dialog', (d) => d.accept());
    assert(await page.locator('#save-on-device').isChecked());
    await Promise.all([page.waitForNavigation(), page.locator('#save-on-device').click()]);
    await page.waitForFunction(
      () => typeof Privacy !== 'undefined' && !Privacy.persistent() && objects.length,
    );
    const cleared = await page.evaluate(async () => ({
      other: localStorage.getItem('other-app-data'),
      favorite: localStorage.getItem('orbit-favorites'),
      draft: localStorage.getItem('madar-draft-v1'),
      seed: await StateStore.get('security-test'),
    }));
    assert.equal(cleared.other, 'keep');
    assert.equal(cleared.favorite, null);
    assert.equal(cleared.draft, null);
    assert.equal(cleared.seed, null);
    await page.selectOption('#group', 'stations');
    await page.waitForFunction(() => objects.length < 100 && selected);
    await page.locator('#list button').first().click();
    await page.click('#globe-card-favorite');
    await page.evaluate(async () => {
      await StateStore.put('security-test', { private: true });
      DraftState.save();
    });
    assert(
      await page.evaluate(
        () =>
          favorites.length === 1 &&
          localStorage.getItem('orbit-favorites') === null &&
          localStorage.getItem('madar-draft-v1') === null,
      ),
    );
    assert.equal(
      await page.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const r = indexedDB.open('madar-session', 1);
            r.onsuccess = () => {
              const db = r.result,
                q = db.transaction('records', 'readonly').objectStore('records').count();
              q.onsuccess = () => {
                resolve(q.result);
                db.close();
              };
              q.onerror = reject;
            };
            r.onerror = reject;
          }),
      ),
      0,
    );
    await page.reload();
    await page.waitForFunction(() => typeof Privacy !== 'undefined' && objects.length);
    assert.equal(await page.evaluate(() => favorites.length), 0);
    assert.equal(await page.evaluate(() => StateStore.get('security-test')), null);
    await page.locator('#privacy-panel>summary').click();
    assert(!(await page.locator('#save-on-device').isChecked()));
    await Promise.all([page.waitForNavigation(), page.locator('#save-on-device').click()]);
    await page.waitForFunction(
      () => typeof Privacy !== 'undefined' && Privacy.persistent() && objects.length,
    );
    await page.evaluate(async () => {
      Privacy.localSet('orbit-favorites', '[]');
      Privacy.localSet('orbit-cache-test', 'cached');
      await StateStore.put('security-test', { seed: true });
    });
    await page.locator('#privacy-panel>summary').click();
    page.once('dialog', (d) => d.accept());
    await Promise.all([page.waitForNavigation(), page.click('#clear-device-data')]);
    await page.waitForFunction(() => typeof Privacy !== 'undefined' && objects.length);
    assert.equal(await page.evaluate(() => localStorage.getItem('orbit-cache-test')), null);
    assert.equal(await page.evaluate(() => StateStore.get('security-test')), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('other-app-data')), 'keep');
    console.log(
      'PASS: CSP blocks eval/inline scripts, no external fonts, scoped clearing and private mode survives reload without saved data',
    );
  } finally {
    await context.close();
  }
}
module.exports = { checkBrowserSecurity };
