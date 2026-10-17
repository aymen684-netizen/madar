(function (root) {
  'use strict';
  const MAX_BYTES = 20 * 1024 * 1024,
    MAX_ITEMS = 20000;
  function record(row) {
    if (
      !row ||
      typeof row !== 'object' ||
      Array.isArray(row) ||
      !Number.isSafeInteger(row.id) ||
      row.id < 1 ||
      row.id > 999999999 ||
      typeof row.name !== 'string' ||
      !row.name.trim() ||
      row.name.length > 160 ||
      /[\u0000-\u001f\u007f]/.test(row.name)
    )
      throw Error('سجل قمر غير صالح');
    const provenance = { mode: 'imported', fetchedAt: null };
    if (row.omm) {
      if (
        typeof row.omm !== 'object' ||
        Array.isArray(row.omm) ||
        row.omm.NORAD_CAT_ID !== row.id ||
        [
          'MEAN_MOTION',
          'ECCENTRICITY',
          'INCLINATION',
          'RA_OF_ASC_NODE',
          'ARG_OF_PERICENTER',
          'MEAN_ANOMALY',
          'BSTAR',
          'MEAN_MOTION_DOT',
          'MEAN_MOTION_DDOT',
        ].some((k) => typeof row.omm[k] !== 'number' || !Number.isFinite(row.omm[k]))
      )
        throw Error('حقول OMM غير صالحة');
      if (row.l1 != null || row.l2 != null) throw Error('صيغ مدارية متعارضة');
      const item = OrbitData.fromOmm(row.omm, provenance);
      if (item.id !== row.id || item.name !== row.name) throw Error('هوية السجل لا تطابق عناصره');
      return item;
    }
    if (
      typeof row.l1 !== 'string' ||
      typeof row.l2 !== 'string' ||
      !/^1 [ A-Z0-9.+-]{67}$/.test(row.l1) ||
      !/^2 [ A-Z0-9.+-]{67}$/.test(row.l2) ||
      !OrbitData.valid(row)
    )
      throw Error('عناصر TLE غير صالحة');
    return {
      id: row.id,
      name: row.name,
      l1: row.l1,
      l2: row.l2,
      provenance: { ...provenance, format: 'TLE' },
    };
  }
  function checkedText(text) {
    if (
      typeof text !== 'string' ||
      text.length > MAX_BYTES ||
      new TextEncoder().encode(text).length > MAX_BYTES
    )
      throw Error('حجم الملف يتجاوز 20 ميغابايت');
    return text;
  }
  function read(text) {
    checkedText(text);
    let file;
    try {
      file = JSON.parse(text);
    } catch {
      throw Error('تعذّر قراءة الملف؛ اختر نسخة متابعة بصيغة JSON من مدار.');
    }
    if (
      !file ||
      file.format !== 'madar-watchlist' ||
      file.version !== 1 ||
      !Array.isArray(file.items)
    )
      throw Error('هذا الملف ليس نسخة متابعة مدعومة من مدار.');
    if (file.items.length > MAX_ITEMS) throw Error('النسخة تتجاوز الحد المسموح: 20,000 سجل.');
    const valid = [];
    let rejected = 0;
    for (const row of file.items)
      try {
        valid.push(record(row));
      } catch {
        rejected++;
      }
    const items = OrbitData.merge([valid]);
    if (!items.length) throw Error('لا توجد سجلات مدارية صالحة لاستعادتها.');
    return { items, rejected, duplicates: valid.length - items.length, total: file.items.length };
  }
  function pack(items, time = new Date()) {
    if (!items.length) throw Error('قائمة المتابعة فارغة.');
    if (items.length > MAX_ITEMS) throw Error('القائمة تتجاوز 20,000 سجل.');
    const clean = OrbitData.merge([items.map(record)]).map((o) => {
      const row = OrbitData.serialize(o);
      delete row.provenance;
      return row;
    });
    return checkedText(
      JSON.stringify(
        { format: 'madar-watchlist', version: 1, exportedAt: time.toISOString(), items: clean },
        null,
        2,
      ),
    );
  }
  function plan(current, incoming) {
    const existing = new Map(current.map((o) => [Number(o.id), o]));
    let added = 0,
      updated = 0,
      kept = 0;
    for (const row of incoming) {
      const old = existing.get(row.id);
      if (!old) added++;
      else if (OrbitData.epoch(row) > OrbitData.epoch(old)) updated++;
      else kept++;
    }
    return {
      items: OrbitData.merge([
        current.map((o) => ({ ...OrbitData.serialize(o), id: Number(o.id) })),
        incoming,
      ]),
      added,
      updated,
      kept,
    };
  }
  const api = { read, pack, plan, maxBytes: MAX_BYTES, maxItems: MAX_ITEMS };
  if (typeof module !== 'undefined') module.exports = api;
  else root.WatchlistBackup = api;
  if (typeof document === 'undefined') return;
  const $ = (id) => document.getElementById(id),
    status = $('watchlist-status'),
    fileInput = $('watchlist-file');
  let staged = null,
    token = 0,
    busy = false,
    ready = false,
    url = null,
    exportSnapshot = null;
  function clearDownload() {
    if (url) URL.revokeObjectURL(url);
    url = null;
    exportSnapshot = null;
    $('watchlist-download').hidden = true;
    $('watchlist-download').removeAttribute('href');
  }
  function preview() {
    if (!staged) return;
    const p = plan(watchlist.items, staged.items);
    $('watchlist-preview-text').textContent =
      staged.items.length +
      ' قمرًا صالحًا · جديد: ' +
      p.added +
      ' · عناصر أحدث: ' +
      p.updated +
      ' · موجود بعناصر مساوية أو أحدث: ' +
      p.kept +
      ' · تكرارات داخل الملف: ' +
      staged.duplicates +
      ' · سجلات مستبعدة: ' +
      staged.rejected +
      '. سيبقى كل ما في قائمتك الحالية.';
  }
  function refresh() {
    if (exportSnapshot && exportSnapshot !== watchlist.items) clearDownload();
    $('watchlist-export').disabled = !ready || busy || !watchlist.items.length;
    fileInput.disabled = !ready || busy;
    $('watchlist-apply').disabled = !ready || busy || !staged;
    if (staged) preview();
  }
  api.refresh = refresh;
  function cancel() {
    token++;
    staged = null;
    fileInput.value = '';
    $('watchlist-preview').hidden = true;
    refresh();
  }
  $('watchlist-export').onclick = () => {
    try {
      clearDownload();
      const text = pack(watchlist.items);
      url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
      exportSnapshot = watchlist.items;
      const link = $('watchlist-download');
      link.href = url;
      link.download = 'madar-watchlist-' + new Date().toISOString().slice(0, 10) + '-UTC.json';
      link.hidden = false;
      link.click();
      status.textContent =
        'جُهزت نسخة كاملة من ' +
        watchlist.items.length +
        ' قمرًا. إذا لم يبدأ التنزيل، استخدم رابط تنزيل النسخة الجاهزة.';
    } catch (e) {
      status.textContent = e.message;
    }
  };
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0],
      revision = ++token;
    staged = null;
    $('watchlist-preview').hidden = true;
    refresh();
    if (!file) return;
    try {
      if (file.size > MAX_BYTES) throw Error('حجم الملف يتجاوز 20 ميغابايت.');
      status.textContent = 'جارٍ فحص النسخة محليًا…';
      const text = await file.text();
      if (revision !== token) return;
      staged = read(text);
      preview();
      $('watchlist-preview').hidden = false;
      status.textContent = 'المعاينة جاهزة. لم تتغير قائمة المتابعة بعد.';
    } catch (e) {
      if (revision === token) status.textContent = e.message;
    } finally {
      if (revision === token) refresh();
    }
  };
  $('watchlist-cancel').onclick = () => {
    cancel();
    status.textContent = 'أُلغيت المعاينة. قائمة المتابعة لم تتغير.';
  };
  $('watchlist-apply').onclick = async () => {
    if (!staged || busy) return;
    busy = true;
    refresh();
    try {
      const p = plan(watchlist.items, staged.items);
      watchlist.replace(p.items);
      reconcileSelection();
      renderList();
      update();
      const durable = await watchlist.save();
      cancel();
      status.textContent =
        'دُمجت النسخة: ' +
        p.added +
        ' أقمار جديدة، و' +
        p.updated +
        ' بعناصر أحدث، و' +
        p.kept +
        ' بقيت عناصرها الحالية.' +
        (!Privacy.persistent()
          ? ' الاستعادة لهذه الجلسة فقط لأن الحفظ على الجهاز متوقف.'
          : !durable
            ? ' تعذّر الحفظ الدائم؛ القائمة متاحة لهذه الجلسة فقط.'
            : ' حُفظت قائمة المتابعة.') +
        ' قد تخفي التصفية بعض الأقمار؛ افتح المتابعة وأعد ضبط التصفية عند الحاجة.';
    } catch {
      status.textContent = 'تعذّر إكمال الحفظ. راجع قائمة المتابعة وحالة الحفظ على الجهاز.';
    } finally {
      busy = false;
      refresh();
    }
  };
  watchlist.ready.then(() => {
    ready = true;
    refresh();
  });
  root.addEventListener('pagehide', clearDownload);
})(typeof window !== 'undefined' ? window : globalThis);
