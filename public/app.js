'use strict';
const $ = (id) => document.getElementById(id),
  S = window.satellite;
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
const dataHealth = DataHealth.create({ document, orbit: OrbitData });
const catalogRows = CatalogRows.create({
  search: CatalogSearch,
  orbit: OrbitData,
  prepare,
  getMetadata: (id) => window.SatMetadata?.get(id),
  matchesDisplay: (object) => !window.MapDisplay || MapDisplay.matches(object),
});
const catalogList = CatalogList.create({
  document,
  orbit: OrbitData,
  getMetadata: (id) => window.SatMetadata?.get(id),
  onChoose: (object) => choose(object),
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
const globeScene = GlobeScene.create({
  document,
  getGlobe: () => window.Globe,
  viewport: () => ({ width: innerWidth, height: innerHeight }),
  observeSize: (callback, holder) => new ResizeObserver(callback).observe(holder),
  appearance: OrbitAppearance,
  view: {
    isSatelliteMode: satelliteMarkers,
    selectedId: () => selection.current?.id,
    fleet: () => window.MapFleet,
    isTracking: () => selection.tracking,
  },
  extensions: () => ({
    picking: window.GlobePicking,
    quality: window.RenderQuality,
    lifecycle: window.RenderLifecycle,
    motion: window.GlobeMotion,
    draft: window.DraftState,
  }),
  particleObject: (point) => Swarm.object(point),
  events: {
    world: (value) => {
      world = value;
    },
    candidates: pickableSatellites,
    select: (object) => mapChoose(object, false),
    refresh: () => {
      pathAt = 0;
      update();
    },
    error: (error) => console.error('Globe initialization', error),
  },
});
const timeControls = TimeControls.create({
  document,
  getTime: dateNow,
  getState: () => ({ fixedTime, paused, pausedAt }),
  setState: (patch) => {
    if (patch.fixedTime !== undefined) fixedTime = patch.fixedTime;
    if (patch.paused !== undefined) paused = patch.paused;
    if (patch.pausedAt !== undefined) pausedAt = patch.pausedAt;
  },
  onRefresh: update,
  onChange: ({ status = sourceMessage, list = false, focus = false }) => {
    pathAt = 0;
    setStatus(status);
    if (list) renderList();
    update();
    if (focus) focusSelected();
  },
});
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
function catalogDataset() {
  return onlySaved ? watchlist.items : globalMode && globalCatalog ? globalCatalog : objects;
}
function rows() {
  return catalogRows.rows({
    dataset: catalogDataset(),
    query: $('search').value.trim(),
    country: $('catalog-country')?.value || 'all',
    onlySaved,
    age: $('catalog-freshness')?.value || 'all',
    sort: $('catalog-sort')?.value || 'original',
    time: +dateNow(),
    displayKey: window.MapDisplay?.key(),
  });
}
function reconcileSelection() {
  const data = rows();
  if (selection.reconcile(data)) pathAt = 0;
  return data;
}
let selectionFrame = 0,
  selectionTask = 0;
function choose(o, focus = true) {
  if (!o) return;
  window.GlobeMotion?.interrupt();
  selection.select(o);
  showGlobeCard();
  pathAt = 0;
  catalogList.select(o.id);
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
  catalogList.render({
    data: rows(),
    dataset: catalogDataset(),
    context: JSON.stringify([
      $('search').value,
      $('catalog-country').value,
      onlySaved,
      $('catalog-freshness').value,
      $('catalog-sort').value,
      window.MapDisplay?.key(),
    ]),
    onlySaved,
    saved: watchlist.items,
    query: $('search').value,
    loading: catalogLoading,
    time: dateNow(),
    selectedId: selection.current?.id,
  });
  window.WatchlistBackup?.refresh();
}
function changeListPage(delta) {
  catalogList.changePage(delta);
  renderList();
  catalogList.focusFirst();
}
function update({ scene = true } = {}) {
  window.GlobeMotion?.sync();
  if (window.RenderLifecycle?.pageActive() === false) return;
  const now = dateNow();
  window.MapDisplay?.status(rows());
  if (rows() !== catalogList.lastRows) {
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
  $('clock').textContent = TimeControls.formatClock(now, {
    language: window.MadarI18n?.language,
    offset: $('timezone').value,
  });
  $('focus').disabled =
    !selection.current ||
    !world ||
    (window.MapOrbitFilter && !MapOrbitFilter.matches(selection.current));
  satelliteCard.renderDetails(selection.current, now);
  refreshDataHealth(now);
  if (scene) updateGlobe();
}
function refreshDataHealth(time = dateNow()) {
  dataHealth.render({
    object: selection.current,
    time,
    byUser: selection.byUser,
    fixedTime: !!fixedTime,
    paused,
    dataset: rows(),
    sourceDataset: onlySaved
      ? watchlist.items
      : globalMode && globalCatalog
        ? globalCatalog
        : objects,
    connection: window.OrbitService?.connection(
      selection.current?.provenance?.group || loadedGroup || $('group').value,
    ),
  });
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
  globeScene.applyMarkerMode(world, mode);
  const now = dateNow();
  const fleetBase = window.MapFleet?.display(rows()) || rows();
  const base = window.PassMap?.display(fleetBase) || fleetBase;
  const matches = window.MapOrbitFilter?.display(base) || base;
  const selectedVisible =
    !!selection.current && (!window.MapOrbitFilter || MapOrbitFilter.matches(selection.current));
  const dense = matches.length > DETAIL_LIMIT && Swarm.supported();
  let displayed = dense ? [] : matches.slice(0, 2000);
  Swarm.show(dense ? matches : [], now);
  if (!matches.length)
    $('hint').textContent = 'لا توجد أقمار ظاهرة؛ فعّل أنواع المدارات أو عدّل تصفية الخريطة.';
  else if (dense)
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
  if (!matches.length) world.pathsData([]);
  else if (window.MapFleet?.size) {
    const paths = MapFleet.paths(now);
    world.pathsData(
      window.MapOrbitFilter ? MapOrbitFilter.paths(paths, MapFleet.objects()) : paths,
    );
  } else if (selectedVisible && selection.byUser && (Date.now() - pathAt > 30000 || !pathAt)) {
    const period = 1440 / OrbitData.fields(selection.current).motion,
      path = [];
    for (let i = 0; i <= 160; i++) {
      const p = position(selection.current, new Date(now.getTime() + (i * period * 60000) / 160));
      if (p) path.push([p.lat, p.lng, p.alt]);
    }
    world.pathsData(path.length ? [path] : []);
    pathAt = Date.now();
  } else if (!selectedVisible || !selection.byUser) world.pathsData([]);
  if (selection.tracking && selectedVisible) {
    const p = position(selection.current, now),
      camera = world.pointOfView();
    if (p)
      world.pointOfView(
        { lat: p.lat, lng: p.lng, altitude: Math.max(camera.altitude, p.alt + 1.1) },
        duration,
      );
  }
  window.PassMap?.drawFootprint();
  updateGlobeCard();
}
function focusSelected() {
  if (window.MapOrbitFilter && !MapOrbitFilter.matches(selection.current)) return;
  window.GlobeMotion?.interrupt();
  const p = position(selection.current);
  if (world && p)
    world.pointOfView({ lat: p.lat, lng: p.lng, altitude: Math.max(1.8, p.alt + 1.1) }, 850);
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
    (exists ? 'تمت إزالة القمر من المفضلة.' : '★ أُضيف القمر إلى المفضلة.') +
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
$('plus').onclick = () => globeScene.zoom(world, 0.8);
$('minus').onclick = () => globeScene.zoom(world, 1.25);
$('reset').onclick = () => globeScene.reset(world);
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
timeControls.bind();
globeScene.initialize();
renderList();
load();
setInterval(() => {
  if (!paused && !fixedTime && window.RenderLifecycle?.pageActive() !== false) update();
}, 1000);
setInterval(() => {
  if ((paused || fixedTime) && window.RenderLifecycle?.pageActive() !== false) refreshDataHealth();
}, 60000);

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
      ' قمر إلى المفضلة.' +
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
  window.GlobeMotion?.interrupt();
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
