'use strict';
const $ = (id) => document.getElementById(id),
  S = window.satellite;
const satelliteFont = {
  familyName: 'Madar Satellite',
  resolution: 1000,
  boundingBox: { yMin: 0, yMax: 900 },
  underlineThickness: 0,
  glyphs: {
    S: {
      ha: 1400,
      x_min: 0,
      x_max: 1400,
      o: 'm 0 280 l 430 280 l 430 650 l 0 650 l 0 280 m 500 210 l 900 210 l 900 730 l 500 730 l 500 210 m 970 280 l 1400 280 l 1400 650 l 970 650 l 970 280 m 400 430 l 1000 430 l 1000 500 l 400 500 l 400 430 m 665 720 l 735 720 l 735 900 l 665 900 l 665 720',
    },
  },
};
let defaultLabelFont = null,
  renderedMarkerMode = null;
const selection = SatelliteSelection.create();
const satelliteCard = SatelliteCard.create({
  document,
  orbit: OrbitData,
  values: LiveValues,
  getMetadata: (id) => window.SatMetadata?.get(id),
  sourceDetails: {
    render: (object, metadata) => window.SourceDetails?.render(object, metadata),
    clear: () => window.SourceDetails?.clear(),
  },
  describeMetric: (label) => window.MadarGuide?.description(label),
  position: (object) => position(object),
});
const markerCache = new Map();
let objects = [],
  onlySaved = false,
  world = null,
  paused = false,
  pausedAt = null,
  requestId = 0,
  pathAt = 0,
  sourceMessage = '',
  loadedGroup = 'stations',
  fixedTime = null,
  globalCatalog = null,
  globalMode = false;
