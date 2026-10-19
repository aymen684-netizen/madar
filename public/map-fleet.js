(function (root) {
  'use strict';
  const $ = (id) => document.getElementById(id),
    model = MapFleetCore.create(OrbitData),
    key = 'orbit-cache-map-fleet',
    T = (s) => MadarI18n.translate(s);
  let isolated = false,
    showPaths = true,
    multi = false,
    prepared = [],
    preparedRevision = -1,
    displayCache = null,
    pathCache = [],
    pathTime = NaN,
    pathRevision = -1;
  try {
    const saved = JSON.parse(Privacy.localGet(key) || 'null');
    if (model.restore(saved)) {
      isolated = saved.isolated === true && model.size > 0;
      showPaths = saved.paths !== false;
    }
  } catch {}
  const panel = document.createElement('details');
  panel.id = 'map-fleet-panel';
  panel.className = 'map-fleet-panel';
  panel.innerHTML =
    '<summary>مجموعة الخارطة · حتى 12</summary><p class="muted">أضف قمرًا من بطاقته أو فعّل التحديد بالضغط على الخارطة. لكل قمر لون ثابت؛ تظهر المختارة حتى عند تغيير المجموعة. هذه المجموعة مستقلة عن المفضلة وتصفية الدليل ونطاق التقارير.</p><label><input id="map-fleet-multi" type="checkbox">تحديد عدة أقمار بالضغط على الخارطة</label><label><input id="map-fleet-only" type="checkbox">إظهار المختارة فقط</label><label><input id="map-fleet-paths" type="checkbox" checked>إظهار مسارات المختارة</label><p id="map-fleet-status" class="muted" role="status" aria-live="polite"></p><ol id="map-fleet-list"></ol><button id="map-fleet-clear" type="button">إزالة جميع المختارة</button><p class="muted">المسارات تقديرات للدورة التالية من العناصر المتاحة. قد يكون بعض الأقمار خلف الأرض أو بلا موضع صالح. الحفظ يتبع خيار «حفظ عملي على هذا الجهاز».</p>';
  $('map-sheet-content').prepend(panel);
  let passesPending = null;
  panel.addEventListener('toggle', () => {
    if (!panel.open || root.FleetPasses || passesPending) return;
    passesPending = (async () => {
      for (const file of ['fleet-pass-core.js', 'fleet-experience.js', 'fleet-passes.js']) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = file + '?v=77';
          script.onload = resolve;
          script.onerror = () => {
            script.remove();
            reject(Error());
          };
          document.head.append(script);
        });
      }
    })().catch(() => {
      passesPending = null;
      say('تعذّر تحميل لوحة المرور. أغلق اللوحة وافتحها لإعادة المحاولة.');
    });
  });
  const open = document.createElement('button');
  open.id = 'map-fleet-open';
  open.type = 'button';
  open.title = 'مجموعة الخارطة';
  open.setAttribute('aria-label', 'مجموعة الخارطة');
  $('map-floating-tools').insertBefore(open, $('map-floating-tools').querySelector('.controls'));
  open.onclick = () => {
    MobileMap.open('search');
    panel.open = true;
    panel.querySelector('summary').focus();
    $('map-tools-dialog').scrollTop = 0;
  };
  const pin = document.createElement('button');
  pin.id = 'globe-card-fleet';
  pin.className = 'satellite-card-action';
  pin.type = 'button';
  pin.setAttribute('aria-pressed', 'false');
  $('globe-card-favorite').after(pin);
  pin.onclick = () => {
    if (selection.current) toggle(selection.current);
  };
  function save() {
    try {
      Privacy.localSet(key, JSON.stringify({ ...model.snapshot(), isolated, paths: showPaths }));
    } catch {
      say('تعذّر حفظ اختيار الخارطة؛ يبقى متاحًا لهذه الجلسة.');
    }
  }
  function say(message) {
    LiveValues.text($('map-fleet-status'), message);
  }
  function ready() {
    if (preparedRevision !== model.revision) {
      prepared = model.entries().map((e) => ({ ...e, object: prepare([e.object])[0] }));
      preparedRevision = model.revision;
      displayCache = null;
    }
    return prepared;
  }
  function card(o) {
    if (!o) return;
    const active = model.has(o.id);
    LiveValues.text(
      pin,
      active
        ? 'إزالة من مجموعة الخارطة'
        : model.size === 12
          ? 'اكتملت مجموعة الخارطة: 12 قمرًا؛ أزل قمرًا لإضافة آخر.'
          : 'إضافة إلى مجموعة الخارطة',
    );
    pin.setAttribute('aria-pressed', String(active));
    pin.style.setProperty('--fleet-color', model.color(o.id) || '#83efd3');
  }
  function render() {
    ready();
    LiveValues.text(open, '◉ ' + model.size + '/12');
    $('map-fleet-only').checked = isolated;
    $('map-fleet-only').disabled = !model.size;
    $('map-fleet-paths').checked = showPaths;
    $('map-fleet-multi').checked = multi;
    $('map-fleet-clear').disabled = !model.size;
    const list = $('map-fleet-list');
    list.replaceChildren();
    for (const entry of prepared) {
      const row = document.createElement('li'),
        name = document.createElement('button'),
        remove = document.createElement('button'),
        swatch = document.createElement('span'),
        label = document.createElement('bdi');
      swatch.className = 'fleet-swatch';
      swatch.style.backgroundColor = entry.color;
      swatch.setAttribute('aria-hidden', 'true');
      label.dataset.noTranslate = '';
      label.textContent = entry.object.name + ' · ' + entry.object.id;
      name.type = 'button';
      name.className = 'fleet-name';
      name.append(swatch, label);
      name.onclick = () => {
        MobileMap.close();
        choose(entry.object, false);
        focusSelected();
      };
      remove.type = 'button';
      remove.className = 'fleet-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', T('إزالة من مجموعة الخارطة') + ' · ' + entry.object.name);
      remove.onclick = () => {
        model.remove(entry.object.id);
        changed('أُزيل القمر من مجموعة الخارطة.');
      };
      row.append(name, remove);
      list.append(row);
    }
    if (selection.current) card(selection.current);
  }
  function changed(message) {
    pathRevision = -1;
    displayCache = null;
    render();
    save();
    say(message || model.size + ' / 12 · أقمار مختارة للخارطة');
    pathAt = 0;
    update();
    document.dispatchEvent(new Event('madar-fleet'));
  }
  function toggle(o) {
    const status = model.toggle(o);
    if (status === 'full') {
      say('وصلت إلى 12 قمرًا. أزل قمرًا لإضافة آخر.');
      LiveValues.text(pin, 'وصلت إلى 12 قمرًا؛ أزل قمرًا أولًا.');
      return status;
    }
    if (status === 'invalid') {
      say('لا تتوفر عناصر صالحة لهذا القمر.');
      return status;
    }
    changed(
      status === 'removed' ? 'أُزيل القمر من مجموعة الخارطة.' : 'أُضيف القمر إلى مجموعة الخارطة.',
    );
    return status;
  }
  function display(base) {
    ready();
    if (
      displayCache?.base === base &&
      displayCache.revision === model.revision &&
      displayCache.isolated === isolated
    )
      return displayCache.data;
    let data = base;
    if (isolated && model.size) data = prepared.map((e) => e.object);
    else {
      const ids = new Set(base.map((o) => o.id)),
        extra = prepared.filter((e) => !ids.has(e.object.id)).map((e) => e.object);
      if (extra.length) data = [...base, ...extra];
    }
    displayCache = { base, revision: model.revision, isolated, data };
    return data;
  }
  function paths(now) {
    if (!showPaths) return [];
    ready();
    if (pathRevision === model.revision && Math.abs(+now - pathTime) < 30000) return pathCache;
    pathRevision = model.revision;
    pathTime = +now;
    pathCache = [];
    for (const entry of prepared) {
      const motion = OrbitData.fields(entry.object).motion;
      if (!(motion > 0)) continue;
      const path = [];
      for (let i = 0; i <= 80; i++) {
        const p = position(entry.object, new Date(+now + (i * 86400000) / motion / 80));
        if (!p) {
          if (path.length) break;
          continue;
        }
        path.push([p.lat, p.lng, p.alt]);
      }
      if (path.length > 1) {
        path.fleetColor = entry.color;
        path.fleetId = entry.object.id;
        pathCache.push(path);
      }
    }
    return pathCache;
  }
  $('map-fleet-multi').onchange = (e) => {
    multi = e.target.checked;
    say(
      multi
        ? 'اضغط على الأقمار لإضافتها أو إزالتها من الاختيار.'
        : 'التحديد المتعدد متوقف؛ يمكنك الإضافة من بطاقة القمر.',
    );
  };
  $('map-fleet-only').onchange = (e) => {
    isolated = e.target.checked;
    changed();
  };
  $('map-fleet-paths').onchange = (e) => {
    showPaths = e.target.checked;
    changed();
  };
  $('map-fleet-clear').onclick = () => {
    model.clear();
    isolated = false;
    changed('أُزيلت جميع الأقمار من مجموعة الخارطة.');
  };
  root.MapFleet = {
    toggle,
    card,
    display,
    paths,
    objects: () => model.entries().map((e) => e.object),
    has: (id) => model.has(id),
    color: (id) => model.color(id),
    pick: (o) => {
      if (multi) toggle(o);
    },
    get size() {
      return model.size;
    },
    get isolated() {
      return isolated;
    },
    refresh(data) {
      if (model.refresh(data)) {
        render();
        save();
        pathRevision = -1;
        document.dispatchEvent(new Event('madar-fleet'));
      }
    },
    snapshot: () => ({ ...model.snapshot(), isolated, paths: showPaths }),
  };
  document.addEventListener('madar-language', render);
  document.addEventListener('catalog-loaded', () => root.MapFleet.refresh(objects));
  render();
  say(model.size ? model.size + ' / 12 · أقمار مختارة للخارطة' : 'لم تختر أقمارًا بعد.');
  if (model.size) {
    pathAt = 0;
    update();
  }
})(window);
