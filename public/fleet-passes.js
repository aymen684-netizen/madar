(function (root) {
  'use strict';
  if (root.FleetPasses) return;
  const $ = (id) => document.getElementById(id),
    panel = $('map-fleet-panel'),
    dialog = $('map-tools-dialog'),
    host = document.createElement('section'),
    text = (node, value) => LiveValues.text(node, value);
  host.id = 'fleet-passes';
  host.setAttribute('aria-labelledby', 'fleet-pass-heading');
  host.innerHTML =
    '<h3 id="fleet-pass-heading">المرور القادم لمجموعة الخريطة</h3><p>اختر موقع الحساب. لا يُطلب موقع جهازك ولا تُرسل الإحداثيات؛ تبقى مدخلات هذه اللوحة لهذه الجلسة.</p><form id="fleet-pass-form"><div class="fleet-site-grid"><label>خط العرض بالدرجات<input id="fleet-pass-lat" type="number" min="-90" max="90" step="any" required></label><label>خط الطول بالدرجات<input id="fleet-pass-lon" type="number" min="-180" max="180" step="any" required></label><label>ارتفاع الموقع عن مرجع WGS84 بالمتر<input id="fleet-pass-height" type="number" min="-500" max="9000" value="0" step="any" required></label><label>أقل زاوية ارتفاع فوق الأفق<input id="fleet-pass-elevation" type="number" min="0" max="89" value="10" step="any" required></label><label>التوقيت<select id="fleet-pass-zone"><option value="3">الرياض UTC+03:00</option><option value="0">UTC</option></select></label></div><button id="fleet-pass-run" type="submit">حساب المرور القادم · 24 ساعة</button><button id="fleet-pass-cancel" type="button" disabled>إلغاء الحساب</button></form><p id="fleet-pass-status" role="status" aria-live="polite">أدخل موقع الحساب ثم احسب مرور المجموعة.</p><p id="fleet-pass-window"></p><ol id="fleet-pass-list"></ol><div class="fleet-pass-actions"><button id="fleet-pass-country" type="button">استخدام المجموعة في تقرير البلد</button><button id="fleet-pass-observer" type="button">تقرير موقع الرصد للمجموعة</button></div><p>الحساب من وقت الخريطة وبالعناصر المتاحة، بخطوة 10 ثوانٍ. قد تفوت حالات أقصر من الخطوة. المرور هندسي ولا يضمن الرؤية أو التصوير أو الاتصال. يتوقف الحساب والعدّ عند إخفاء اللوحة؛ أعد الحساب لتحديث نافذة التنبؤ.</p>';
  panel.append(host);
  const experience = FleetExperience.mount(host, {
    stamp,
    openPass: (pass, object) => PassMap.show(pass, object),
  });
  const status = $('fleet-pass-status'),
    form = $('fleet-pass-form'),
    list = $('fleet-pass-list'),
    rows = new Map();
  $('fleet-pass-window').dir = 'ltr';
  $('fleet-pass-window').dataset.noTranslate = '';
  let worker = null,
    generation = 0,
    pending = null,
    result = null,
    source = [],
    timer = null,
    intersecting = false;
  function visible() {
    return (
      !document.hidden &&
      panel.open &&
      dialog.open &&
      MadarShell.current() === 'map' &&
      intersecting
    );
  }
  function busy(value) {
    $('fleet-pass-run').disabled = value || !MapFleet.size;
    $('fleet-pass-cancel').disabled = !value;
  }
  function stop() {
    generation++;
    worker?.terminate();
    worker = null;
  }
  function invalidate(message) {
    stop();
    clearInterval(timer);
    timer = null;
    pending = result = null;
    source = [];
    rows.clear();
    list.replaceChildren();
    experience.reset();
    text($('fleet-pass-window'), '');
    text(status, message);
    busy(false);
    $('fleet-pass-country').disabled = !MapFleet.size;
    $('fleet-pass-observer').disabled = !MapFleet.size;
  }
  function site() {
    const value = (id) => ($(id).value.trim() === '' ? NaN : Number($(id).value));
    return {
      name: 'موقع الرصد',
      lat: value('fleet-pass-lat'),
      lon: value('fleet-pass-lon'),
      height: value('fleet-pass-height'),
      minElevation: value('fleet-pass-elevation'),
    };
  }
  function stamp(time) {
    const offset = Number($('fleet-pass-zone').value);
    return (
      new Date(time + offset * 36e5).toISOString().slice(0, 19).replace('T', ' ') +
      (offset === 3 ? ' UTC+03:00' : ' UTC')
    );
  }
  function line(parent, label) {
    const p = document.createElement('p'),
      title = document.createElement('span'),
      value = document.createElement('bdi');
    title.textContent = label;
    value.dataset.noTranslate = '';
    value.dir = 'ltr';
    p.append(title, value);
    parent.append(p);
    return value;
  }
  function render() {
    rows.clear();
    list.replaceChildren();
    for (const object of source) {
      const li = document.createElement('li'),
        name = document.createElement('button'),
        state = document.createElement('p'),
        epoch = line(li, 'تاريخ العناصر UTC ومصدرها');
      name.type = 'button';
      name.className = 'fleet-pass-name';
      name.dataset.noTranslate = '';
      name.textContent = object.name + ' · ' + object.id;
      name.style.borderInlineStartColor = MapFleet.color(object.id);
      name.onclick = () => {
        MobileMap.close();
        choose(prepare([object])[0], false);
        focusSelected();
      };
      li.prepend(name, state);
      const times = line(li, 'بداية المرور ونهايته'),
        countdown = line(li, 'العدّ التنازلي لبداية المرور أو نهايته'),
        peak = line(li, 'زاوية الذروة °'),
        freshness = document.createElement('p');
      li.append(freshness);
      const t = OrbitData.epoch(object);
      text(
        epoch,
        Number.isFinite(t)
          ? new Date(t).toISOString().slice(0, 19).replace('T', ' ') + ' UTC'
          : '—',
      );
      const sourceLabel = document.createElement('span');
      sourceLabel.textContent = OrbitData.sourceLabel(object);
      epoch.after(' · ', sourceLabel);
      rows.set(object.id, { state, times, countdown, peak, freshness, object });
      list.append(li);
    }
    tick();
    experience.render(result, source, site());
  }
  function tick() {
    if (!visible() || !result) return;
    const now = +dateNow();
    if (now < result.start || now >= result.end) {
      invalidate('وقت الخريطة خارج نافذة الحساب؛ أعد حساب المرور.');
      return;
    }
    text($('fleet-pass-window'), stamp(result.start) + ' → ' + stamp(result.end));
    experience.tick(now, !fixedTime && !paused);
    for (const item of result.items) {
      const row = rows.get(item.id);
      if (!row) continue;
      const next = FleetPassCore.next(item, now),
        pass = next.pass;
      text(
        row.state,
        {
          invalid: 'تعذّر حساب مدار هذا القمر؛ لا تتوفر نتيجة موثوقة.',
          none: 'لم يُكتشف مرور آخر ضمن نافذة الحساب.',
          ongoing: 'مرور جارٍ عند وقت الخريطة',
          upcoming: 'مرور قادم بعد وقت الخريطة',
        }[next.state],
      );
      text(row.times, pass ? stamp(pass.entry) + ' → ' + stamp(pass.exit) : '—');
      text(row.countdown, pass ? FleetPassCore.countdown(pass, now) : '—');
      text(row.peak, pass ? pass.elevation.toFixed(1) + '°' : '—');
      const f = OrbitData.freshness(row.object, now);
      text(row.freshness, f.label);
      let clipped = row.clipped;
      if (!clipped) {
        clipped = row.clipped = document.createElement('p');
        row.freshness.after(clipped);
      }
      text(
        clipped,
        pass?.clippedStart || pass?.clippedEnd
          ? 'المرور محصور بحدود نافذة الحساب؛ الذروة تخص الجزء المحسوب.'
          : '',
      );
    }
  }
  function start() {
    if (!pending || worker || !visible()) return;
    const active = ++generation;
    busy(true);
    text(status, 'جارٍ حساب مرور مجموعة الخريطة محليًا…');
    try {
      worker = new Worker('fleet-pass-worker.js?v=65');
      worker.onmessage = (event) => {
        if (active !== generation || !visible()) return;
        const m = event.data;
        if (m.type === 'progress') return;
        stop();
        pending = null;
        busy(false);
        if (m.type === 'error') {
          text(status, m.message);
          return;
        }
        result = m.result;
        text(status, 'اكتمل حساب المرور القادم للمجموعة.');
        render();
        sync();
      };
      worker.onerror = () => {
        if (active !== generation) return;
        invalidate('تعذّر تشغيل الحساب. حاول مرة أخرى.');
      };
      worker.postMessage(pending);
    } catch {
      invalidate('تعذّر تشغيل الحساب. حاول مرة أخرى.');
    }
  }
  function sync() {
    if (visible()) {
      if (result && !timer) timer = setInterval(tick, 1000);
      start();
      tick();
    } else {
      clearInterval(timer);
      timer = null;
      if (worker) {
        stop();
        text(status, 'توقف الحساب مؤقتًا لأن اللوحة مخفية؛ يستأنف عند العودة.');
      }
    }
  }
  form.onsubmit = (event) => {
    event.preventDefault();
    invalidate('جارٍ تجهيز بيانات التقرير…');
    try {
      const startTime = +dateNow(),
        request = { observer: site(), start: startTime, end: startTime + 864e5, step: 10 };
      ObserverEngine.validate(request);
      source = MapFleet.objects();
      if (!source.length) throw Error('اختر من قمر واحد إلى 12 قمرًا صالحًا من مجموعة الخريطة.');
      pending = { objects: source, request };
      start();
    } catch (err) {
      text(status, err.message);
    }
  };
  form.addEventListener('input', (event) => {
    if (event.target.id !== 'fleet-pass-zone') invalidate('تغيّر موقع الحساب؛ أعد حساب المرور.');
  });
  $('fleet-pass-zone').onchange = tick;
  $('fleet-pass-cancel').onclick = () => invalidate('أُلغي حساب المرور القادم.');
  function report(kind) {
    if (!MapFleet.size) return;
    if (
      (kind === 'country' && reportBusy) ||
      (kind === 'observer' && $('observer-form').getAttribute('aria-busy') === 'true')
    ) {
      text(status, 'انتظر انتهاء التقرير الحالي أو ألغِه قبل تغيير نطاقه.');
      return;
    }
    if (kind === 'observer') {
      if (!form.reportValidity()) return;
      const a = site();
      for (const [key, value] of Object.entries({
        lat: a.lat,
        lon: a.lon,
        height: a.height,
        elevation: a.minElevation,
        zone: $('fleet-pass-zone').value,
      }))
        $('observer-' + key).value = value;
      const start = result?.start ?? +dateNow(),
        end = result?.end ?? start + 864e5,
        offset = Number($('fleet-pass-zone').value) * 36e5,
        first = new Date(start + offset).toISOString(),
        last = new Date(end + offset).toISOString();
      $('observer-date').value = first.slice(0, 10);
      $('observer-start').value = first.slice(11, 19);
      $('observer-end').value = last.slice(11, 19);
      $('observer-next').checked = first.slice(0, 10) !== last.slice(0, 10);
    }
    $(kind === 'country' ? 'report-scope' : 'observer-scope').value = 'fleet';
    MobileMap.close();
    MadarShell.selectReport(kind);
    MadarShell.show('reports', { focus: true });
    DraftState.save();
  }
  $('fleet-pass-country').onclick = () => report('country');
  $('fleet-pass-observer').onclick = () => report('observer');
  document.addEventListener('madar-fleet', () =>
    invalidate('تغيّرت مجموعة الخريطة أو عناصرها؛ أعد حساب المرور.'),
  );
  document.addEventListener('madar-language', tick);
  document.addEventListener('visibilitychange', sync);
  document.addEventListener('madar-route', sync);
  panel.addEventListener('toggle', sync);
  new MutationObserver(sync).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  if (root.IntersectionObserver) {
    new IntersectionObserver((entries) => {
      intersecting = entries[0].isIntersecting;
      sync();
    }).observe(host);
  } else {
    const viewport = () => {
      const r = host.getBoundingClientRect();
      intersecting = r.bottom > 0 && r.top < innerHeight;
      sync();
    };
    root.addEventListener('scroll', viewport, true);
    root.addEventListener('resize', viewport);
    dialog.addEventListener('toggle', viewport);
    panel.addEventListener('toggle', viewport);
    viewport();
  }
  root.FleetPasses = { invalidate };
  invalidate('أدخل موقع الحساب ثم احسب مرور المجموعة.');
})(window);