const watchlist = WatchlistState.create({
  orbit: OrbitData,
  privacy: window.Privacy,
  store: window.StateStore,
});
// عرض جميع الأقمار على الكرة: المواقع تُحسب في خيط منفصل وتُرسم كنقاط خفيفة.
const DETAIL_LIMIT = 1500;
const Swarm = MapSwarm.create({
  getWorld: () => world,
  createWorker: typeof Worker === 'undefined' ? null : () => new Worker('positions-worker.js?v=43'),
  serialize: OrbitData.serialize,
  category: OrbitAppearance.category,
  isSceneActive: () => window.RenderLifecycle?.sceneActive() !== false,
  onFailure: () => {
    pathAt = 0;
    update();
  },
});
function parse(text, provenance = { mode: 'local', snapshot: '2026-10-13', fetchedAt: null }) {
  return OrbitData.parse(text, provenance);
}
function prepare(a) {
  return Object.assign(
    a.map((o) =>
      Object.defineProperty({ ...o }, 'rec', {
        configurable: true,
        get() {
          let rec = null;
          try {
            rec = S ? OrbitData.satrec(S, this) : null;
          } catch {}
          Object.defineProperty(this, 'rec', { value: rec, writable: true, configurable: true });
          return rec;
        },
      }),
    ),
    {
      failed: a.failed || [],
      derived: !!a.derived,
      rejected: a.rejected || 0,
      note: a.note || '',
      source: a.source || '',
    },
  );
}
function dateNow() {
  return fixedTime || (paused ? pausedAt : new Date());
}
function position(o, date = dateNow()) {
  if (!o?.rec || !S) return null;
  try {
    const pv = S.propagate(o.rec, date);
    if (!pv?.position || !pv.velocity) return null;
    const gd = S.eciToGeodetic(pv.position, S.gstime(date));
    if (!Number.isFinite(gd.height) || gd.height < 0) return null;
    return {
      lat: (gd.latitude * 180) / Math.PI,
      lng: (gd.longitude * 180) / Math.PI,
      alt: gd.height / 6371,
      h: gd.height,
      speed: Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z),
    };
  } catch {
    return null;
  }
}
let catalogLoading = true;
function setCatalogLoading(value) {
  catalogLoading = value;
  document.querySelector('.catalog').setAttribute('aria-busy', String(value));
  $('catalog-loading').hidden = !value;
  $('refresh').disabled = value;
  $('follow-group').disabled = value;
  $('refresh').textContent = value ? 'جارٍ التحديث…' : '↻ فحص تحديث البيانات';
  if (value) $('catalog-empty-actions').hidden = true;
  else document.dispatchEvent(new Event('catalog-loaded'));
}
function setStatus(message) {
  sourceMessage = message;
  $('status').textContent = (paused ? 'Ⅱ العرض متوقف مؤقتًا · ' : '') + message;
}
async function fetchCatalogGroup(group, force = false) {
  const res = await SatGroups.fetchGroup(group, parse, { force });
  let data = res.data;
  if (group === 'military') {
    try {
      const extra = await SatGroups.fetchGroup('intelligence', parse);
      data = OrbitData.merge([data, extra.data]);
    } catch {}
  }
  data.source = res.source;
  data.derived = res.source === 'derived';
  data.note = res.note || '';
  data.rejected = res.rejected || 0;
  return data;
}
async function loadGlobalCatalog() {
  globalCatalog = prepare(await fetchCatalogGroup('active'));
  return globalCatalog;
}
function describeDataset(data) {
  return (
    (data.source === 'live'
      ? 'وصلت عناصر مدارية من CelesTrak'
      : data.source === 'cache'
        ? 'عناصر CelesTrak محفوظة من آخر جلب'
        : data.source === 'derived'
          ? 'تصنيف تقريبي من الفهرس الاحتياطي'
          : 'نسخة احتياطية' +
            (OrbitData.snapshotDates(data).length
              ? ' · تاريخ النسخة ' + OrbitData.snapshotDates(data).join('، ')
              : ' · تاريخ النسخة غير موثق')) +
    ' · المواضع محسوبة' +
    (data.note ? ' · ' + data.note : '')
  );
}
function refreshFavorites(data) {
  if (watchlist.refresh(data)) watchlist.save();
}
async function loadSingle(force = false) {
  await watchlist.ready;
  const token = ++requestId,
    group = $('group').value;
  await window.SatMetadata?.load().catch(() => null);
  if (token !== requestId) return;
  globalMode = false;
  $('search-info').textContent = 'التصفية السريعة في المجموعة الحالية';
  setCatalogLoading(true);
  setStatus('جارٍ تحميل المجموعة المطلوبة…');
  let data = [],
    source = '';
  try {
    data = await fetchCatalogGroup(group, force);
    source = describeDataset(data);
  } catch (e) {
    source = e.message || 'تعذّر تحميل البيانات.';
  }
  if (token !== requestId) return;
  $('defense-note').hidden = !['military', 'intelligence'].includes(group);
  $('follow-group').hidden = !['military', 'intelligence'].includes(group);
  objects = prepare(data);
  refreshFavorites(objects);
  loadedGroup = group;
  selection.refreshCatalog(objects);
  $('count').textContent = objects.length.toLocaleString('en-US');
  setStatus(source);
  setCatalogLoading(false);
  pathAt = 0;
  const filtered = rows();
  selection.reconcile(filtered, { preserveIntent: true });
  renderList();
  update();
  if (selection.current && selection.byUser) focusSelected();
}
async function load(force = false) {
  await watchlist.ready;
  await window.SatMetadata?.load().catch(() => null);
  if (!window.TypePicker?.selected('catalog').length) return loadSingle(force);
  const token = ++requestId;
  globalMode = false;
  setCatalogLoading(true);
  setStatus('جارٍ تحميل الأنواع المختارة…');
  try {
    const data = await TypePicker.load('catalog', force);
    if (token !== requestId) return;
    objects = prepare(data);
    selection.refreshCatalog(objects);
    loadedGroup = 'types';
    $('count').textContent = objects.length.toLocaleString('en-US');
    $('search-info').textContent = 'الأنواع: ' + TypePicker.name(TypePicker.selected('catalog'));
    $('defense-note').hidden = !TypePicker.selected('catalog').some((k) =>
      ['military', 'intelligence'].includes(k),
    );
    $('follow-group').hidden = false;
    setStatus(
      'أنواع مختارة · المواقع محسوبة من العناصر المتاحة' +
        (data.derived ? ' · بعضها مستخرج من النسخة الاحتياطية' : '') +
        (data.failed?.length ? ' · تعذّر تحميل: ' + data.failed.join('، ') : ''),
    );
    pathAt = 0;
    const filtered = rows();
    selection.reconcile(filtered, { preserveIntent: true });
    renderList();
    update();
  } catch (e) {
    if (token === requestId)
      setStatus(
        (objects.length ? 'تعذّر تحديث الأنواع؛ ما زالت بيانات التحميل السابق معروضة. ' : '') +
          e.message,
      );
  } finally {
    if (token === requestId) {
      setCatalogLoading(false);
      renderList();
    }
  }
}
function countryMatches(o) {
  const value = $('catalog-country')?.value || 'all';
  if (value === 'all') return true;
  const meta = window.SatMetadata?.get(o.id);
  if (value === 'unknown') return !meta?.ownerCode;
  if (value.startsWith('owner:')) return meta?.ownerCode === value.slice(6);
  if (value === 'CIS') return meta?.ownerCode === 'CIS';
  if (value === 'other')
    return meta?.ownerCode && !['US', 'CIS', 'PRC', 'IND', 'ISRO'].includes(meta.ownerCode);
  return meta?.ownerIso2 === value;
}
var rowCache, lastRenderedRows;
function rows() {
  const query = $('search').value.trim(),
    country = $('catalog-country')?.value || 'all',
    age = $('catalog-freshness')?.value || 'all',
    sort = $('catalog-sort')?.value || 'original',
    time = +dateNow(),
    dataset = onlySaved ? watchlist.items : globalMode && globalCatalog ? globalCatalog : objects,
    key = JSON.stringify([query, country, onlySaved, age, sort, window.MapDisplay?.key()]),
    same = rowCache?.dataset === dataset && rowCache.key === key;
  if (same && (age === 'all' || (time >= rowCache.time && time < rowCache.until)))
    return rowCache.data;
  let base;
  if (same) base = rowCache.base;
  else {
    const matches = CatalogSearch.compile(query);
    base = (onlySaved ? prepare(dataset) : dataset).filter((o) => {
      if (!countryMatches(o) || (window.MapDisplay && !MapDisplay.matches(o))) return false;
      if (!query) return true;
      const meta = window.SatMetadata?.get(o.id);
      return matches(o, {
        catalogName: [meta?.catalogName, OrbitData.fields(o).internationalId].join(' '),
        program: meta?.program,
      });
    });
  }
  const { data, until } = CatalogSearch.refine(base, { age, sort, time }, OrbitData.epoch);
  rowCache = { dataset, key, base, data, time, until };
  return data;
}
const LIST_SIZE = 100;
let listPage = 0,
  listContext = '',
  listDataset = null;
function reconcileSelection() {
  const data = rows();
  if (selection.reconcile(data)) pathAt = 0;
  return data;
}
let selectionFrame = 0,
  selectionTask = 0;
function choose(o, focus = true) {
  if (!o) return;
  selection.select(o);
  showGlobeCard();
  pathAt = 0;
  for (const button of $('list').querySelectorAll('button[data-satellite-id]')) {
    const active = button.dataset.satelliteId === String(o.id);
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  }
  update({ scene: false });
  cancelAnimationFrame(selectionFrame);
  clearTimeout(selectionTask);
  selectionFrame = requestAnimationFrame(() => {
    selectionTask = setTimeout(() => {
      updateGlobe();
      if (focus) focusSelected();
    }, 0);
  });
}
function mapChoose(o, focus = false) {
  choose(o, focus);
  window.MapFleet?.pick(o);
}
function* pickableSatellites() {
  for (const p of world?.pointsData() || []) yield [p, p.obj];
  for (const group of world?.particlesData?.() || [])
    for (const p of group) yield [p, Swarm.object(p)];
}

