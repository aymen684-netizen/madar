(function (root) {
  'use strict';
  const $ = (id) => document.getElementById(id),
    C = root.CountryInventoryCore,
    panel = $('inventory-panel'),
    T = (s) => root.MadarI18n?.translate(String(s)) || String(s),
    pageSize = 50;
  let ready = null,
    result = null,
    page = 0,
    worker = null,
    wordUrl = null,
    generation = 0;
  const say = (s) => {
    $('inventory-status').textContent = s;
  };
  function stop() {
    generation++;
    worker?.terminate();
    worker = null;
    $('inventory-cancel').hidden = true;
    $('inventory-word').disabled = false;
  }
  function clear() {
    stop();
    result = null;
    $('inventory-results').hidden = true;
    if (wordUrl) URL.revokeObjectURL(wordUrl);
    wordUrl = null;
    $('inventory-download').hidden = true;
    root.WordDelivery.clear('inventory');
  }
  async function init() {
    if (ready) return ready;
    ready = (async () => {
      await root.SatMetadata.load();
      const select = $('inventory-owner');
      select.replaceChildren();
      for (const item of [
        { code: 'all', label: 'جميع الدول والجهات' },
        ...root.SatMetadata.owners(),
      ]) {
        const o = document.createElement('option');
        o.value = item.code;
        o.textContent = item.label;
        select.append(o);
      }
      const saved = root.Privacy.localGet('madar-inventory-owner');
      select.value = [...select.options].some((o) => o.value === saved)
        ? saved
        : [...select.options].some((o) => o.value === 'SAUD')
          ? 'SAUD'
          : 'all';
      say('اختر الدولة أو الجهة ثم أنشئ الحصر. تُحمّل تفاصيل الفهرس عند إنشاء التقرير فقط.');
    })();
    try {
      await ready;
    } catch (e) {
      ready = null;
      say('تعذّر تحميل دليل الدول. أعد المحاولة.');
      throw e;
    }
  }
  function enter() {
    if (
      root.MadarShell.current() === 'reports' &&
      root.MadarShell.report() === 'inventory' &&
      !panel.hidden
    )
      init().catch(() => {});
  }
  new MutationObserver(enter).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('madar-route', enter);
  enter();
  $('inventory-owner').onchange = () => {
    clear();
    root.Privacy.localSet('madar-inventory-owner', $('inventory-owner').value);
    say('تغيّر الاختيار. أنشئ الحصر لعرض نتائجه.');
  };
  function title(r) {
    return 'حصر أقمار الدول والجهات · ' + r.ownerLabel;
  }
  function summary(r) {
    return (
      r.stats.satellites +
      ' قمرًا في النسخة · ' +
      r.stats.owners +
      ' دولة أو جهة · ' +
      r.stats.unknownMission +
      ' مهمة غير موثقة · ' +
      r.stats.missingLaunch +
      ' تاريخ إطلاق غير متاح · ' +
      r.stats.unclassifiedOrbit +
      ' مدار غير مصنف'
    );
  }
  function notes(r) {
    return [
      summary(r),
      'نسخة الفهرس UTC: ' + r.catalogRetrievedAt,
      'إنشاء التقرير UTC: ' + r.createdAt,
      'SHA-256 لنسخة المصدر: ' + r.sourceSha256,
      r.notice,
      r.orbitNote,
      'مصدر الحصر: ' + r.source,
      'توثيق حقول الفهرس: ' + r.documentation,
      ...(!r.rows.length
        ? ['لا توجد حمولات لهذه الجهة في النسخة المتاحة؛ لا يثبت ذلك عدم امتلاكها أقمارًا.']
        : []),
    ];
  }
  function fillCell(doc, cell, value) {
    if (typeof value === 'object') {
      cell.textContent = T(value.text);
      for (const link of value.links || []) {
        if (!/^https:\/\//.test(link.url)) continue;
        const a = doc.createElement('a');
        a.textContent = T(link.label);
        a.href = link.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        cell.append(doc.createElement('br'), a);
      }
    } else cell.textContent = T(value);
  }
  function renderBrief() {
    const host = $('inventory-brief');
    host.replaceChildren();
    if (result) root.ReportLayout.render(host, result);
  }
  function invalidateWord() {
    stop();
    if (wordUrl) URL.revokeObjectURL(wordUrl);
    wordUrl = null;
    $('inventory-download').hidden = true;
    $('inventory-download').removeAttribute('href');
    root.WordDelivery.clear('inventory');
  }
  $('inventory-detail').onchange = () => {
    root.ReportLayout.setMode('inventory', $('inventory-detail').value);
    invalidateWord();
    say('تغيّر محتوى التصدير؛ جهّز Word للنسخة المختارة.');
  };
  function render() {
    if (!result) return;
    const head = $('inventory-table').tHead,
      body = $('inventory-table').tBodies[0];
    head.replaceChildren();
    const tr = document.createElement('tr');
    for (const value of ['الدولة أو الجهة المسجلة', ...C.tableHeaders]) {
      const th = document.createElement('th');
      th.textContent = T(value);
      tr.append(th);
    }
    head.append(tr);
    body.replaceChildren();
    const slice = result.rows.slice(page * pageSize, (page + 1) * pageSize),
      rows = C.tableRows({ rows: slice });
    for (let i = 0; i < rows.length; i++) {
      const tr = document.createElement('tr');
      for (const value of [slice[i].ownerLabel, ...rows[i]]) {
        const td = document.createElement('td');
        fillCell(document, td, value);
        tr.append(td);
      }
      body.append(tr);
    }
    const total = Math.max(1, Math.ceil(result.rows.length / pageSize));
    $('inventory-page').textContent = page + 1 + ' / ' + total + ' · ' + result.rows.length;
    $('inventory-previous').disabled = page === 0;
    $('inventory-next').disabled = page + 1 >= total;
  }
  $('inventory-previous').onclick = () => {
    if (page > 0) {
      page--;
      render();
    }
  };
  $('inventory-next').onclick = () => {
    if (result && (page + 1) * pageSize < result.rows.length) {
      page++;
      render();
    }
  };
  $('inventory-form').onsubmit = async (e) => {
    e.preventDefault();
    clear();
    const token = generation;
    $('inventory-run').disabled = true;
    say('جارٍ التحقق من نسخة الفهرس وتجهيز الحصر…');
    try {
      await init();
      await root.SatMetadata.loadDetails();
      if (token !== generation) return;
      const owner = $('inventory-owner').value,
        info = {
          ...root.SatMetadata.inventoryInfo(),
          ownerLabel:
            root.MadarI18n?.original($('inventory-owner').selectedOptions[0]) ||
            $('inventory-owner').selectedOptions[0].textContent,
        };
      await new Promise((r) => setTimeout(r, 0));
      if (token !== generation) return;
      result = C.build(root.SatMetadata.inventoryRecords(owner), info, owner);
      page = 0;
      $('inventory-title').textContent = title(result);
      $('inventory-summary').textContent = '';
      $('inventory-provenance').textContent = notes(result).slice(1, 4).join('\n');
      $('inventory-note').textContent = result.notice;
      $('inventory-orbit-note').textContent = result.orbitNote;
      $('inventory-results').hidden = false;
      renderBrief();
      render();
      say(
        result.rows.length
          ? 'اكتمل الحصر. العرض مقسّم إلى صفحات؛ ملفات التصدير تتضمن جميع النتائج.'
          : 'لا توجد حمولات لهذه الجهة في النسخة المتاحة؛ لا يثبت ذلك عدم امتلاكها أقمارًا.',
      );
    } catch (e) {
      say('تعذّر إنشاء الحصر: ' + e.message);
    } finally {
      $('inventory-run').disabled = false;
    }
  };
  function download(content, type, suffix) {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([content], { type })),
      a = document.createElement('a');
    a.href = url;
    a.download =
      'madar-inventory-' + result.owner + '-' + result.catalogRetrievedAt.slice(0, 10) + suffix;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  $('inventory-csv').onclick = () => {
    if (result)
      download(root.ReportExports.csv(C.csvRows(result)), 'text/csv;charset=utf-8', '.csv');
  };
  $('inventory-json').onclick = () => {
    if (result) {
      const { groups, ...data } = result;
      download(
        JSON.stringify(
          {
            ...data,
            brief: root.ReportBrief.build(result),
            groups: groups.map((g) => ({ code: g.code, label: g.label, count: g.rows.length })),
          },
          null,
          2,
        ),
        'application/json',
        '.json',
      );
    }
  };
  $('inventory-word').onclick = async () => {
    if (!result) return;
    invalidateWord();
    const token = generation,
      r = result,
      detail = root.ReportLayout.mode('inventory');
    $('inventory-word').disabled = true;
    $('inventory-cancel').hidden = false;
    say('جارٍ تجهيز حصر Word في الخلفية…');
    try {
      const translateCell = (v) =>
        typeof v === 'object'
          ? { text: T(v.text), links: v.links.map((l) => ({ ...l, label: T(l.label) })) }
          : T(v);
      worker = new Worker('inventory-word-worker.js?v=49');
      worker.onmessage = async (e) => {
        if (token !== generation) return;
        const m = e.data;
        if (m.type === 'progress') return;
        if (m.type === 'error') {
          stop();
          say('تعذّر تجهيز حصر Word: ' + m.message);
          return;
        }
        if (m.type !== 'done') return;
        worker.terminate();
        worker = null;
        try {
          if (wordUrl) URL.revokeObjectURL(wordUrl);
          wordUrl = URL.createObjectURL(m.blob);
          const a = $('inventory-download');
          a.href = wordUrl;
          a.download =
            'madar-inventory-' +
            r.owner +
            '-' +
            r.catalogRetrievedAt.slice(0, 10) +
            (detail === 'brief' ? '-brief' : '') +
            '.' +
            (m.extension || 'docx');
          a.hidden = false;
          await root.WordDelivery.attach('inventory', m.blob, a.download);
          if (token !== generation) return;
          say(
            detail === 'brief'
              ? 'ملخص Word جاهز؛ يعرض المؤشرات وحدود البيانات دون جداول الأقمار.'
              : m.extension === 'zip'
                ? 'حزمة Word جاهزة؛ ملفاتها تشمل جميع النتائج، بحد أقصى 500 سجل في الجزء.'
                : 'حصر Word جاهز؛ يتضمن جميع الأقمار في الاختيار.',
          );
        } catch (err) {
          say('تعذّر حفظ حصر Word: ' + err.message);
        } finally {
          if (token === generation) {
            $('inventory-word').disabled = false;
            $('inventory-cancel').hidden = true;
          }
        }
      };
      worker.onerror = () => {
        if (token === generation) {
          stop();
          say('تعذّر تشغيل تجهيز Word. أعد المحاولة.');
        }
      };
      const groups = [];
      for (const g of detail === 'brief' ? [] : r.groups) {
        const rows = [];
        for (let i = 0; i < g.rows.length; i += 100) {
          rows.push(
            ...C.tableRows({ rows: g.rows.slice(i, i + 100) }).map((row) => row.map(translateCell)),
          );
          await new Promise((resolve) => setTimeout(resolve, 0));
          if (token !== generation) return;
        }
        groups.push({
          code: g.code,
          title: T(title({ ...r, ownerLabel: g.label })),
          label: T(g.label) + ' · ' + g.rows.length,
          brief: root.ReportLayout.translated(
            root.ReportBrief.build({ ...r, rows: g.rows, stats: { ...r.stats, owners: 1 } }),
          ),
          rows,
        });
      }
      const brandBytes = await root.ReportLayout.brand();
      if (token !== generation) return;
      worker.postMessage({
        title: T(title(r)),
        detail,
        brief: root.ReportLayout.translated(root.ReportBrief.build(r)),
        createdAt: r.createdAt,
        brandBytes,
        scopeNote: T('الملخص يصف كامل اختيار الدولة؛ هذا الملف يتضمن جزءًا من سجلاتها.'),
        notes: notes(r).slice(1).map(T),
        headers: C.tableHeaders.map(T),
        language: root.MadarI18n.language,
        partLabel: T('الجزء'),
        groups,
      });
    } catch (err) {
      stop();
      say('تعذّر تجهيز حصر Word: ' + err.message);
    }
  };
  $('inventory-cancel').onclick = () => {
    stop();
    say('أُلغي تجهيز Word. يبقى الحصر متاحًا.');
  };
  $('inventory-print').onclick = async () => {
    if (!result) return;
    const r = result,
      w = root.open('', '_blank');
    if (!w) {
      say('اسمح بفتح نافذة الطباعة لهذا الموقع.');
      return;
    }
    try {
      const d = w.document,
        rtl = root.MadarI18n.language !== 'en';
      d.title = T(title(r));
      d.documentElement.lang = rtl ? 'ar' : 'en';
      d.documentElement.dir = rtl ? 'rtl' : 'ltr';
      const style = d.createElement('style');
      style.textContent =
        'body{font:12px Arial;color:#142638;margin:24px}p{white-space:pre-line;overflow-wrap:anywhere;line-height:1.7}table{border-collapse:collapse;width:100%;margin-block:16px;table-layout:fixed}th,td{border:1px solid #bbc6cf;padding:7px;white-space:pre-line;overflow-wrap:anywhere;vertical-align:top}th{background:#e7eef3}thead{display:table-header-group}tr{break-inside:avoid}h2{break-after:avoid}@media print{@page{size:A4 landscape;margin:12mm}button{display:none}}';
      d.head.append(style);
      const brief = root.ReportLayout.printFront(d, r, T(title(r)));
      for (const note of notes(r).slice(1)) {
        const p = d.createElement('p');
        p.textContent = T(note);
        d.body.append(p);
      }
      const button = d.createElement('button');
      button.disabled = true;
      button.textContent = T('جارٍ تجهيز نسخة الطباعة…');
      button.onclick = () => w.print();
      d.body.append(button);
      if (root.ReportLayout.mode('inventory') === 'brief') {
        root.ReportLayout.printReferences(d, brief);
        button.textContent = T('طباعة / حفظ PDF');
        button.disabled = false;
        w.focus();
        return;
      }
      for (const group of r.groups) {
        const h = d.createElement('h2');
        h.textContent = T(group.label) + ' · ' + group.rows.length;
        d.body.append(h);
        const table = d.createElement('table'),
          head = d.createElement('thead'),
          body = d.createElement('tbody'),
          row = d.createElement('tr');
        for (const text of C.tableHeaders) {
          const th = d.createElement('th');
          th.textContent = T(text);
          row.append(th);
        }
        head.append(row);
        table.append(head, body);
        d.body.append(table);
        const rows = C.tableRows(group);
        for (let i = 0; i < rows.length; i++) {
          const tr = d.createElement('tr');
          for (const value of rows[i]) {
            const td = d.createElement('td');
            fillCell(d, td, value);
            tr.append(td);
          }
          body.append(tr);
          if (i % 100 === 99) {
            await new Promise((resolve) => setTimeout(resolve, 0));
            if (w.closed) return;
          }
        }
      }
      root.ReportLayout.printReferences(d, brief);
      button.textContent = T('طباعة / حفظ PDF');
      button.disabled = false;
      w.focus();
    } catch (err) {
      say('تعذّر تجهيز نسخة الطباعة: ' + err.message);
    }
  };
  document.addEventListener('madar-language', () => {
    invalidateWord();
    renderBrief();
    render();
  });
  root.CountryInventory = { current: () => result, ready: init };
})(window);
