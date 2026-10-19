// Existing feature suites use the real full-form toggle. The separate guidance suite
// runs first without this adapter and exercises the default step-by-step experience.
async function installReportNavigation(browser) {
  const probe = await browser.newPage(),
    pp = Object.getPrototypeOf(probe),
    lp = Object.getPrototypeOf(probe.locator('body'));
  await probe.close();
  const click = pp.click;
  async function welcome(loc) {
    return (await loc.count()) === 1 && (await loc.evaluate((e) => !!e.closest('#welcome-dialog')));
  }
  async function expose(page, loc) {
    if (page.__reportNavigating) return;
    page.__reportNavigating = true;
    try {
      const active = page.locator(
        '#shell-reports:not([hidden]) [data-shell-report]:not([hidden]) .report-guided-form',
      );
      if (
        (await active.count()) === 1 &&
        (await active.getAttribute('data-report-guided')) === 'true'
      ) {
        const id = (await active.getAttribute('id')).replace('-form', '-guide-toggle');
        await click.call(page, '#' + id);
      }
      if (loc && (await loc.count()) === 1) {
        const id = await loc.evaluate((e) => e.closest('.report-guide-advanced')?.id);
        if (id && (await page.locator('#' + id).getAttribute('open')) === null)
          await click.call(page, '#' + id + '>summary');
      }
    } finally {
      page.__reportNavigating = false;
    }
  }
  for (const method of [
    'click',
    'fill',
    'check',
    'uncheck',
    'selectOption',
    'press',
    'scrollIntoViewIfNeeded',
  ]) {
    const original = lp[method];
    lp[method] = async function (...args) {
      const preserveWelcome = method === 'click' && (await welcome(this));
      if (!preserveWelcome) await expose(this.page(), this);
      const result = await original.apply(this, args);
      if (method === 'click' && !preserveWelcome) await expose(this.page());
      return result;
    };
  }
  for (const method of ['click', 'fill', 'check', 'uncheck', 'selectOption', 'press']) {
    const original = pp[method];
    pp[method] = async function (selector, ...args) {
      const loc = this.locator(selector),
        preserveWelcome = method === 'click' && (await welcome(loc));
      if (!preserveWelcome) await expose(this, loc);
      const result = await original.call(this, selector, ...args);
      if (method === 'click' && !preserveWelcome) await expose(this);
      return result;
    };
  }
}
module.exports = { installReportNavigation };