function renderList() {
  const list = $('list');
  list.replaceChildren();
  const data = rows();
  lastRenderedRows = data;
  const dataset = onlySaved
      ? watchlist.items
      : globalMode && globalCatalog
        ? globalCatalog
        : objects,
    context = JSON.stringify([
      $('search').value,
      $('catalog-country').value,
      onlySaved,
      $('catalog-freshness').value,
      $('catalog-sort').value,
      window.MapDisplay?.key(),
    ]);
  if (context !== listContext || dataset !== listDataset) {
    listPage = 0;
    listContext = context;
    listDataset = dataset;
  }
  const pages = Math.max(1, Math.ceil(data.length / LIST_SIZE));
  listPage = Math.min(listPage, pages - 1);
  const start = listPage * LIST_SIZE;
  $('saved').textContent = '☆ المتابعة (' + watchlist.items.length + ')';
  $('results-summary').textContent = data.length
    ? 'عرض ' +
      (start + 1) +
      '–' +
      Math.min(start + LIST_SIZE, data.length) +
      ' من ' +
      data.length.toLocaleString('en-US') +
      ' نتيجة'
    : catalogLoading
      ? 'جارٍ تحميل النتائج…'
      : !onlySaved && !dataset.length
        ? 'لا تتوفر بيانات في النطاق الحالي'
        : 'لا توجد نتائج مطابقة';
  $('list-pagination').hidden = data.length <= LIST_SIZE;
  $('list-page').textContent = 'الصفحة ' + (listPage + 1) + ' من ' + pages;
  $('list-previous').disabled = listPage === 0;
  $('list-next').disabled = listPage === pages - 1;
  $('clear-search').disabled = !$('search').value;
  window.WatchlistBackup?.refresh();
  $('catalog-empty-actions').hidden = data.length > 0 || catalogLoading;
  $('catalog-empty-reset').hidden =
    (!onlySaved && !dataset.length) || (onlySaved && !watchlist.items.length);
  $('catalog-empty-browse').hidden = !onlySaved || watchlist.items.length > 0;
  $('catalog-empty-refresh').hidden = onlySaved || dataset.length > 0;
  if (!data.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = catalogLoading
      ? 'جارٍ تحميل بيانات الأقمار…'
      : onlySaved
        ? watchlist.items.length
          ? 'لا توجد نتائج ضمن متابعتك مع البحث والدولة وحداثة العناصر الحالية. أعد ضبط التصفية لإظهار المتابعة.'
          : 'قائمة المتابعة فارغة. أضف قمرًا من زر المتابعة.'
        : !dataset.length
          ? 'لا توجد بيانات أقمار في النطاق الحالي. أعد تحميل البيانات أو اختر مجموعة أخرى.'
          : 'لا توجد نتائج مع البحث والدولة وحداثة العناصر الحالية. أعد ضبط التصفية أو ابحث في جميع الأقمار النشطة.';
    list.append(p);
    return;
  }
  const savedIds = new Set(watchlist.items.map((o) => o.id)),
    now = dateNow();
  for (const o of data.slice(start, start + LIST_SIZE)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.satelliteId = String(o.id);
    b.className = 'sat' + (selection.current?.id === o.id ? ' selected' : '');
    b.setAttribute('aria-pressed', String(selection.current?.id === o.id));
    const dot = document.createElement('span');
    dot.className = 'dot';
    const body = document.createElement('span'),
      name = document.createElement('b'),
      meta = document.createElement('small'),
      quality = document.createElement('small');
    name.textContent = o.name;
    meta.textContent = 'NORAD ' + o.id + (savedIds.has(o.id) ? ' · ★' : '');
    const freshness = OrbitData.freshness(o, now),
      labels = {
        recent: 'عناصر ضمن 24 ساعة',
        aging: 'عناصر بين 24 و72 ساعة',
        old: 'عناصر أبعد من 72 ساعة',
        unknown: 'تاريخ العناصر غير متاح',
      },
      mission = window.SatMetadata?.get(o.id);
    quality.className = 'catalog-quality';
    quality.dataset.level = freshness.level;
    quality.textContent = labels[freshness.level] + (mission ? ' · ' + mission.evidenceLabel : '');
    quality.title =
      'الفارق المطلق بين تاريخ العناصر ووقت العرض؛ لا يمثل ضمان دقة. توثيق المهمة مستقل عن حداثة المدار.';
    body.append(name, meta, quality);
    b.append(dot, body);
    b.onclick = () => choose(o);
    list.append(b);
  }
}
function changeListPage(delta) {
  listPage += delta;
  renderList();
  $('list').scrollTop = 0;
  $('list').querySelector('button')?.focus({ preventScroll: true });
}
function update({ scene = true } = {}) {
  if (window.RenderLifecycle?.pageActive() === false) return;
  const now = dateNow();
  window.MapDisplay?.status(rows());
  if ($('health-display'))
    $('health-display').textContent =
      new Date(now).toISOString().slice(0, 19).replace('T', ' ') +
      ' UTC' +
      (fixedTime ? ' · وقت مختار' : paused ? ' · متوقف مؤقتًا' : ' · موقع محسوب في الوقت الحالي');
  if (rows() !== lastRenderedRows) {
    reconcileSelection();
    renderList();
  }
  satelliteCard.syncFavorites(
    selection.current,
    !!selection.current && watchlist.has(selection.current.id),
  );
  if ($('view-mode'))
    $('view-mode').textContent = fixedTime
      ? '◷ عرض في التاريخ والوقت المختارين'
      : paused
        ? 'Ⅱ العرض متوقف'
        : '● موضع محسوب الآن · تحديث كل ثانية';
  $('clock').textContent =
    new Intl.DateTimeFormat('ar-SA', {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: Number($('timezone').value) === 0 ? 'UTC' : 'Asia/Riyadh',
    }).format(now) + (Number($('timezone').value) === 0 ? ' · UTC' : ' · الرياض');
  $('focus').disabled = !selection.current || !world;
  satelliteCard.renderDetails(selection.current, now);
  renderDataHealth(selection.current, now);
  if (scene) updateGlobe();
}
function satelliteMarkers() {
  return $('marker-style')?.value === 'satellite';
}
function updateGlobe() {
  if (!world || window.RenderLifecycle?.sceneActive() === false) {
    updateGlobeCard();
    return;
  }
  const mode = satelliteMarkers();
  if (renderedMarkerMode !== mode) {
    world.labelTypeFace(mode ? satelliteFont : defaultLabelFont);
    renderedMarkerMode = mode;
  }
  const now = dateNow();
  const matches = window.MapFleet?.display(rows()) || rows();
  const dense = matches.length > DETAIL_LIMIT && Swarm.supported();
  let displayed = dense ? [] : matches.slice(0, 2000);
  Swarm.show(dense ? matches : [], now);
  if (dense)
    $('hint').textContent =
      'عرض جميع الأقمار (' +
      matches.length.toLocaleString('en-US') +
      ') · اضغط على أي نقطة لتحديد القمر';
  else if (matches.length > 2000 && !onlySaved)
    $('hint').textContent = 'عرض أول 2,000 قمر · اختر الدولة أو ابحث لإظهار الأقمار الأخرى';
  else $('hint').textContent = 'اسحب للتدوير · مرّر للتكبير · اضغط على قمر';
  if (
    selection.current &&
    selection.byUser &&
    matches.some((o) => o.id === selection.current.id) &&
    !displayed.some((o) => o.id === selection.current.id)
  )
    displayed = [...displayed, selection.current];
  if (window.MapFleet?.size) {
    const ids = new Set(displayed.map((o) => o.id));
    for (const entry of MapFleet.snapshot().items)
      if (!ids.has(entry.object.id)) {
        const found = matches.find((o) => o.id === entry.object.id);
        if (found) displayed.push(found);
      }
  }
  const pts = [];
  for (const o of displayed) {
    const p = position(o, now);
    if (p) {
      const next = mode || window.MapDisplay?.flags() ? position(o, new Date(+now + 5000)) : null,
        bearing = next ? motionBearing(p, next) : 0,
        marker = markerCache.get(o.id) || {};
      const lng = Number.isFinite(marker.lng)
        ? marker.lng + ((((p.lng - marker.lng + 540) % 360) + 360) % 360) - 180
        : p.lng;
      const heading = Number.isFinite(marker.bearing)
        ? marker.bearing + ((((bearing - marker.bearing + 540) % 360) + 360) % 360) - 180
        : bearing;
      Object.assign(marker, p, { lng, bearing: heading, name: o.name, id: o.id, obj: o });
      markerCache.set(o.id, marker);
      pts.push(marker);
    }
  }
  const visibleIds = new Set(pts.map((p) => p.id));
  for (const id of markerCache.keys()) if (!visibleIds.has(id)) markerCache.delete(id);
  const duration = fixedTime || paused ? 0 : 900;
  world.pointsTransitionDuration(duration).labelsTransitionDuration(duration);
  $('count').textContent = (dense ? matches.length : pts.length).toLocaleString('en-US');
  world.pointsData(pts);
  world.labelsData(
    window.MapDisplay?.flags()
      ? []
      : satelliteMarkers()
        ? pts
        : pts.filter((o) => o.id === selection.current?.id || window.MapFleet?.has(o.id)),
  );
  window.MapDisplay?.update(world, pts, matches, duration);
  if (window.MapFleet?.size) {
    world.pathsData(MapFleet.paths(now));
  } else if (selection.current && selection.byUser && (Date.now() - pathAt > 30000 || !pathAt)) {
    const period = 1440 / OrbitData.fields(selection.current).motion,
      path = [];
    for (let i = 0; i <= 160; i++) {
      const p = position(selection.current, new Date(now.getTime() + (i * period * 60000) / 160));
      if (p) path.push([p.lat, p.lng, p.alt]);
    }
    world.pathsData(path.length ? [path] : []);
    pathAt = Date.now();
  } else if (!selection.current || !selection.byUser) world.pathsData([]);
  if (selection.tracking && selection.current) {
    const p = position(selection.current, now),
      camera = world.pointOfView();
    if (p)
      world.pointOfView(
        { lat: p.lat, lng: p.lng, altitude: Math.max(camera.altitude, p.alt + 1.1) },
        duration,
      );
  }
  updateGlobeCard();
}
function focusSelected() {
  const p = position(selection.current);
  if (world && p)
    world.pointOfView({ lat: p.lat, lng: p.lng, altitude: Math.max(1.8, p.alt + 1.1) }, 850);
}
function initGlobe(compat = false) {
  try {
    if (!window.Globe) throw Error('المكتبة غير متاحة');
    const holder = $('globe');
    world = (
      compat
        ? window.Globe({ waitForGlobeReady: false, animateIn: false })(holder)
        : new window.Globe(holder, { waitForGlobeReady: false, animateIn: false })
    )
      .globeImageUrl('assets/earth.jpg')
      .backgroundImageUrl('assets/stars.png')
      .backgroundColor('#080d16')
      .showAtmosphere(true)
      .atmosphereColor('#63bce7')
      .atmosphereAltitude(0.16)
      .pointsMerge(false)
      .pointLat('lat')
      .pointLng('lng')
      .pointAltitude('alt')
      .pointRadius((d) =>
        satelliteMarkers()
          ? 0
          : d.id === selection.current?.id
            ? 0.34
            : window.MapFleet?.has(d.id)
              ? 0.27
              : 0.18,
      )
      .pointResolution(6)
      .pointColor(
        (d) =>
          window.MapFleet?.color(d.id) ||
          (d.id === selection.current?.id
            ? '#e8fff9'
            : OrbitAppearance.color(OrbitAppearance.category(d.obj))),
      )
      .pointLabel((d) => {
        const el = document.createElement('span');
        el.textContent = d.name + ' · NORAD ' + d.id;
        return el;
      })
      .onPointClick((d, e) => {
        if (!window.GlobePicking?.handled(e)) mapChoose(d.obj, false);
      })
      .labelRotation((d) => (satelliteMarkers() ? d.bearing : 0))
      .labelLat('lat')
      .labelLng('lng')
      .labelAltitude('alt')
      .labelText((d) => (satelliteMarkers() ? 'S' : d.name))
      .labelSize((d) => (satelliteMarkers() ? (d.id === selection.current?.id ? 0.9 : 0.65) : 0.7))
      .labelColor(
        (d) =>
          window.MapFleet?.color(d.id) || (d.id === selection.current?.id ? '#8ecbff' : '#2795ff'),
      )
      .labelDotRadius(() => (satelliteMarkers() ? 0 : 0.3))
      .onLabelClick((d, e) => {
        if (!window.GlobePicking?.handled(e)) mapChoose(d.obj, false);
      })
      .labelResolution(2)
      .pathPoints((d) => d)
      .pathPointLat((d) => d[0])
      .pathPointLng((d) => d[1])
      .pathPointAlt((d) => d[2])
      .pathColor((d) => d.fleetColor || '#ffd083')
      .pathStroke(1.4)
      .pathResolution(2)
      .pathTransitionDuration(0)
      .pointsTransitionDuration(0);
    if (typeof world.particlesData === 'function')
      world
        .particleLat('lat')
        .particleLng('lng')
        .particleAltitude('alt')
        .particlesSize(3)
        .particlesSizeAttenuation(false)
        .particlesColor((group) => OrbitAppearance.color(group.regime))
        .particleLabel((d) => {
          const o = Swarm.object(d);
          if (!o) return '';
          const el = document.createElement('span');
          el.textContent = o.name + ' · NORAD ' + o.id;
          return el;
        })
        .onParticleClick((d, e) => {
          const o = Swarm.object(d);
          if (o && !window.GlobePicking?.handled(e)) mapChoose(o, false);
        });
    window.GlobePicking?.install(holder, {
      world: () => world,
      candidates: pickableSatellites,
      select: (o) => mapChoose(o, false),
    });
    window.RenderQuality?.attach(world);
    defaultLabelFont = world.labelTypeFace();
    renderedMarkerMode = null;
    world.pointOfView({
      lat: 22,
      lng: 45,
      altitude: innerWidth <= 700 ? Math.max(2, (innerHeight / innerWidth) * 1.4) : 2.6,
    });
    world.controls().minDistance = 110;
    world.controls().maxDistance = 1100;
    const size = () => {
      if (holder.clientWidth > 0 && holder.clientHeight > 0)
        world.width(holder.clientWidth).height(holder.clientHeight);
    };
    new ResizeObserver(size).observe(holder);
    size();
    window.RenderLifecycle?.attach(world, holder, () => {
      pathAt = 0;
      update();
    });
    $('map-error').hidden = true;
    for (const id of ['plus', 'minus', 'reset']) $(id).disabled = false;
    window.DraftState?.restoreCamera(world);
  } catch (e) {
    world = null;
    if (!compat) {
      $('globe').replaceChildren();
      const script = document.createElement('script');
      script.src = 'vendor/globe-compat.min.js';
      script.onload = () => {
        initGlobe(true);
        pathAt = 0;
        update();
      };
      script.onerror = () => {
        $('map-error').hidden = false;
        $('map-error').textContent =
          'تعذّر تحميل العارض المتوافق. حدّث الصفحة أو افتح التطبيق في متصفح الجهاز.';
      };
      document.head.append(script);
      return;
    }
    $('map-error').hidden = false;
    $('map-error').textContent =
      'تعذّر إكمال العرض. جرّب إعادة تحميل الصفحة أو فتح التطبيق في متصفح الجهاز.';
    console.error('Globe initialization', e);
    for (const id of ['plus', 'minus', 'reset', 'focus']) $(id).disabled = true;
  }
}
$('globe-card-favorite').onclick = $('favorite').onclick = async () => {
  if (!selection.current) return;
  const exists = watchlist.has(selection.current.id);
  watchlist.toggle(selection.current);
  reconcileSelection();
  renderList();
  update();
  const durable = await watchlist.save();
  setStatus(
    (exists ? 'تمت إزالة القمر من قائمة المتابعة.' : '★ أُضيف القمر للمتابعة.') +
      (!window.Privacy.persistent()
        ? ' لهذه الجلسة فقط.'
        : !durable
          ? ' تعذّر الحفظ الدائم؛ القائمة متاحة لهذه الجلسة فقط.'
          : ''),
  );
};
$('search').oninput = () => {
  reconcileSelection();
  pathAt = 0;
  renderList();
  update();
  $('search-info').textContent =
    globalMode && globalCatalog
      ? rows().length + ' نتيجة في فهرس الأقمار النشطة'
      : 'التصفية السريعة في المجموعة الحالية';
};
$('group').onchange = () => {
  TypePicker.set('catalog', []);
  $('search').value = '';
  onlySaved = false;
  $('all').classList.toggle('active', true);
  $('saved').classList.toggle('active', false);
  return load();
};
$('refresh').onclick = () => load(true);
for (const id of ['all', 'saved'])
  $(id).onclick = () => {
    onlySaved = id === 'saved';
    $('all').classList.toggle('active', !onlySaved);
    $('saved').classList.toggle('active', onlySaved);
    reconcileSelection();
    renderList();
    pathAt = 0;
    update();
  };
