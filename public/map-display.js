(function (root) {
  'use strict';
  const LIMIT = 180,
    $ = (id) => document.getElementById(id);
  let countriesReady = false;
  const nodes = new Map(),
    compiled = new Map();
  function flags() {
    return $('marker-style')?.value === 'flag';
  }
  function key() {
    return [$('map-mission')?.value.trim() || '', $('map-evidence')?.value || 'all'];
  }
  function matches(o) {
    const [query, evidence] = key();
    if (!query && evidence === 'all') return true;
    const m = root.SatMetadata?.get(o.id);
    if (evidence !== 'all' && (m?.missionKind || 'unknown') !== evidence) return false;
    if (!query) return true;
    let test = compiled.get(query);
    if (!test) {
      test = CatalogSearch.compile(query);
      if (compiled.size > 30) compiled.clear();
      compiled.set(query, test);
    }
    const text = [m?.mission, m?.program, m?.catalogName].filter(Boolean).join(' ');
    return test({
      name:
        /[a-z]/i.test(query) && root.MadarI18n
          ? text + ' ' + MadarI18n.translate(text, 'en')
          : text,
    });
  }
  function marker(d) {
    let n = nodes.get(d.id);
    if (!n) {
      n = document.createElement('button');
      n.type = 'button';
      n.className = 'flag-satellite';
      n.dataset.satelliteId = String(d.id);
      n.setAttribute('data-no-translate', '');
      const left = document.createElement('span'),
        body = document.createElement('span'),
        right = document.createElement('span');
      left.className = right.className = 'flag-wing';
      body.className = 'flag-body';
      const m = root.SatMetadata?.get(d.id),
        iso = m?.ownerIso2;
      if (/^[A-Z]{2}$/.test(iso || '')) {
        const img = document.createElement('img');
        img.src = 'assets/flags/' + iso.toLowerCase() + '.png';
        img.alt = '';
        img.onerror = () => {
          img.remove();
          body.classList.add('neutral');
        };
        body.append(img);
      } else {
        body.classList.add('neutral');
        body.textContent = '◇';
      }
      n.append(left, body, right);
      n.title = d.name + ' · ' + (m?.country || 'غير متاح') + ' · NORAD ' + d.id;
      n.setAttribute('aria-label', n.title);
      n.onclick = (e) => {
        e.stopPropagation();
        mapChoose(d.obj, false);
      };
      nodes.set(d.id, n);
    }
    const color = root.MapFleet?.color(d.id);
    n.classList.toggle('is-fleet', !!color);
    n.style.setProperty('--fleet-color', color || 'transparent');
    n.classList.toggle('is-selected', d.id === selected?.id);
    n.style.setProperty('--bearing', (d.bearing || 0) + 'deg');
    return n;
  }
  function updateFlags(w, points, matches, duration) {
    if (!w?.htmlElementsData) return;
    const data = flags()
      ? matches.length <= LIMIT
        ? points
        : points.filter(
            (p) => root.MapFleet?.has(p.id) || (selectedByUser && p.id === selected?.id),
          )
      : [];
    const ids = new Set(data.map((d) => d.id));
    for (const id of nodes.keys()) if (!ids.has(id)) nodes.delete(id);
    w.htmlLat('lat')
      .htmlLng('lng')
      .htmlAltitude('alt')
      .htmlElement(marker)
      .htmlTransitionDuration(duration)
      .htmlElementsData(data);
    for (const p of data) marker(p);
    updateStatus(matches);
  }
  function updateStatus(matches) {
    const note = $('map-display-status');
    if (note) {
      const text =
        matches.length.toLocaleString('en-US') +
        ' قمر ضمن التصفية الحالية' +
        (flags() && matches.length > LIMIT
          ? ' · لتخفيف ازدحام العرض يظهر علم القمر المحدد فقط؛ ضيّق التصفية إلى 180 قمرًا أو أقل لإظهار الرموز لكل الأقمار.'
          : '') +
        (flags() ? ' · العلم للجهة المسجلة، والرمز ◇ للجهات المشتركة أو غير المعروفة.' : '');
      if (note.dataset.message !== text) {
        note.dataset.message = text;
        note.textContent = text;
      }
    }
    syncCountry();
  }
  function syncCountry() {
    const source = $('catalog-country'),
      target = $('map-owner');
    if (source && target && target.value !== source.value) target.value = source.value;
  }
  function refresh() {
    rowCache = null;
    reconcileSelection();
    pathAt = 0;
    renderList();
    update();
    root.DraftState?.schedule();
  }
  function populateCountries() {
    if (countriesReady) return;
    countriesReady = true;
    const source = $('catalog-country'),
      value = source.value;
    for (const o of source.options)
      if (o.value !== 'all') o.hidden = !['US', 'CN', 'IN', 'CIS'].includes(o.value);
    for (const owner of SatMetadata.owners()) {
      if (['US', 'PRC', 'IND', 'ISRO', 'CIS'].includes(owner.code)) continue;
      const o = document.createElement('option');
      o.value = 'owner:' + owner.code;
      o.textContent = owner.label;
      source.append(o);
    }
    const unknown = document.createElement('option');
    unknown.value = 'unknown';
    unknown.textContent = 'جهة غير معروفة';
    source.append(unknown);
    source.value = value;
    const mirror = $('map-owner');
    mirror.replaceChildren(
      ...[...source.options].map((o) => {
        const copy = o.cloneNode(true);
        copy.textContent = root.MadarI18n?.original(o) || o.textContent;
        return copy;
      }),
    );
    syncCountry();
  }
  function mount() {
    const field = document.createElement('details');
    field.id = 'map-display';
    field.className = 'map-display';
    field.open = false;
    field.innerHTML =
      '<summary>تخصيص الأقمار على الخريطة · الدولة والمهمة</summary><div class="map-display-fields"><label>الدولة أو الجهة المسجلة<select id="map-owner"><option value="all">جميع الدول والجهات</option></select></label><label>المهمة أو المنظومة<input id="map-mission" maxlength="150" placeholder="مثل اتصالات أو ملاحة أو Starlink"></label><label>توثيق المهمة<select id="map-evidence"><option value="all">جميع المستويات</option><option value="documented">مهمة فردية موثقة</option><option value="program">غرض منظومة موثق</option><option value="category">تصنيف عام</option><option value="unknown">تفاصيل غير موثقة</option><option value="object-type">نوع الجسم مسجل</option></select></label><button type="button" id="map-display-reset">إظهار كل الأقمار في النطاق</button></div><p class="muted">تُطبّق الخيارات على الخريطة ودليل الأقمار ضمن المجموعة والبحث الحاليين. لا تغيّر نطاق التقارير.</p><p id="map-display-status" class="muted" role="status"></p>';
    $('shell-quick').after(field);
    $('map-owner').onchange = () => {
      $('catalog-country').value = $('map-owner').value;
      $('catalog-country').onchange();
    };
    let timer;
    $('map-mission').oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 180);
    };
    $('map-evidence').onchange = refresh;
    $('map-display-reset').onclick = () => {
      clearTimeout(timer);
      $('map-mission').value = '';
      $('map-evidence').value = 'all';
      $('catalog-country').value = 'all';
      $('search').value = '';
      refresh();
    };
    SatMetadata.load()
      .then(() => {
        populateCountries();
        refresh();
      })
      .catch(() => {
        const mirror = $('map-owner');
        mirror.replaceChildren(
          ...[...$('catalog-country').options].map((o) => {
            const copy = o.cloneNode(true);
            copy.textContent = root.MadarI18n?.original(o) || o.textContent;
            return copy;
          }),
        );
      });
  }
  root.MapDisplay = {
    flags,
    key,
    matches,
    update: updateFlags,
    status: updateStatus,
    limit: LIMIT,
  };
  mount();
})(window);
