(function (root) {
  'use strict';
  function create({ document, orbit, getMetadata, onChoose }) {
    const $ = (id) => document.getElementById(id),
      LIST_SIZE = 100;
    let listPage = 0,
      listContext = '',
      listDataset = null,
      lastRows;
    function render({
      data,
      dataset,
      context,
      onlySaved,
      saved,
      query,
      loading,
      time,
      selectedId,
    }) {
      const list = $('list');
      list.replaceChildren();
      lastRows = data;
      if (context !== listContext || dataset !== listDataset) {
        listPage = 0;
        listContext = context;
        listDataset = dataset;
      }
      const pages = Math.max(1, Math.ceil(data.length / LIST_SIZE));
      listPage = Math.max(0, Math.min(listPage, pages - 1));
      const start = listPage * LIST_SIZE;
      $('saved').textContent = '☆ المتابعة (' + saved.length + ')';
      $('results-summary').textContent = data.length
        ? 'عرض ' +
          (start + 1) +
          '–' +
          Math.min(start + LIST_SIZE, data.length) +
          ' من ' +
          data.length.toLocaleString('en-US') +
          ' نتيجة'
        : loading
          ? 'جارٍ تحميل النتائج…'
          : !onlySaved && !dataset.length
            ? 'لا تتوفر بيانات في النطاق الحالي'
            : 'لا توجد نتائج مطابقة';
      $('list-pagination').hidden = data.length <= LIST_SIZE;
      $('list-page').textContent = 'الصفحة ' + (listPage + 1) + ' من ' + pages;
      $('list-previous').disabled = listPage === 0;
      $('list-next').disabled = listPage === pages - 1;
      $('clear-search').disabled = !query;
      $('catalog-empty-actions').hidden = data.length > 0 || loading;
      $('catalog-empty-reset').hidden =
        (!onlySaved && !dataset.length) || (onlySaved && !saved.length);
      $('catalog-empty-browse').hidden = !onlySaved || saved.length > 0;
      $('catalog-empty-refresh').hidden = onlySaved || dataset.length > 0;
      if (!data.length) {
        const p = document.createElement('p');
        p.className = 'muted';
        p.textContent = loading
          ? 'جارٍ تحميل بيانات الأقمار…'
          : onlySaved
            ? saved.length
              ? 'لا توجد نتائج ضمن متابعتك مع البحث والدولة وحداثة العناصر الحالية. أعد ضبط التصفية لإظهار المتابعة.'
              : 'قائمة المتابعة فارغة. أضف قمرًا من زر المتابعة.'
            : !dataset.length
              ? 'لا توجد بيانات أقمار في النطاق الحالي. أعد تحميل البيانات أو اختر مجموعة أخرى.'
              : 'لا توجد نتائج مع البحث والدولة وحداثة العناصر الحالية. أعد ضبط التصفية أو ابحث في جميع الأقمار النشطة.';
        list.append(p);
        return;
      }
      const savedIds = new Set(saved.map((o) => o.id)),
        now = time;
      for (const o of data.slice(start, start + LIST_SIZE)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.satelliteId = String(o.id);
        b.className = 'sat' + (selectedId === o.id ? ' selected' : '');
        b.setAttribute('aria-pressed', String(selectedId === o.id));
        const dot = document.createElement('span');
        dot.className = 'dot';
        const body = document.createElement('span'),
          name = document.createElement('b'),
          meta = document.createElement('small'),
          quality = document.createElement('small');
        name.textContent = o.name;
        meta.textContent = 'NORAD ' + o.id + (savedIds.has(o.id) ? ' · ★' : '');
        const freshness = orbit.freshness(o, now),
          labels = {
            recent: 'عناصر ضمن 24 ساعة',
            aging: 'عناصر بين 24 و72 ساعة',
            old: 'عناصر أبعد من 72 ساعة',
            unknown: 'تاريخ العناصر غير متاح',
          },
          mission = getMetadata(o.id);
        quality.className = 'catalog-quality';
        quality.dataset.level = freshness.level;
        quality.textContent =
          labels[freshness.level] + (mission ? ' · ' + mission.evidenceLabel : '');
        quality.title =
          'الفارق المطلق بين تاريخ العناصر ووقت العرض؛ لا يمثل ضمان دقة. توثيق المهمة مستقل عن حداثة المدار.';
        body.append(name, meta, quality);
        b.append(dot, body);
        b.onclick = () => onChoose(o);
        list.append(b);
      }
    }
    function select(id) {
      for (const button of $('list').querySelectorAll('button[data-satellite-id]')) {
        const active = button.dataset.satelliteId === String(id);
        button.classList.toggle('selected', active);
        button.setAttribute('aria-pressed', String(active));
      }
    }
    function focusFirst() {
      $('list').scrollTop = 0;
      $('list').querySelector('button')?.focus({ preventScroll: true });
    }
    return Object.freeze({
      render,
      select,
      focusFirst,
      changePage: (delta) => {
        listPage += delta;
      },
      get lastRows() {
        return lastRows;
      },
    });
  }
  const api = Object.freeze({ create });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CatalogList = api;
})(typeof window !== 'undefined' ? window : globalThis);