$('focus').onclick = focusSelected;
$('pause').onclick = () => {
  if (fixedTime) return;
  paused = !paused;
  if (paused) pausedAt = new Date();
  $('pause').textContent = paused ? '▶' : 'Ⅱ';
  $('pause').setAttribute('aria-label', paused ? 'استئناف التحديث' : 'إيقاف التحديث مؤقتًا');
  $('pause').classList.toggle('active', paused);
  setStatus(sourceMessage);
  pathAt = 0;
  update();
};
function zoom(f) {
  if (!world) return;
  const p = world.pointOfView();
  world.pointOfView({ ...p, altitude: Math.max(0.3, Math.min(9, p.altitude * f)) }, 300);
}
$('plus').onclick = () => zoom(0.8);
$('minus').onclick = () => zoom(1.25);
$('reset').onclick = () =>
  world?.pointOfView(
    {
      lat: 22,
      lng: 45,
      altitude: innerWidth <= 700 ? Math.max(2, (innerHeight / innerWidth) * 1.4) : 2.6,
    },
    700,
  );
$('clear-search').onclick = () => {
  $('search').value = '';
  $('search').oninput();
  $('search').focus();
};
for (const id of ['catalog-freshness', 'catalog-sort'])
  $(id).onchange = () => {
    reconcileSelection();
    pathAt = 0;
    renderList();
    update();
  };
