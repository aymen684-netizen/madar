(function (root) {
  'use strict';
  const $ = (id) => document.getElementById(id),
    T = (value) => MadarI18n.translate(value);
  const panel = document.createElement('section');
  panel.id = 'observer-map-picker';
  panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'observer-map-heading');
  panel.innerHTML =
    '<h3 id="observer-map-heading" tabindex="-1">تحديد موقع الرصد</h3><p>اضغط على سطح الأرض لتحديد موقع الرصد.</p><p id="observer-map-coordinates" role="status" aria-live="polite"></p><p class="observer-map-note">اختيار تقريبي؛ راجع الإحداثيات وأدخل الارتفاع يدويًا.</p><div><button id="observer-map-use" type="button" disabled>استخدام الموقع في الحقول</button><button id="observer-map-cancel" type="button">إلغاء اختيار الموقع</button></div>';
  document.querySelector('.space').append(panel);
  let target = null,
    point = null,
    marker = null,
    previous = null,
    origin = null;
  function active() {
    return target !== null;
  }
  function draw() {
    if (typeof world === 'undefined' || !world?.htmlElementsData) return;
    world
      .htmlLat('lat')
      .htmlLng('lng')
      .htmlAltitude(0.004)
      .htmlElement(() => {
        const element = document.createElement('span');
        element.className = 'observer-site-marker';
        element.textContent = '⊕';
        element.setAttribute('role', 'img');
        element.setAttribute('aria-label', T('موقع الرصد المختار'));
        return element;
      })
      .htmlElementsData(marker ? [{ ...marker }] : []);
  }
  function start(next) {
    if (
      active() ||
      next.locked() ||
      typeof world === 'undefined' ||
      !world ||
      typeof world.toGlobeCoords !== 'function'
    )
      return false;
    origin = MadarShell.current();
    target = next;
    point = null;
    previous = marker;
    marker = null;
    root.GlobeMotion?.interrupt();
    if ($('map-tools-dialog').open) MobileMap.close();
    MadarShell.show('map');
    document.body.classList.add('observer-site-picking');
    panel.hidden = false;
    $('observer-map-use').disabled = true;
    $('observer-map-coordinates').textContent = 'لم يُحدَّد موقع بعد. اضغط على سطح الأرض.';
    draw();
    $('observer-map-heading').focus({ preventScroll: true });
    return true;
  }
  function pick(value) {
    if (!active()) return;
    if (
      !value ||
      !Number.isFinite(value.lat) ||
      !Number.isFinite(value.lng) ||
      Math.abs(value.lat) > 90 ||
      Math.abs(value.lng) > 180
    ) {
      point = marker = null;
      $('observer-map-use').disabled = true;
      draw();
      const status = $('observer-map-coordinates');
      status.textContent = 'الضغط خارج سطح الأرض؛ اختر نقطة على الكرة.';
      return;
    }
    point = { lat: Number(value.lat.toFixed(6)), lng: Number(value.lng.toFixed(6)) };
    marker = point;
    const status = $('observer-map-coordinates');
    status.replaceChildren();
    const label = document.createElement('span'),
      coordinates = document.createElement('bdi');
    label.textContent = 'إحداثيات الموقع المختار (عرض، طول): ';
    coordinates.dataset.noTranslate = '';
    coordinates.dir = 'ltr';
    coordinates.textContent = point.lat + '°, ' + point.lng + '°';
    status.append(label, coordinates);
    $('observer-map-use').disabled = false;
    draw();
  }
  function finish(use, restore = true) {
    if (!active()) return;
    const next = target;
    if (use && (!point || next.locked())) return;
    if (use) next.apply({ ...point });
    else marker = previous;
    target = point = previous = null;
    panel.hidden = true;
    document.body.classList.remove('observer-site-picking');
    draw();
    if (!restore) return;
    if (origin === 'reports') {
      MadarShell.selectReport('observer');
      MadarShell.show('reports');
    } else if (origin === 'map') {
      MadarShell.show('map');
      MobileMap.open('search');
      $('map-fleet-panel').open = true;
    }
    (use ? next.form.querySelector('input[id$="-lat"]') : next.opener)?.focus();
  }
  $('observer-map-use').onclick = () => finish(true);
  $('observer-map-cancel').onclick = () => finish(false);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && active()) {
      event.preventDefault();
      finish(false);
    }
  });
  document.addEventListener('madar-route', () => {
    if (active() && MadarShell.current() !== 'map') finish(false, false);
  });
  document.addEventListener('madar-language', draw);
  root.ObserverMapPicker = { active, start, pick };
})(window);
