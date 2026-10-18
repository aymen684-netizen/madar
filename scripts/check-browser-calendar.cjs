const assert = require('node:assert/strict'),
  fs = require('node:fs');
async function checkBrowserCalendar(browser, url, output) {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const fixture = {
      ...JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json')),
      EPOCH: new Date().toISOString(),
    };
    await page.route('https://celestrak.org/**', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify([fixture]) }),
    );
    try {
      await page.goto(url);
      await page.waitForFunction(() => window.DateCalendar && world && objects.length === 1);
      await page.evaluate(async () => {
        await MadarI18n.ready;
      });
      await page.click('#shell-nav-reports');
      for (const lang of ['ar', 'en']) {
        await page.evaluate((lang) => MadarI18n.setLanguage(lang), lang);
        const field = page.locator('#report-start-date');
        await field.fill('2028-02-15');
        const opener = field.locator('..').locator('.date-calendar-open');
        await opener.click();
        const dialog = page.locator('#date-calendar-dialog');
        assert.equal(
          await dialog.locator('h2').innerText(),
          lang === 'ar' ? 'التقويم الميلادي' : 'Gregorian calendar',
        );
        assert.equal(await dialog.locator('[data-date]').count(), 29);
        assert.equal(
          await dialog.locator('select option:checked').innerText(),
          lang === 'ar' ? 'فبراير' : 'February',
        );
        assert.equal(await dialog.evaluate((d) => d.scrollWidth <= d.clientWidth), true);
        await page.screenshot({
          path: `${output}/calendar-${lang}-${mobile ? 'mobile' : 'desktop'}.png`,
        });
        await dialog.locator('[data-date="2028-02-29"]').click();
        assert.equal(await field.inputValue(), '2028-02-29');
        assert.equal(await opener.evaluate((n) => document.activeElement === n), true);
        await opener.click();
        await page.keyboard.press('Escape');
        assert.equal(await dialog.evaluate((n) => n.open), false);
      }
      // Dynamic periods get the same picker without duplicate wrapping.
      await page.evaluate(() => {
        addPeriod('2026-12-15');
        DateCalendar.attach(document.querySelector('.period-date'));
      });
      assert.equal(
        await page
          .locator('.period-date')
          .last()
          .locator('..')
          .locator('.date-calendar-open')
          .count(),
        1,
      );
      for (const id of ['report-end-date', 'observer-date']) {
        await page.evaluate((id) => {
          const f = document.getElementById(id);
          f.value = '2026-12-15';
          f.parentElement.querySelector('.date-calendar-open').click();
        }, id);
        await page.getByRole('button', { name: 'Next month', exact: true }).click();
        await page.locator('[data-date="2027-01-01"]').click();
        assert.equal(await page.locator('#' + id).inputValue(), '2027-01-01');
      }
      await page.evaluate(() => {
        const f = document.querySelector('.period-date');
        f.value = '2028-02-15';
        f.min = '2028-02-10';
        f.max = '2028-02-20';
        f.parentElement.querySelector('button').click();
      });
      assert.equal(await page.locator('[data-date="2028-02-09"]').isDisabled(), true);
      await page.locator('[data-date="2028-02-15"]').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.date), '2028-02-16');
      await page.evaluate(() => {
        document.querySelector('.period-date').disabled = true;
      });
      await page.locator('[data-date="2028-02-16"]').click();
      assert.equal(
        await page.locator('.period-date').first().inputValue(),
        '2028-02-15',
        'locked fields cannot change from an open calendar',
      );
      await page.keyboard.press('Escape');
      await page.click('#shell-nav-map');
      await page.click('#map-tools-open');
      await page.locator('#shell-scene-options').evaluate((n) => {
        n.open = true;
      });
      await page.click('#scene-time');
      const before = await page.evaluate(() => {
        fixedTime = new Date('2026-10-18T04:00:00Z');
        document.getElementById('date').value = '2028-02-15';
        return {
          fixed: +fixedTime,
          zone: document.getElementById('timezone').value,
          hour: document.getElementById('hour').value,
        };
      });
      await page.locator('#date').locator('..').locator('.date-calendar-open').click();
      await page.locator('[data-date="2028-02-29"]').click();
      assert.equal(await page.locator('#date').inputValue(), '2028-02-29');
      assert.deepEqual(
        await page.evaluate(() => ({
          fixed: +fixedTime,
          zone: document.getElementById('timezone').value,
          hour: document.getElementById('hour').value,
        })),
        before,
        'choosing a civil date does not apply map time or change zone/hour',
      );
      assert.deepEqual(errors, []);
      for (const language of ['ar', 'en']) {
        await page.evaluate((language) => {
          MadarI18n.setLanguage(language);
          fixedTime = new Date('2026-10-17T22:15:30Z');
          document.getElementById('timezone').value = '3';
          document.getElementById('shell-time').open = false;
          update();
        }, language);
        const clock = await page.locator('#clock').innerText();
        assert(clock.includes('2026') && clock.includes('1448'));
        assert(clock.startsWith(language === 'ar' ? 'ميلادي: 18' : 'Gregorian: 18 Oct 2026'));
        if (language === 'en') assert(!/[\u0600-\u06ff]/.test(clock));
        assert.equal(
          await page.locator('#clock').evaluate((n) => n.scrollWidth <= n.clientWidth),
          true,
        );
        await page.screenshot({
          path: `${output}/map-clock-${language}-${mobile ? 'mobile' : 'desktop'}.png`,
        });
      }
    } finally {
      await context.close();
    }
  }
  console.log(
    'Gregorian calendar: Arabic/English, mobile, reports, dynamic periods and explicit map time passed.',
  );
}
module.exports = { checkBrowserCalendar };