$('reset-catalog-filters').onclick = () => {
  $('search').value = '';
  $('catalog-country').value = 'all';
  $('catalog-freshness').value = 'all';
  $('catalog-sort').value = 'original';
  reconcileSelection();
  pathAt = 0;
  renderList();
  update();
  $('search-info').textContent = 'أُعيد ضبط البحث والدولة والحداثة والترتيب ضمن النطاق الحالي.';
};
$('catalog-empty-reset').onclick = () => $('reset-catalog-filters').click();
$('catalog-empty-browse').onclick = () => {
  $('reset-catalog-filters').click();
  $('all').click();
};
$('catalog-empty-refresh').onclick = () => $('refresh').click();
$('list-previous').onclick = () => changeListPage(-1);
$('list-next').onclick = () => changeListPage(1);
initTime();
initGlobe();
renderList();
load();
setInterval(() => {
  if (!paused && !fixedTime && window.RenderLifecycle?.pageActive() !== false) update();
}, 1000);

function fillTime(d) {
  const shifted = new Date(d.getTime() + Number($('timezone').value) * 3600000);
  $('date').value = shifted.toISOString().slice(0, 10);
  $('hour').value = String(shifted.getUTCHours()).padStart(2, '0');
  $('minute').value = String(shifted.getUTCMinutes()).padStart(2, '0');
  $('second').value = String(shifted.getUTCSeconds()).padStart(2, '0');
  showWeekday();
}
function readTime() {
  const ds = $('date').value,
    fields = ['hour', 'minute', 'second'].map((id) => $(id).value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ds) || fields.some((v) => v.trim() === ''))
    throw Error('أدخل التاريخ والساعة والدقيقة والثانية.');
  const [h, m, s] = fields.map(Number);
  if (![h, m, s].every(Number.isInteger) || h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59)
    throw Error('الساعة من 0 إلى 23، والدقائق والثواني من 0 إلى 59.');
  const offset = Number($('timezone').value),
    base = new Date(ds + 'T00:00:00Z');
  if (!Number.isFinite(base.getTime()) || base.toISOString().slice(0, 10) !== ds)
    throw Error('التاريخ غير صالح.');
  return new Date(base.getTime() + (h - offset) * 3600000 + m * 60000 + s * 1000);
}
function showWeekday() {
  const d = new Date($('date').value + 'T12:00:00Z');
  $('weekday').textContent = Number.isFinite(d.getTime())
    ? 'اليوم: ' + new Intl.DateTimeFormat('ar-SA', { weekday: 'long', timeZone: 'UTC' }).format(d)
    : '';
}
function initTime() {
  fillTime(new Date());
  $('date').onchange = showWeekday;
  $('timezone').onchange = () => {
    fillTime(dateNow());
    update();
  };
  $('time-form').onsubmit = (e) => {
    e.preventDefault();
    try {
      fixedTime = readTime();
      paused = false;
      $('pause').disabled = true;
      pathAt = 0;
      $('time-message').textContent =
        'موضع محسوب من العناصر المتاحة؛ لم يُحمّل أرشيف مداري خاص بالتاريخ المختار.';
      setStatus('◷ وقت محدد · المواقع تقديرية');
      renderList();
      update();
      focusSelected();
    } catch (err) {
      $('time-message').textContent = err.message;
    }
  };
  $('live').onclick = () => {
    fixedTime = null;
    paused = false;
    pausedAt = null;
    $('pause').disabled = false;
    $('pause').textContent = 'Ⅱ';
    $('pause').classList.toggle('active', false);
    $('pause').setAttribute('aria-label', 'إيقاف التحديث مؤقتًا');
    pathAt = 0;
    fillTime(new Date());
    $('time-message').textContent = '● موضع محسوب بالوقت الحالي';
    setStatus('● الوقت الحالي · تحديث الحساب كل ثانية، وليس قياسًا جديدًا');
    renderList();
    update();
  };
  $('search-form').onsubmit = async (e) => {
    e.preventDefault();
    const q = $('search').value.trim();
    if (!q) {
      $('search-info').textContent = 'اكتب اسم القمر أو رقم NORAD أولًا.';
      return;
    }
    const b = $('global-search');
    b.disabled = true;
    b.textContent = 'جارٍ البحث…';
    try {
      if (window.TypePicker?.selected('catalog').length) {
        await load();
        const matches = rows();
        $('search-info').textContent = matches.length + ' نتيجة ضمن الأنواع المختارة';
        if (matches.length) choose(matches[0]);
        return;
      }
      await loadGlobalCatalog();
      globalMode = true;
      onlySaved = false;
      $('all').classList.toggle('active', true);
      $('saved').classList.toggle('active', false);
      const matches = rows();
      $('search-info').textContent =
        matches.length +
        ' نتيجة في فهرس ' +
        globalCatalog.length +
        ' قمر نشط · ' +
        describeDataset(globalCatalog);
      reconcileSelection();
      renderList();
      if (matches.length) choose(matches[0]);
      else update();
    } catch {
      $('search-info').textContent = 'تعذّر فتح الفهرس. البحث متاح في المجموعة الحالية.';
    } finally {
      b.disabled = false;
      b.textContent = '⌕ البحث في جميع الأقمار النشطة';
    }
  };
}

