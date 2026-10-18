(function (root) {
  'use strict';
  const C = root.CountryReportCore,
    $ = (id) => document.getElementById(id);
  let base = null,
    view = null,
    applied = null,
    locked = false,
    viewRevision = 0;
  const field = document.createElement('fieldset');
  field.id = 'report-builder';
  field.className = 'country-builder';
  field.innerHTML = `<legend>على أي معايير تبني التقرير؟</legend><p>ابدأ بالمعايير التي تهمك، ثم اختر البلد والفترة ومجموعة الأقمار أدناه. يمكن جمع عدة معايير.</p><label>التصنيف الرئيسي<select id="report-build-group"><option value="owner">الدولة أو الجهة المسجلة</option><option value="date">التاريخ المحلي</option><option value="mission">المهمة</option><option value="altitude">فئة ارتفاع الدخول</option><option value="time">ساعة الدخول المحلية</option></select></label><div class="builder-choices"><label><input id="report-build-owner-on" type="checkbox"> أقمار دول أو جهات محددة</label><label><input id="report-build-mission-on" type="checkbox"> مهمة أو مستوى توثيق محدد</label><label><input id="report-build-altitude-on" type="checkbox"> نطاق ارتفاع عند الدخول</label><label><input id="report-build-time-on" type="checkbox"> وقت دخول محلي محدد</label></div><div id="report-build-owner-fields" hidden><label>الدول والجهات المسجلة · يمكن اختيار أكثر من جهة<select id="report-build-owners" multiple size="5" aria-describedby="report-owner-help"></select></label><p id="report-owner-help" class="muted">على الكمبيوتر استخدم Ctrl أو ⌘ لاختيار جهات متعددة. قد تكون الجهة منظمة دولية مشتركة.</p></div><div id="report-build-mission-fields" class="builder-grid" hidden><label>كلمات في وصف المهمة أو اسم المنظومة<input id="report-build-mission" maxlength="150" placeholder="مثل ملاحة أو اتصالات أو رصد"></label><label>مستوى توثيق المهمة<select id="report-build-evidence"><option value="all">جميع المستويات</option><option value="documented">مهمة فردية موثقة</option><option value="program">غرض منظومة موثق</option><option value="category">تصنيف عام</option><option value="unknown">تفاصيل غير موثقة</option><option value="object-type">نوع الجسم مسجل</option></select></label></div><div id="report-build-altitude-fields" class="builder-grid" hidden><label>أقل ارتفاع عند الدخول · كم<input id="report-build-min" type="number" min="0" max="100000" value="0" step="any"></label><label>أعلى ارتفاع عند الدخول · كم<input id="report-build-max" type="number" min="0" max="100000" value="2000" step="any"></label></div><div id="report-build-time-fields" class="builder-grid" hidden><label>وقت الدخول من<input id="report-build-from" type="time" value="00:00"></label><label>وقت الدخول إلى<input id="report-build-to" type="time" value="23:59"></label><p class="muted">النافذة تتكرر لكل تاريخ بالتوقيت المختار أدناه، وتدعم عبور منتصف الليل. يُطبق الشرط على وقت الدخول المحسوب، بما فيه الدخول المحصور عند بداية الفترة والمميز بعلامة *.</p></div><p id="report-build-preview" role="status" class="muted"></p>`;
  $('report-form').prepend(field);
  const controls = document.createElement('section');
  controls.id = 'report-view-controls';
  controls.className = 'country-builder';
  controls.hidden = true;
  controls.innerHTML =
    '<h3>تضييق نتائج التقرير للطباعة والتنزيل</h3><p class="muted">هذه الخيارات تختار من النتائج المحسوبة. التصدير والطباعة وWord تتبع الاختيار الظاهر؛ غيّر معايير البداية وأعد الحساب لتوسيع النطاق.</p><div class="builder-grid"><label>الدولة أو الجهة<select id="report-view-owner"></select></label><label>تاريخ الدخول المحلي<select id="report-view-date"></select></label><label>القمر بالاسم أو رقم NORAD<input id="report-view-query" maxlength="150" placeholder="اتركه فارغًا لجميع الأقمار"></label></div><button id="report-view-apply" type="button">تطبيق الاختيار وتجهيز التقرير</button><button id="report-view-reset" type="button">عرض كل النتائج المحسوبة</button>';
  $('report-summary').before(controls);
  const host = document.createElement('section');
  host.id = 'report-comprehensive';
  $('report-summary').before(host);
  const ready = root.SatMetadata.load()
    .then(() => {
      const select = $('report-build-owners');
      for (const o of [
        ...root.SatMetadata.owners(),
        { code: 'unknown', label: 'الدولة أو الجهة غير متاحة' },
      ]) {
        const n = document.createElement('option');
        n.value = o.code;
        n.textContent = o.label;
        select.append(n);
      }
    })
    .catch(() => {
      $('report-build-preview').textContent =
        'تعذّر تحميل فهرس الجهات والمهام؛ أعد تحميل الصفحة لاستخدام هذه المعايير.';
    });
  function read() {
    const c = {
      group: $('report-build-group').value,
      ownerEnabled: $('report-build-owner-on').checked,
      owners: [...$('report-build-owners').selectedOptions].map((o) => o.value),
      ownerLabels: [...$('report-build-owners').selectedOptions].map(
        (o) => root.MadarI18n?.original(o) || o.textContent,
      ),
      missionEnabled: $('report-build-mission-on').checked,
      mission: $('report-build-mission').value.trim(),
      evidence: $('report-build-evidence').value,
      evidenceLabel:
        root.MadarI18n?.original($('report-build-evidence').selectedOptions[0]) ||
        $('report-build-evidence').selectedOptions[0].textContent,
      altitudeEnabled: $('report-build-altitude-on').checked,
      minAltitude: $('report-build-min').value === '' ? NaN : Number($('report-build-min').value),
      maxAltitude: $('report-build-max').value === '' ? NaN : Number($('report-build-max').value),
      timeEnabled: $('report-build-time-on').checked,
      from: $('report-build-from').value,
      to: $('report-build-to').value,
    };
    return C.validate(c);
  }
  function sync() {
    for (const name of ['owner', 'mission', 'altitude', 'time']) {
      const active = $('report-build-' + name + '-on').checked,
        box = $('report-build-' + name + '-fields');
      box.hidden = !active;
      for (const e of box.querySelectorAll('input,select')) e.disabled = locked || !active;
    }
    try {
      $('report-build-preview').textContent = C.criteriaText({ criteria: read() }).join(' · ');
    } catch (e) {
      $('report-build-preview').textContent = e.message;
    }
  }
  field.addEventListener('change', sync);
  field.addEventListener('input', sync);
  sync();
  function lock(v) {
    locked = v;
    for (const e of field.querySelectorAll('input,select')) e.disabled = v;
    for (const e of controls.querySelectorAll('input,select,button')) e.disabled = v;
    sync();
  }
  function option(select, value, label) {
    const n = document.createElement('option');
    n.value = value;
    n.textContent = label;
    select.append(n);
  }
  function selection() {
    return {
      owner: $('report-view-owner').value,
      ownerLabel:
        root.MadarI18n?.original($('report-view-owner').selectedOptions[0]) ||
        $('report-view-owner').selectedOptions[0]?.textContent ||
        'جميع الجهات',
      date: $('report-view-date').value,
      query: $('report-view-query').value.trim(),
    };
  }
  function ensure(r) {
    if (base === r) return;
    base = r;
    const owners = $('report-view-owner'),
      dates = $('report-view-date');
    owners.replaceChildren();
    dates.replaceChildren();
    option(owners, '', 'جميع الجهات');
    option(dates, '', 'جميع التواريخ');
    const ownerMap = new Map(),
      dateSet = new Set();
    for (const p of r.result.rows) {
      ownerMap.set(p.metadata?.ownerCode || 'unknown', p.metadata?.country || 'غير متاح');
      dateSet.add(C.date(p.entry, r.offset));
    }
    for (const [code, label] of [...ownerMap].sort((a, b) => a[1].localeCompare(b[1], 'ar')))
      option(owners, code, label);
    for (const d of [...dateSet].sort()) option(dates, d, d);
    owners.closest('label').hidden = ownerMap.size < 2;
    dates.closest('label').hidden = dateSet.size < 2;
    $('report-view-query').closest('label').hidden =
      new Set(r.result.rows.map((p) => p.id)).size < 2;
    const s = r.savedView || {};
    owners.value = [...owners.options].some((o) => o.value === s.owner) ? s.owner || '' : '';
    dates.value = [...dates.options].some((o) => o.value === s.date) ? s.date || '' : '';
    $('report-view-query').value = s.query || '';
    applied = selection();
  }
  function current(r) {
    if (!r?.criteria) return r;
    ensure(r);
    const s = applied,
      query = CatalogSearch.compile(s.query),
      rows = r.result.rows
        .filter(
          (p) =>
            (!s.owner || (p.metadata?.ownerCode || 'unknown') === s.owner) &&
            (!s.date || C.date(p.entry, r.offset) === s.date) &&
            (!s.query || query(p, { program: p.metadata?.program || '' })),
        )
        .sort(
          (a, b) =>
            C.key(a, r.criteria.group, r.offset).localeCompare(
              C.key(b, r.criteria.group, r.offset),
              'ar',
              { numeric: true },
            ) ||
            a.entry - b.entry ||
            a.id - b.id,
        );
    view = {
      ...r,
      selection: s,
      result: { ...r.result, rows, unique: new Set(rows.map((p) => p.id)).size },
    };
    return view;
  }
  function text(tag, value, parent = host) {
    const e = document.createElement(tag);
    e.textContent = value;
    parent.append(e);
    return e;
  }
  function table(title, headers, rows, passes, report) {
    const details = document.createElement('details');
    details.open = true;
    text('summary', title, details);
    const wrap = document.createElement('div');
    wrap.className = 'report-table-wrap';
    const t = document.createElement('table');
    t.className = 'analysis-table';
    for (const [i, row] of [headers, ...rows].entries()) {
      const tr = document.createElement('tr');
      for (const v of row) text(i ? 'td' : 'th', v, tr);
      if (i && passes?.[i - 1]) tr.firstElementChild.append(PassMap.button(passes[i - 1], report));
      t.append(tr);
    }
    wrap.append(t);
    details.append(wrap);
    host.append(details);
  }
  function render(r) {
    if (!r?.criteria) {
      controls.hidden = true;
      host.replaceChildren();
      return r;
    }
    ensure(r);
    const v = current(r);
    controls.hidden = ![...controls.querySelectorAll('label')].some((n) => !n.hidden);
    host.replaceChildren();
    text('h2', 'التقرير الشامل · ' + v.countryName);
    for (const line of C.summaryLines(v)) text('p', line);
    const grouped = C.groups(v.result.rows, v.criteria.group, v.offset);
    table(
      'التصنيف حسب ' + C.GROUPS[v.criteria.group],
      ['التصنيف', 'عدد الأقمار', 'حالات المرور', 'دقائق الوجود دون تداخل'],
      grouped.map((g) => [g.label, g.satellites, g.passes, (g.seconds / 60).toFixed(1)]),
    );
    if (v.criteria.group !== 'date')
      table(
        'التصنيف حسب التاريخ المحلي',
        ['التاريخ', 'الأقمار', 'حالات المرور', 'دقائق الوجود دون تداخل'],
        C.groups(v.result.rows, 'date', v.offset).map((g) => [
          g.label,
          g.satellites,
          g.passes,
          (g.seconds / 60).toFixed(1),
        ]),
      );
    const satellites = C.satelliteTable(v);
    table(
      'قائمة الأقمار الموجزة · ' + (satellites.length - 1) + ' قمرًا',
      satellites[0],
      satellites.slice(1, 1001),
    );
    if (satellites.length > 1001) text('p', 'تظهر أول 1000 هوية هنا؛ التصدير يتضمن جميع النتائج.');
    const pass = C.passTable(v);
    table(
      'تفاصيل الحركة والمسار · أول ' + Math.min(1000, v.result.rows.length) + ' حالة',
      pass[0],
      pass.slice(1, 1001),
      v.result.rows.slice(0, 1000),
      v,
    );
    text(
      'p',
      'الخريطة أدناه تعرض أول 40 حالة والخط الزمني أول 12؛ جميع المسارات متاحة بإحداثياتها في CSV ولقطة النتائج.',
    );
    return v;
  }
  function clear() {
    base = null;
    view = null;
    applied = null;
    controls.hidden = true;
    host.replaceChildren();
  }
  async function applyView(reset) {
    if (!base || reportBusy) return;
    if (reset) {
      $('report-view-owner').value = '';
      $('report-view-date').value = '';
      $('report-view-query').value = '';
    }
    const report = base,
      active = reportToken,
      revision = ++viewRevision;
    applied = selection();
    report.savedView = applied;
    clearReportDownload();
    renderReport(report);
    toggleReportBusy(false);
    await root.StateStore?.put('report-result', report);
    if (active !== reportToken || base !== report || revision !== viewRevision) return;
    await prepareReportDownload();
  }
  $('report-view-apply').onclick = () => applyView(false);
  $('report-view-reset').onclick = () => applyView(true);
  const ids = [...field.querySelectorAll('input,select')].map((e) => e.id);
  function capture() {
    const data = {};
    for (const id of ids) {
      const e = $(id);
      data[id] =
        e.type === 'checkbox'
          ? e.checked
          : e.multiple
            ? [...e.selectedOptions].map((o) => o.value)
            : e.value;
    }
    return data;
  }
  async function restore(data) {
    if (!data) return;
    await ready;
    for (const id of ids) {
      if (!(id in data)) continue;
      const e = $(id);
      if (e.type === 'checkbox') e.checked = data[id] === true;
      else if (e.multiple)
        for (const o of e.options)
          o.selected = Array.isArray(data[id]) && data[id].includes(o.value);
      else e.value = data[id];
    }
    sync();
  }
  root.CountryReportBuilder = { read, ready, lock, current, render, clear, capture, restore };
})(window);
