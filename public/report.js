'use strict';
let reportCountries = [],
  reportWorker = null,
  finishedReport = null,
  reportBusy = false,
  reportToken = 0,
  reportDownloadUrl = null,
  wordGeneration = 0;
const reportEl = (id) => document.getElementById(id);
function reportDate(ds, ts, offset) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ds) || !/^\d{2}:\d{2}(:\d{2})?$/.test(ts))
    throw Error('أدخل تاريخًا ووقتًا صحيحين.');
  const [h, m, s = 0] = ts.split(':').map(Number);
  if (h > 23 || m > 59 || s > 59) throw Error('الوقت غير صالح.');
  const date = new Date(ds + 'T00:00:00Z');
  if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== ds)
    throw Error('التاريخ غير صالح.');
  return +date + (h - offset) * 3600000 + m * 60000 + s * 1000;
}
function reportDay() {
  const d = new Date(reportEl('report-start-date').value + 'T12:00:00Z');
  reportEl('report-day').textContent = Number.isFinite(+d)
    ? new Intl.DateTimeFormat('ar-SA', { weekday: 'long', timeZone: 'UTC' }).format(d)
    : '';
}
function toggleReportBusy(v) {
  window.CountryReportBuilder?.lock(v);
  window.TypePicker?.lock('report', v);
  reportBusy = v;
  reportEl('report-run').disabled = v;
  reportEl('report-cancel').disabled = !v;
  reportEl('report-word').disabled = v || !finishedReport;
  for (const id of [
    'report-country',
    'report-start-date',
    'report-start-time',
    'report-end-date',
    'report-end-time',
    'report-zone',
    'report-scope',
    'report-step',
  ])
    reportEl(id).disabled = v;
}
async function initReport() {
  const now = new Date(Date.now() + 3 * 3600000),
    later = new Date(+now + 3600000);
  for (const [prefix, d] of [
    ['start', now],
    ['end', later],
  ]) {
    reportEl('report-' + prefix + '-date').value = d.toISOString().slice(0, 10);
    reportEl('report-' + prefix + '-time').value = d.toISOString().slice(11, 19);
  }
  reportDay();
  reportEl('report-start-date').onchange = reportDay;
  reportEl('report-run').disabled = true;
  try {
    const r = await fetch('data/countries.json');
    if (!r.ok) throw Error();
    const geo = await r.json(),
      names = new Intl.DisplayNames(['ar'], { type: 'region' });
    reportCountries = geo.features
      .map((f) => ({
        ...f,
        displayName: f.properties.iso2 ? names.of(f.properties.iso2) : f.properties.name,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ar'));
    const select = reportEl('report-country');
    select.replaceChildren();
    for (const f of reportCountries) {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.displayName;
      select.append(opt);
    }
    select.value = '682';
    select.onchange = () => {
      const c = reportCountries.find((f) => f.id === select.value);
      if (world && c) {
        world
          .polygonsData([c])
          .polygonCapColor(() => '#76e3d218')
          .polygonSideColor(() => '#76e3d233')
          .polygonStrokeColor(() => '#76e3d2')
          .polygonAltitude(0.002);
      }
    };
    select.onchange();
    if (window.CustomEvent) document.dispatchEvent(new window.CustomEvent('countries-ready'));
    reportEl('report-run').disabled = false;
  } catch {
    reportEl('report-status').textContent =
      'تعذّر تحميل حدود البلدان. حدّث الصفحة لإعادة المحاولة.';
  }
}
reportEl('report-form').onsubmit = async (e) => {
  e.preventDefault();
  if (reportBusy) return;
  const token = ++reportToken;
  toggleReportBusy(true);
  try {
    await window.SatMetadata?.load().catch(() => null);
    await window.CountryReportBuilder?.ready;
    if (token !== reportToken) return;
    const criteria = window.CountryReportBuilder?.read();
    const offset = Number(reportEl('report-zone').value),
      start = reportDate(
        reportEl('report-start-date').value,
        reportEl('report-start-time').value,
        offset,
      ),
      end = reportDate(
        reportEl('report-end-date').value,
        reportEl('report-end-time').value,
        offset,
      );
    if (end <= start) throw Error('نهاية الفترة يجب أن تكون بعد بدايتها.');
    if (end - start > 7 * 86400000)
      throw Error('الحد الأقصى للتقرير الشامل 7 أيام. قسّم الفترة الأطول إلى تقارير مستقلة.');
    const country = reportCountries.find((f) => f.id === reportEl('report-country').value);
    if (!country) throw Error('اختر البلد.');
    const scope = reportEl('report-scope').value,
      step = Number(reportEl('report-step').value);
    finishedReport = null;
    window.CountryReportBuilder?.clear();
    window.StateStore?.remove('report-result');
    clearReportDownload();
    toggleReportBusy(true);
    reportEl('report-progress').value = 0;
    reportEl('report-table').hidden = true;
    reportEl('report-summary').textContent = '';
    reportEl('report-status').textContent = 'جارٍ تجهيز الأقمار والحدود…';
    let data;
    if (scope === 'types') data = await TypePicker.load('report');
    else if (scope === 'active') data = await loadGlobalCatalog();
    else if (['military', 'intelligence'].includes(scope)) data = await fetchCatalogGroup(scope);
    else if (scope === 'fleet') data = window.MapFleet?.objects() || [];
    else data = scope === 'favorites' ? watchlist.items : objects;
    if (data.failed?.length)
      throw Error('تعذّر تحميل بعض أنواع المجموعة الحالية: ' + data.failed.join('، '));
    if (!data.length) throw Error('قائمة الأقمار المختارة فارغة.');
    const scopeCount = data.length,
      metadataSnapshot = {};
    if (criteria) {
      const filtered = data.filter((o) => {
        const m = window.SatMetadata?.get(o.id);
        if (!CountryReportCore.metadataMatches(m, criteria)) return false;
        metadataSnapshot[o.id] = m;
        return true;
      });
      data = Object.assign(filtered, {
        derived: data.derived,
        failed: data.failed,
        source: data.source,
        note: data.note,
      });
      if (!data.length)
        throw Error(
          'لا توجد أقمار تطابق الدولة أو المهمة المختارة ضمن مجموعة الفحص؛ وسّع المعايير أو غيّر المجموعة.',
        );
      CountryReportCore.checkBudget(data.length, start, end, step);
    }
    if (!reportBusy || token !== reportToken) return;
    const request = {
      countryName: country.displayName,
      country,
      start,
      end,
      offset,
      step,
      zoneLabel: offset === 3 ? 'الرياض UTC+03:00' : 'UTC',
      scopeName:
        scope === 'types'
          ? TypePicker.name(TypePicker.selected('report'))
          : scope === 'group' && window.TypePicker?.selected('catalog').length
            ? TypePicker.name(TypePicker.selected('catalog'))
            : scope === 'active'
              ? 'جميع الأقمار النشطة'
              : scope === 'favorites'
                ? 'المفضلة'
                : scope === 'fleet'
                  ? 'مجموعة الخريطة · حتى 12 قمرًا'
                  : scope === 'military'
                    ? 'العسكرية والاستطلاع العلنية'
                    : scope === 'intelligence'
                      ? 'الاستخبارية والاستطلاع الموثقة'
                      : window.MadarI18n?.original(reportEl('group').selectedOptions[0]) ||
                        reportEl('group').selectedOptions[0].textContent,
      day: window.MadarI18n?.original(reportEl('report-day')) || reportEl('report-day').textContent,
    };
    if (criteria) {
      request.criteria = criteria;
      request.metadataSnapshot = metadataSnapshot;
      request.scopeCount = scopeCount;
    }
    request.scopeName = TypePicker.describe(data, request.scopeName);
    request.archive = await ReportArchive.capture(
      criteria ? 'country-comprehensive' : 'country',
      data,
      request,
    );
    if (token !== reportToken || !reportBusy) return;
    await window.StateStore?.put('report-pending', {
      request,
      data: data.map(OrbitData.serialize),
    });
    if (token !== reportToken || !reportBusy) return;
    window.DraftState?.save();
    startReportWorker(request, data);
  } catch (err) {
    if (token !== reportToken) return;
    reportEl('report-status').textContent = err.message;
    toggleReportBusy(false);
  }
};
reportEl('report-cancel').onclick = () => {
  reportToken++;
  window.StateStore?.remove('report-pending');
  clearReportDownload();
  reportWorker?.terminate();
  reportWorker = null;
  reportBusy = false;
  finishedReport = null;
  toggleReportBusy(false);
  reportEl('report-status').textContent = 'تم إلغاء الحساب. لم يُنشأ تقرير نهائي.';
};
function renderReport(r) {
  r = window.CountryReportBuilder?.render(r) || r;
  const { stamp, duration } = ReportDocument;
  ReportInsights.render(reportEl('report-summary'), r, r.country, r.offset, stamp, duration);
  ReportExports.attach('report', r);
  const body = reportEl('report-rows');
  body.replaceChildren();
  for (const row of r.result.rows.slice(0, 1000)) {
    const tr = document.createElement('tr');
    for (const value of [
      row.name,
      row.id,
      row.metadata?.country || 'غير متاح',
      row.metadata?.missionLabel || 'غير متاح',
      stamp(row.entry, r.offset) + (row.clippedStart ? ' *' : ''),
      stamp(row.exit, r.offset) + (row.clippedEnd ? ' *' : ''),
      duration(row.duration),
      row.height === null ? '—' : row.height.toFixed(1) + ' km',
      stamp(row.epoch, 0),
    ]) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    body.append(tr);
  }
  reportEl('report-table').hidden = !!r.criteria || !r.result.rows.length;
  reportEl('report-status').textContent =
    (r.result.rows.length > 1000
      ? 'معروض أول 1,000 حالة؛ ملف Word يتضمن كل النتائج. '
      : 'اكتمل التقرير. ') +
    (r.result.rows.length
      ? '* وقت محصور ضمن حدود الفترة، وقد بدأ المرور قبلها أو استمر بعدها.'
      : 'لم تُكتشف حالات في العينة؛ لا يعني ذلك تأكيد عدم المرور.');
}
function clearReportDownload() {
  window.ReportExports?.clear('report');
  wordGeneration++;
  window.WordDelivery?.clear('report');
  if (reportDownloadUrl) URL.revokeObjectURL(reportDownloadUrl);
  reportDownloadUrl = null;
  const a = reportEl('report-download');
  a.hidden = true;
  a.removeAttribute('href');
  reportEl('report-word').hidden = false;
}
async function prepareReportDownload() {
  if (!finishedReport) return;
  const generation = ++wordGeneration,
    report = window.CountryReportBuilder?.current(finishedReport) || finishedReport,
    b = reportEl('report-word');
  b.disabled = true;
  b.textContent = 'جارٍ تجهيز Word…';
  try {
    await window.WordDelivery.library();
    report.brandBytes = await ReportLayout.brand();
    if (generation !== wordGeneration) return;
    if (ReportLayout.mode('report') !== 'brief') {
      await window.FlagAssets?.enrich(report);
      if (generation !== wordGeneration) return;
      report.visuals = ReportInsights.visuals(
        report,
        report.country,
        report.offset,
        ReportDocument.stamp,
      );
    }
    const doc = ReportDocument.createReport(window.docx, report),
      blob = await window.docx.Packer.toBlob(doc);
    if (generation !== wordGeneration) return;
    if (!blob || blob.size === 0) throw Error('لم يتم توليد ملف Word صالح.');
    if (reportDownloadUrl) URL.revokeObjectURL(reportDownloadUrl);
    reportDownloadUrl = URL.createObjectURL(blob);
    const a = reportEl('report-download');
    a.href = reportDownloadUrl;
    a.download =
      'satellite-report-' +
      report.country.id +
      '-' +
      new Date(report.start).toISOString().slice(0, 10) +
      (ReportLayout.mode('report') === 'brief' ? '-brief' : '') +
      '.docx';
    await window.WordDelivery?.attach('report', blob, a.download);
    if (generation !== wordGeneration) return;
    a.hidden = false;
    b.hidden = true;
    reportEl('report-status').textContent =
      'Word جاهز. على iPhone اضغط «حفظ أو مشاركة Word» ثم «حفظ في الملفات» أو اختر رابط التنزيل.';
  } catch (err) {
    if (generation !== wordGeneration) return;
    reportEl('report-status').textContent = 'تعذّر تجهيز Word: ' + err.message;
    b.disabled = false;
    b.hidden = false;
  } finally {
    if (generation === wordGeneration) {
      b.disabled = false;
      b.textContent = 'إعادة تجهيز ملف Word';
    }
  }
}
reportEl('report-word').onclick = prepareReportDownload;
reportEl('report-download').onclick = (e) => {
  if (!reportDownloadUrl) {
    e.preventDefault();
    return;
  }
  reportEl('report-status').textContent =
    'إذا لم يبدأ الحفظ، افتح رابط الملف في متصفح الجهاز واختر حفظ أو مشاركة الملف.';
};
initReport();

function startReportWorker(request, data, resume = null) {
  const activeToken = reportToken;
  const pending = { request, data: data.map(OrbitData.serialize), checkpoint: resume };
  reportWorker = new Worker('report-worker.js?v=43');
  reportWorker.onmessage = (ev) => {
    if (activeToken !== reportToken) return;
    const msg = ev.data;
    if (msg.type === 'progress') {
      if (msg.checkpoint) {
        pending.checkpoint = msg.checkpoint;
        window.StateStore?.put('report-pending', pending);
      }
      reportEl('report-progress').value = Math.round((msg.done / msg.total) * 100);
      reportEl('report-status').textContent =
        'فحص ' + msg.done + ' من ' + msg.total + ' قمر · ' + msg.passes + ' حالة مرور';
    } else if (msg.type === 'done') {
      msg.result.rows = msg.result.rows.map((row) => ({
        ...row,
        metadata: request.metadataSnapshot?.[row.id] || window.SatMetadata?.get(row.id),
      }));
      finishedReport = request.criteria
        ? CountryReportCore.apply({ ...request, result: msg.result }, request.criteria)
        : { ...request, result: msg.result };
      window.StateStore?.put('report-result', finishedReport);
      window.StateStore?.remove('report-pending');
      reportEl('report-progress').value = 100;
      reportEl('report-status').textContent = 'اكتمل التقرير التقديري.';
      renderReport(finishedReport);
      reportWorker.terminate();
      reportWorker = null;
      toggleReportBusy(false);
      prepareReportDownload();
    } else {
      reportEl('report-status').textContent = 'تعذّر الحساب: ' + msg.message;
      reportWorker.terminate();
      reportWorker = null;
      toggleReportBusy(false);
    }
  };
  reportWorker.onerror = () => {
    reportEl('report-status').textContent =
      'تعذّر تشغيل الحساب. جرّب تقليل مجموعة الأقمار أو إعادة تحميل الصفحة.';
    reportWorker?.terminate();
    reportWorker = null;
    toggleReportBusy(false);
  };
  reportWorker.postMessage({
    objects: data.map(OrbitData.serialize),
    country: request.country,
    start: request.start,
    end: request.end,
    step: request.step * 1000,
    resume,
    details: !!request.criteria,
  });
}
function resumeReport(pending) {
  if (reportBusy) return;
  reportToken++;
  finishedReport = null;
  window.StateStore?.remove('report-result');
  clearReportDownload();
  toggleReportBusy(true);
  reportEl('report-panel').open = true;
  reportEl('report-resume').hidden = true;
  reportEl('report-status').textContent = 'جارٍ استئناف البحث المحفوظ…';
  startReportWorker(pending.request, pending.data, pending.checkpoint);
}

reportEl('report-types').addEventListener('change', (e) => {
  if (e.target.matches('input[type=checkbox]')) {
    reportEl('report-scope').value = 'types';
    TypePicker.sync('report');
  }
});

document.addEventListener('madar-language', () => {
  if (!finishedReport || reportBusy) return;
  clearReportDownload();
  renderReport(finishedReport);
  prepareReportDownload();
});