window.SatMetadata?.load()
  .then(() => {
    if (selection.current) satelliteCard.renderMetadata(selection.current);
  })
  .catch(() => {
    if (selection.current) satelliteCard.renderMetadata(selection.current);
  });

$('follow-group').onclick = async () => {
  const old = watchlist.items.length;
  watchlist.merge(objects);
  renderList();
  update();
  const durable = await watchlist.save();
  setStatus(
    '★ أُضيف ' +
      (watchlist.items.length - old) +
      ' قمر إلى قائمة المتابعة.' +
      (!window.Privacy.persistent()
        ? ' لهذه الجلسة فقط.'
        : !durable
          ? ' تعذّر الحفظ الدائم؛ القائمة متاحة لهذه الجلسة فقط.'
          : ''),
  );
};

$('catalog-types').addEventListener('change', (e) => {
  if (e.target.matches('input[type=checkbox]')) {
    onlySaved = false;
    load();
  }
});
$('scene-live').onclick = () => {
  $('live').click();
  $('globe').scrollIntoView({ behavior: 'smooth', block: 'center' });
};
$('scene-time').onclick = () => {
  $('time-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('date').focus();
};

$('marker-style').onchange = () => {
  pathAt = 0;
  update();
  window.DraftState?.save();
};

function motionBearing(a, b) {
  const rad = Math.PI / 180,
    lat1 = a.lat * rad,
    lat2 = b.lat * rad,
    dl = (b.lng - a.lng) * rad;
  return (
    (Math.atan2(
      Math.sin(dl) * Math.cos(lat2),
      Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dl),
    ) /
      rad +
      360) %
    360
  );
}
function showGlobeCard() {
  if (satelliteCard.show(selection.current)) {
    positionGlobeCard();
    updateGlobeCard();
  }
}
function updateGlobeCard() {
  if (selection.current) window.MapFleet?.card(selection.current);
  satelliteCard.renderFloating(selection.current, { now: dateNow(), tracking: selection.tracking });
}
$('globe-card-close').onclick = () => {
  satelliteCard.hide();
};
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') satelliteCard.hide();
});
window.addEventListener('resize', positionGlobeCard);
window.addEventListener('scroll', positionGlobeCard, { passive: true });
$('track-selected').onclick = () => {
  selection.toggleTracking();
  updateGlobeCard();
  if (selection.tracking) focusSelected();
};

