(function (root) {
  'use strict';
  function create({
    document,
    orbit,
    values,
    getMetadata,
    sourceDetails,
    describeMetric,
    position,
  }) {
    const $ = (id) => document.getElementById(id),
      liveText = (id, value) => values.text($(id), value);
    function renderMetadataSources(links, m, object) {
      if (!links) return;
      const mode = object?.provenance?.mode,
        orbitUrl =
          mode === 'independent'
            ? 'https://mmccants.org/tles/'
            : mode && mode !== 'imported'
              ? 'https://celestrak.org/NORAD/elements/gp.php?CATNR=' +
                encodeURIComponent(object.id) +
                '&FORMAT=json'
              : '';
      const entries = [
          ['مصدر الهوية', m?.countrySource],
          [m?.missionSourceTitle || 'مصدر المهمة', m?.missionSource],
          ['مصدر مشغّل المنظومة', m?.operatorSource],
          ['مصدر المدار', orbitUrl],
        ],
        key = JSON.stringify(entries);
      if (links.dataset.sources === key) return;
      links.dataset.sources = key;
      links.replaceChildren();
      for (const [label, url] of entries) {
        if (!url) continue;
        const a = document.createElement('a');
        a.textContent = label + ' ↗';
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        links.append(a);
      }
    }
    function renderMetadata(o) {
      const m = getMetadata(o.id);
      liveText('sat-operator', m?.operator || 'غير موثق في المصادر المراجعة');
      liveText('sat-owner-note', m?.ownerNote || '');
      liveText('sat-country', m?.country || 'غير متاح');
      liveText('sat-mission', m?.missionLabel || 'غير متاح');
      liveText(
        'sat-evidence',
        (m?.evidenceLabel || 'جارٍ تحميل المعلومات') + (m?.checked ? ' · مراجعة ' + m.checked : ''),
      );
      liveText('sat-profile-note', m?.missionNote || '');
      liveText('sat-launch', m?.launch || 'غير متاح');
      liveText('sat-identity-date', m?.retrieved ? 'هوية الفهرس: ' + m.retrieved : '');
      renderMetadataSources($('sat-meta-sources'), m, o);
      sourceDetails.render(o, m);
    }
    function syncFavorites(object, saved) {
      for (const id of ['favorite', 'globe-card-favorite']) {
        const button = $(id);
        button.disabled = !object;
        button.textContent = saved ? '★ إزالة من المفضلة' : '☆ إضافة إلى المفضلة';
        button.setAttribute('aria-pressed', String(saved));
      }
    }
    function renderDetails(o, now) {
      document.querySelector('.sat-identity').hidden = !o;
      $('epoch').hidden = !o;
      if (!o) {
        sourceDetails.clear();
        $('name').textContent = 'لا يوجد قمر محدد';
        $('id').textContent = 'اختر مجموعة أو حدّث البيانات';
        $('metrics').replaceChildren();
        $('n2yo').hidden = true;
        hide();
        return;
      }
      const p = position(o);
      $('name').textContent = o.name;
      renderMetadata(o);
      $('id').textContent = 'NORAD ID · ' + o.id;
      $('n2yo').hidden = false;
      $('n2yo').href = 'https://www.n2yo.com/satellite/?s=' + o.id;
      const orbital = orbit.fields(o),
        motion = orbital.motion,
        eccentricity = orbital.ecc,
        a =
          motion > 0
            ? Math.pow(398600.4418 / Math.pow((motion * 2 * Math.PI) / 86400, 2), 1 / 3)
            : null;
      const intId = orbital.internationalId;
      const vals = [
        ['الارتفاع', p ? p.h.toFixed(1) + ' km' : 'غير متاح'],
        ['السرعة', p ? p.speed.toFixed(2) + ' km/s' : 'غير متاح'],
        ['خط العرض', p ? p.lat.toFixed(2) + '°' : '—'],
        ['خط الطول', p ? p.lng.toFixed(2) + '°' : '—'],
        ['الميل المداري', orbital.incl.toFixed(4) + '°'],
        ['زمن الدورة', motion > 0 ? (1440 / motion).toFixed(1) + ' min' : '—'],
        ['المعرّف الدولي', intId],
        ['اللامركزية', eccentricity.toFixed(7)],
        ['الحضيض التقريبي', a ? (a * (1 - eccentricity) - 6371).toFixed(1) + ' km' : '—'],
        ['الأوج التقريبي', a ? (a * (1 + eccentricity) - 6371).toFixed(1) + ' km' : '—'],
        ['الدورات في اليوم', motion.toFixed(5)],
        ['المصدر', orbit.sourceLabel(o)],
      ];
      values.render($('metrics'), vals, describeMetric);
      const e = new Date(orbit.epoch(o)),
        age = Math.abs(now - e) / 864e5;
      $('epoch').textContent =
        'تاريخ العناصر: ' +
        e.toISOString().slice(0, 16).replace('T', ' ') +
        ' UTC' +
        (age > 3 ? ' · الوقت المطلوب بعيد عن تاريخ العناصر بأكثر من 3 أيام؛ التقدير أقل دقة.' : '');
    }
    function renderFloating(object, { now, tracking }) {
      const card = $('globe-card');
      if (!card || card.hidden || !object) return;
      const m = getMetadata(object.id),
        p = position(object);
      liveText('globe-card-name', object.name);
      liveText(
        'globe-card-id',
        'NORAD ' + object.id + ' · ' + orbit.fields(object).internationalId,
      );
      liveText('globe-card-country', 'الدولة أو الجهة: ' + (m?.country || 'غير متاح'));
      liveText('globe-card-mission', 'المهمة: ' + (m?.missionLabel || 'غير متاحة'));
      liveText(
        'globe-card-evidence',
        (m?.evidenceLabel || 'جارٍ تحميل المعلومات') + (m?.checked ? ' · ' + m.checked : ''),
      );
      renderMetadataSources($('globe-card-sources'), m, object);
      liveText(
        'globe-card-data-status',
        orbit.freshness(object, now).label + ' · ' + (object.omm ? 'OMM JSON' : 'TLE'),
      );
      liveText(
        'globe-card-motion',
        p ? 'الارتفاع ' + p.h.toFixed(1) + ' km · السرعة ' + p.speed.toFixed(2) + ' km/s' : '',
      );
      const flag = $('globe-card-flag');
      flag.hidden = !m?.ownerIso2;
      if (m?.ownerIso2) flag.src = 'assets/flags/' + m.ownerIso2.toLowerCase() + '.png';
      $('track-selected').textContent = tracking ? 'إيقاف متابعة الحركة' : 'متابعة حركة القمر';
      $('track-selected').setAttribute('aria-pressed', String(tracking));
    }
    function show(object) {
      const card = $('globe-card');
      if (!object || !card) return false;
      card.hidden = false;
      return true;
    }
    function hide() {
      $('globe-card').hidden = true;
    }
    return Object.freeze({
      renderDetails,
      renderMetadata,
      syncFavorites,
      renderFloating,
      show,
      hide,
    });
  }
  const api = Object.freeze({ create });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SatelliteCard = api;
})(typeof window !== 'undefined' ? window : globalThis);
