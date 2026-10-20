(function (root) {
  'use strict';
  let worker = null,
    wordTask = null,
    result = null,
    token = 0,
    url = null;
  const e = (id) => document.getElementById('observer-' + id);
  ObserverSites.mount(e('form'), {
    prefix: 'observer',
    nameInput: e('name'),
    read: () => ({
      lat: e('lat').value,
      lon: e('lon').value,
      height: e('height').value,
      minElevation: e('elevation').value,
      zone: e('zone').value,
    }),
    apply: (site) => {
      for (const [key, value] of Object.entries({
        lat: site.lat,
        lon: site.lon,
        height: site.height,
        elevation: site.minElevation,
        zone: site.zone,
      })) {
        e(key).value = value;
        e(key).dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
  });
  function busy(v) {
    e('form').setAttribute('aria-busy', String(v));
    for (const n of e('form').querySelectorAll('input,select,button')) n.disabled = v;
    TypePicker.lock('observer', v);
    e('cancel').disabled = !v;
  }
  function clear() {
    StateStore.remove('observer-result');
    token++;
    wordTask?.cancel();
    wordTask = null;
    worker?.terminate();
    worker = null;
    result = null;
    ReportExports.clear('observer');
    WordDelivery.clear('observer');
    e('results').replaceChildren();
    e('progress').value = 0;
    e('download').hidden = true;
    e('word').disabled = true;
    if (url) URL.revokeObjectURL(url);
    url = null;
  }
  function render(r) {
    result = r;
    e('results').replaceChildren();
    ReportLayout.render(e('results'), r);
    for (const text of ObserverReport.lines(r).slice(4)) {
      const p = document.createElement('p');
      p.textContent = text;
      (e('results').querySelector('.report-brief-details') || e('results')).append(p);
    }
    const wrap = document.createElement('div');
    wrap.className = 'report-table-wrap';
    const t = document.createElement('table');
    t.className = 'analysis-table';
    for (const [i, row] of ObserverReport.rows(r).entries()) {
      const tr = document.createElement('tr');
      for (const value of row) {
        const td = document.createElement(i ? 'td' : 'th');
        td.textContent = String(value);
        tr.append(td);
      }
      if (i) tr.firstElementChild.append(PassMap.button(r.result.rows[i - 1], r));
      t.append(tr);
    }
    wrap.append(t);
    e('results').append(wrap);
    ReportExports.attach('observer', r);
    e('word').disabled = false;
  }
  e('form').onsubmit = async (ev) => {
    ev.preventDefault();
    if (worker) return;
    clear();
    const active = token;
    busy(true);
    e('progress').removeAttribute('value');
    e('status').textContent = 'جارٍ تجهيز بيانات التقرير…';
    try {
      const scope = e('scope').value,
        offset = Number(e('zone').value),
        start = reportDate(e('date').value, e('start').value, offset),
        end = reportDate(e('date').value, e('end').value, offset) + (e('next').checked ? 864e5 : 0),
        request = {
          observer: {
            name: e('name').value.trim() || 'موقع الرصد',
            lat: Number(e('lat').value),
            lon: Number(e('lon').value),
            height: Number(e('height').value),
            minElevation: Number(e('elevation').value),
          },
          start,
          end,
          offset,
          zoneLabel: offset === 3 ? 'الرياض UTC+03:00' : 'UTC',
          step: 10,
          scopeName:
            scope === 'types'
              ? TypePicker.name(TypePicker.selected('observer'))
              : scope === 'group'
                ? TypePicker.selected('catalog').length
                  ? TypePicker.name(TypePicker.selected('catalog'))
                  : root.MadarI18n.original(document.getElementById('group').selectedOptions[0])
                : root.MadarI18n.original(e('scope').selectedOptions[0]),
        };
      ObserverEngine.validate(request);
      let data;
      if (scope === 'types') data = await TypePicker.load('observer');
      else if (scope === 'active') data = await loadGlobalCatalog();
      else if (['military', 'intelligence'].includes(scope)) data = await fetchCatalogGroup(scope);
      else if (scope === 'selected') data = [selection.current].filter(Boolean);
      else if (scope === 'fleet') data = root.MapFleet?.objects() || [];
      else data = scope === 'favorites' ? watchlist.items.slice() : objects;
      if (active !== token) return;
      if (data.failed?.length)
        throw Error('تعذّر تحميل بعض أنواع المجموعة الحالية: ' + data.failed.join('، '));
      if (!data.length) throw Error('قائمة الأقمار المختارة فارغة.');
      request.scopeName = TypePicker.describe(data, request.scopeName);
      request.archive = await ReportArchive.capture('observer', data, request);
      if (active !== token) return;
      worker = new Worker('observer-worker.js?v=43');
      worker.onmessage = async (ev) => {
        if (active !== token) return;
        const m = ev.data;
        if (m.type === 'progress') {
          e('progress').value = m.total ? Math.round((m.done / m.total) * 100) : 0;
          e('status').textContent = 'فحص ' + m.done + ' من ' + m.total;
        } else {
          worker.terminate();
          worker = null;
          busy(false);
          if (m.type === 'error') {
            e('progress').value = 0;
            e('status').textContent = m.message;
            return;
          }
          e('progress').value = 100;
          const r = { ...request, result: m.result };
          render(r);
          await StateStore.put('observer-result', r);
          e('status').textContent = 'اكتمل حساب المرور الهندسي. يمكنك تنزيل النتائج أو تجهيز Word.';
        }
      };
      worker.onerror = () => {
        if (active !== token) return;
        worker?.terminate();
        worker = null;
        busy(false);
        e('progress').value = 0;
        e('status').textContent = 'تعذّر تشغيل الحساب. حاول مرة أخرى.';
      };
      e('status').textContent = 'جارٍ حساب المرور من الموقع…';
      worker.postMessage({ objects: data.map(OrbitData.serialize), request });
    } catch (err) {
      if (active === token) {
        busy(false);
        e('progress').value = 0;
        e('status').textContent = err.message;
      }
    }
  };
  e('cancel').onclick = () => {
    if (wordTask) {
      token++;
      wordTask.cancel();
      wordTask = null;
      busy(false);
      e('word').disabled = false;
      e('status').textContent = 'أُلغي تجهيز Word. يبقى التقرير متاحًا.';
      return;
    }
    clear();
    busy(false);
    e('status').textContent = 'أُلغي الحساب؛ لم يُنشأ تقرير نهائي.';
  };
  e('word').onclick = async () => {
    if (!result) return;
    const r = result,
      active = token;
    e('word').disabled = true;
    try {
      let blob,
        extension = 'docx';
      if (r.result.rows.length > 500 && ReportLayout.mode('observer') !== 'brief') {
        busy(true);
        e('download').hidden = true;
        WordDelivery.clear('observer');
        e('status').textContent = 'جارٍ تجهيز Word في الخلفية…';
        wordTask = root.ObserverWord.start(r, (done) => {
          if (active === token)
            e('status').textContent = 'Word: ' + done + ' / ' + r.result.rows.length;
        });
        ({ blob, extension } = await wordTask.promise);
      } else {
        await WordDelivery.library();
        r.brandBytes = await ReportLayout.brand();
        if (active !== token) return;
        blob = await docx.Packer.toBlob(ObserverReport.create(docx, r));
      }
      if (active !== token) return;
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      e('download').href = url;
      e('download').download =
        r.archive.id +
        (ReportLayout.mode('observer') === 'brief' ? '-brief' : '') +
        '.' +
        extension;
      e('download').hidden = false;
      await WordDelivery.attach('observer', blob, e('download').download);
      e('status').textContent =
        extension === 'zip'
          ? 'حزمة Word جاهزة؛ تشمل جميع حالات المرور، بحد أقصى 500 حالة في كل جزء.'
          : 'Word جاهز للتنزيل أو المشاركة.';
    } catch (err) {
      if (active === token) e('status').textContent = err.message;
    } finally {
      if (active === token) {
        wordTask = null;
        busy(false);
        e('word').disabled = false;
      }
    }
  };
  const now = new Date(Date.now() + 3 * 36e5);
  e('date').value = now.toISOString().slice(0, 10);
  e('start').value = now.toISOString().slice(11, 19);
  const end = new Date(+now + 36e5);
  e('end').value = end.toISOString().slice(11, 19);
  e('next').checked = end.toISOString().slice(0, 10) !== now.toISOString().slice(0, 10);
  StateStore.get('observer-result')
    .then((r) => {
      if (r && !result && !worker && token === 0) {
        render(r);
        e('status').textContent =
          'تقرير موقع محفوظ؛ الأوقات والإحداثيات المعروضة تخص التقرير المحفوظ. أدخل بيانات الموقع لإجراء حساب جديد.';
      }
    })
    .catch(() => {});
  document.addEventListener('madar-language', () => {
    if (!result || worker) return;
    token++;
    wordTask?.cancel();
    wordTask = null;
    busy(false);
    WordDelivery.clear('observer');
    if (url) URL.revokeObjectURL(url);
    url = null;
    e('download').hidden = true;
    e('download').removeAttribute('href');
    render(result);
    e('status').textContent = 'تغيّرت اللغة؛ جهّز Word للحصول على نسخة باللغة المختارة.';
  });
  root.ObserverUI = {
    render,
    clear,
    invalidateWord() {
      token++;
      wordTask?.cancel();
      wordTask = null;
      busy(false);
      WordDelivery.clear('observer');
      if (url) URL.revokeObjectURL(url);
      url = null;
      e('download').hidden = true;
      e('download').removeAttribute('href');
      e('word').disabled = false;
      e('status').textContent = 'تغيّر محتوى التصدير؛ جهّز Word للنسخة المختارة.';
    },
    get result() {
      return result;
    },
  };
})(window);