$('catalog-country').onchange = async () => {
  $('search').value = '';
  onlySaved = false;
  $('all').classList.toggle('active', true);
  $('saved').classList.toggle('active', false);
  if (!window.TypePicker?.selected('catalog').length) $('group').value = 'active';
  await load();
  const count = rows().length;
  $('country-info').textContent = count + ' قمر في الفهرس المختار لهذه الدولة أو الجهة.';
  if (selection.current) focusSelected();
  window.DraftState?.save();
};

let healthKey = '',
  healthDataset = null;
function renderDataHealth(o, time) {
  const c = window.OrbitService?.connection(
    o?.provenance?.group || loadedGroup || $('group').value,
  );
  if ($('health-connection'))
    $('health-connection').textContent =
      (c?.transport === 'server'
        ? 'عبر خادم مدار'
        : c?.transport === 'direct'
          ? 'اتصال مباشر من المتصفح'
          : 'لم يُفحص الاتصال بعد') +
      ' · ' +
      ({
        live: 'وصلت بيانات من المصدر',
        cache: 'نسخة محفوظة من جلب موثق',
        blocked: 'الاتصال متوقف مؤقتًا',
        error: 'تعذّر الاتصال',
      }[c?.state] || 'بيانات احتياطية أو مستوردة') +
      (c?.upstreamStatus ? ' · HTTP ' + c.upstreamStatus : '') +
      (c?.retryAt
        ? ' · إعادة المحاولة بعد ' +
          new Date(c.retryAt).toISOString().slice(0, 19).replace('T', ' ') +
          ' UTC'
        : '');
  if ($('health-count'))
    $('health-count').textContent =
      (onlySaved
        ? watchlist.items
        : globalMode && globalCatalog
          ? globalCatalog
          : objects
      ).length.toLocaleString('en-US') +
      ' سجلًا محمّلًا · ' +
      rows().length.toLocaleString('en-US') +
      ' نتيجة بعد التصفية';
  const dataset = rows(),
    sourceDataset = onlySaved
      ? watchlist.items
      : globalMode && globalCatalog
        ? globalCatalog
        : objects;
  const key =
    selection.byUser +
    '|' +
    (o?.id || '') +
    '|' +
    (o ? OrbitData.key(o) : '') +
    '|' +
    Math.floor(Number(time) / 60000) +
    '|' +
    JSON.stringify(o?.provenance || {});
  if (key === healthKey && dataset === healthDataset) return;
  healthKey = key;
  healthDataset = dataset;
  const panel = $('data-health');
  if (!panel) return;
  const h = o ? OrbitData.freshness(o, time) : null,
    p = o?.provenance || {};
  const stamp = (t) =>
    Number.isFinite(Number(t)) && t != null
      ? new Date(Number(t)).toISOString().slice(0, 19).replace('T', ' ') + ' UTC'
      : 'غير متاح';
  const modes = {
    live: 'جلب مباشر من المصدر',
    cache: 'نسخة محفوظة من جلب سابق',
    local: 'نسخة احتياطية محلية',
    derived: 'تصنيف تقريبي من النسخة الاحتياطية',
    independent: 'رصد علني مستقل',
    imported: 'بيانات مستوردة',
  };
  panel.dataset.level = h?.level || 'unknown';
  const summary = $('data-health-summary');
  summary.replaceChildren();
  for (const [kind, text] of [
    ['name', o && selection.byUser ? 'بيانات ' + o.name : 'حالة بيانات الأقمار'],
    ['source', o ? modes[p.mode] || 'مصدر غير موثق' : null],
    ['freshness', selection.byUser ? h?.label : 'تختلف حداثة العناصر بين الأقمار'],
  ]) {
    if (!text) continue;
    const part = document.createElement('span');
    part.className = 'health-badge health-' + kind;
    part.textContent = text;
    summary.append(part);
  }
  summary.title = selection.byUser
    ? 'تفاصيل القمر المحدد: المصدر وتاريخ العناصر وآخر جلب ناجح؛ الحداثة محسوبة بالنسبة إلى وقت العرض.'
    : 'حالة المصدر؛ اختر قمرًا لعرض حداثة عناصره وتفاصيله.';
  $('health-source').textContent = o
    ? OrbitData.sourceLabel(o) + ' · ' + (modes[p.mode] || 'سجل محفوظ دون تاريخ جلب موثق')
    : '—';
  $('health-format').textContent = o
    ? o.omm
      ? 'OMM JSON · يدعم أرقام NORAD الطويلة'
      : 'TLE · تنسيق قديم لبيانات منشورة سابقًا'
    : '—';
  $('health-epoch').textContent = stamp(h?.epoch);
  $('health-retrieved').textContent = stamp(p.fetchedAt);
  $('health-distance').textContent =
    h && Number.isFinite(h.hours)
      ? (Number(time) >= h.epoch
          ? 'تاريخ العناصر يسبق وقت العرض بـ '
          : 'تاريخ العناصر يلي وقت العرض بـ ') +
        h.hours.toFixed(1) +
        ' ساعة؛ هذا عمر النموذج بالنسبة إلى العرض، وليس تأخر موضع القمر.'
      : 'غير متاح';
  const age = o && Number.isFinite(h?.epoch) ? (Date.now() - h.epoch) / 3600000 : NaN;
  $('health-age').textContent = Number.isFinite(age)
    ? (age >= 0 ? 'قبل الآن بـ ' : 'بعد الآن بـ ') + Math.abs(age).toFixed(1) + ' ساعة'
    : 'غير متاح';
  const old = dataset.filter((item) => OrbitData.freshness(item, time).level === 'old').length;
  $('health-range').textContent =
    old +
    ' من ' +
    dataset.length +
    ' عنصرًا يبعد أكثر من 3 أيام عن وقت العرض؛ هذا مؤشر حداثة وليس نسبة دقة.';
  $('health-note').textContent =
    (p.mode === 'imported'
      ? 'سجل مستورد من ملف؛ لم يُتحقق من مصدر عناصره ولم يحدث جلب مباشر عند استعادته. '
      : '') +
    (p.snapshot ? 'النسخة الاحتياطية: ' + p.snapshot + '. ' : '') +
    (sourceDataset.note ? sourceDataset.note + ' ' : '') +
    'يجري تحديث الحساب كل ثانية، ولا تصل قياسات جديدة كل ثانية. الدقة تتأثر بعمر العناصر والمناورات. ' +
    (fixedTime ? 'لم يُحمّل أرشيف خاص بالتاريخ المختار. ' : '') +
    'تُراجع بيانات المصدر تلقائيًا بعد انتهاء ساعتين عند ظهور الصفحة وفي الوقت الحالي. قد تبقى العناصر نفسها إذا لم ينشر المصدر نموذجًا أحدث؛ لا تُغيّر تواريخها لإظهار حداثة غير حقيقية.';
  $('health-invalid').textContent = sourceDataset.rejected
    ? 'استُبعد ' + sourceDataset.rejected + ' سجلًا غير صالح من الاستجابة.'
    : '';
}
function positionGlobeCard() {
  if (window.MadarShell) {
    window.MadarShell.positionCard();
    return;
  }
  const card = $('globe-card');
  if (!card || card.hidden) return;
  const mobile = innerWidth <= 700,
    width = Math.min(mobile ? innerWidth - 24 : 345, innerWidth - 24),
    rect = $('globe').getBoundingClientRect(),
    controls = document.querySelector('.scene-bottom').getBoundingClientRect();
  card.style.left =
    (mobile ? 12 : Math.max(12, Math.min(innerWidth - width - 12, rect.left + 12))) + 'px';
  card.style.width = width + 'px';
  let bottom = 12,
    available = innerHeight - 24;
  if (controls.top < innerHeight && controls.bottom > 0) {
    const above = controls.top - 24,
      below = innerHeight - controls.bottom - 24;
    if (above >= below) {
      bottom = innerHeight - controls.top + 12;
      available = above;
    } else available = below;
  }
  card.style.bottom = bottom + 'px';
  card.style.maxHeight =
    Math.max(60, Math.min(available, mobile ? innerHeight * 0.65 : innerHeight - 24)) + 'px';
}
