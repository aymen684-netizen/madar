(function (root) {
  'use strict';
  const $ = (id) => document.getElementById(id),
    space = document.querySelector('.space'),
    quick = $('shell-quick'),
    counter = document.querySelector('.scene-top>div:last-child'),
    items = [counter, quick, $('map-display'), $('data-health'), $('restore-notice')].filter(
      Boolean,
    ),
    homes = new Map();
  $('data-health').append($('status'));
  const zooms = [$('plus'), $('minus')],
    zoomControls = document.createElement('div');
  zoomControls.className = 'controls';
  counter.id = 'map-scope-count';
  for (const item of [...items, ...zooms]) {
    const home = document.createComment('map tool position');
    item.before(home);
    homes.set(item, home);
  }
  const dialog = document.createElement('dialog');
  dialog.id = 'map-tools-dialog';
  dialog.setAttribute('aria-labelledby', 'map-tools-title');
  dialog.innerHTML =
    '<div class="map-sheet-head"><button type="button" id="map-sheet-handle" aria-label="اسحب إلى الأسفل لإغلاق أدوات الخريطة"><span></span></button><div><h2 id="map-tools-title">البحث وأدوات التتبع</h2><button type="button" id="map-tools-close" aria-label="إغلاق أدوات الخريطة">×</button></div></div><div id="map-sheet-content"></div>';
  document.body.append(dialog);
  const presets = document.createElement('section');
  presets.id = 'map-quick-presets';
  presets.setAttribute('aria-label', 'مجموعات جاهزة');
  TypePicker.mountPresets('catalog', presets);
  quick.append(presets);
  const rail = document.createElement('div');
  rail.id = 'map-floating-tools';
  rail.innerHTML =
    '<button type="button" id="map-tools-open" aria-label="البحث وأدوات التتبع" title="البحث وأدوات التتبع">⌕</button><button type="button" id="map-filter-open" aria-label="تخصيص الأقمار على الخريطة" title="تخصيص الأقمار على الخريطة">☷</button><button type="button" id="map-data-open" aria-label="حالة بيانات الأقمار" title="حالة بيانات الأقمار">ⓘ</button>';
  space.append(rail);
  const dataButton = $('map-data-open');
  dataButton.className = 'map-health-strip';
  dataButton.innerHTML = '<span id=map-health-source></span><span>التفاصيل</span>';
  space.append(dataButton);
  function sourceLabel() {
    const label = $('data-health-summary').querySelector('.health-source');
    $('map-health-source').textContent = label
      ? root.MadarI18n?.original(label) || label.textContent
      : 'حالة بيانات الأقمار';
  }
  new MutationObserver(sourceLabel).observe($('data-health-summary'), {
    childList: true,
    subtree: true,
    characterData: true,
  });
  sourceLabel();
  const legend = document.createElement('div');
  legend.id = 'orbit-legend';
  legend.setAttribute('aria-label', 'ألوان المدارات التقريبية');
  legend.innerHTML =
    '<span data-orbit="leo">منخفض LEO</span><span data-orbit="meo">متوسط MEO</span><span data-orbit="geo">متزامن GEO</span><span data-orbit="other">أخرى</span>';
  space.append(legend);
  let opener = null,
    moved = false;
  function active() {
    return MadarShell.current() === 'map';
  }
  function open(target) {
    if (!active()) return;
    opener = document.activeElement;
    dialog.showModal();
    if (target === 'filters') {
      $('map-display').open = true;
      $('map-display').querySelector('summary').focus();
      $('map-display').scrollIntoView({ block: 'start' });
    } else if (target === 'data') {
      $('data-health').open = true;
      $('data-health-summary').focus();
      $('data-health').scrollIntoView({ block: 'start' });
    } else $('shell-query').focus();
  }
  function close() {
    dialog.close();
  }
  $('map-tools-open').onclick = () => open('search');
  $('map-filter-open').onclick = () => open('filters');
  $('map-data-open').onclick = () => open('data');
  $('map-tools-close').onclick = close;
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (e.clientY < r.top || e.clientX < r.left || e.clientX > r.right) close();
    }
  });
  dialog.addEventListener('close', () => {
    if (active()) opener?.focus({ preventScroll: true });
  });
  const handle = $('map-sheet-handle');
  let pointer = null;
  handle.onclick = close;
  handle.addEventListener('pointerdown', (e) => {
    pointer = { id: e.pointerId, y: e.clientY };
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointerup', (e) => {
    if (pointer?.id !== e.pointerId) return;
    const distance = e.clientY - pointer.y;
    pointer = null;
    if (distance > 60) {
      e.preventDefault();
      close();
    }
  });
  handle.addEventListener('pointercancel', () => {
    pointer = null;
  });
  function layout() {
    const next = active();
    if (next && !moved) {
      for (const item of items) $('map-sheet-content').append(item);
      for (const button of zooms) zoomControls.append(button);
      rail.append(zoomControls);
      moved = true;
    } else if (!next && moved) {
      if (dialog.open) close();
      for (const item of [...items, ...zooms]) homes.get(item).after(item);
      moved = false;
    }
    document.body.classList.toggle('tracking-map', next);
    document.body.classList.toggle('mobile-map', next && MadarShell.compact());
    root.dispatchEvent(new Event('madar-map-layout'));
  }
  document.addEventListener('madar-route', layout);
  root.addEventListener('resize', layout, { passive: true });
  presets.addEventListener('click', (e) => {
    if (e.target.closest('[data-type-preset]') && dialog.open) close();
  });
  $('scene-time').addEventListener('click', () => {
    if (dialog.open) {
      close();
      requestAnimationFrame(() => $('date').focus());
    }
  });
  root.MobileMap = {
    open,
    close,
    get active() {
      return active();
    },
  };
  layout();
})(window);
