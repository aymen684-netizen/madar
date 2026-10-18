(function (root) {
  'use strict';
  const $ = (id) => document.getElementById(id),
    T = (s) => MadarI18n.translate(s);
  function mount(host, { stamp, openPass }) {
    const area = document.createElement('section');
    area.id = 'fleet-experience';
    area.innerHTML =
      '<h4>الخط الزمني لمجموعة الخريطة · 24 ساعة</h4><p>كل صف قمر بلونه في الخريطة. اضغط على المرور لعرضه في وقته. الفراغ يعني عدم اكتشاف مرور ضمن خطوة الحساب، وليس ضمانًا لغيابه.</p><div id="fleet-timeline" class="fleet-timeline" tabindex="0"></div><label>اختر مرورًا لاستكشافه<select id="fleet-event"></select></label><div id="fleet-event-detail"></div><label><input id="fleet-alerts" type="checkbox">تنبيه داخل اللوحة قبل المرور بخمس دقائق</label><p>يعمل التنبيه أثناء فتح هذه اللوحة وظهورها فقط، وفي الوقت الحالي دون إيقافه. إغلاق التطبيق أو تعليق المتصفح قد يمنع التنبيه.</p><p id="fleet-alert-status" role="status" aria-live="polite"></p><details id="fleet-compare"><summary>مقارنة قمرين إلى أربعة</summary><div id="fleet-compare-options"></div><button id="fleet-compare-run" type="button">قارن الأقمار المختارة</button><div id="fleet-compare-result"></div></details>';
    host.querySelector('#fleet-pass-list').before(area);
    let result = null,
      source = [],
      observer = null,
      events = [],
      notified = new Set();
    function reset() {
      result = null;
      source = [];
      observer = null;
      events = [];
      notified.clear();
      for (const id of [
        'fleet-timeline',
        'fleet-event',
        'fleet-event-detail',
        'fleet-compare-options',
        'fleet-compare-result',
      ])
        $(id).replaceChildren();
      $('fleet-alert-status').textContent = '';
      area.hidden = true;
    }
    function download(pass) {
      const blob = new Blob([PassToolsCore.calendar([pass], { language: MadarI18n.language })], {
          type: 'text/calendar;charset=utf-8',
        }),
        url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = `madar-pass-${pass.id}-${Math.round(pass.entry)}.ics`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function detail() {
      const event = events[Number($('fleet-event').value)],
        host = $('fleet-event-detail');
      host.replaceChildren();
      if (!event) return;
      const { pass, object } = event,
        title = document.createElement('p'),
        quality = document.createElement('p'),
        actions = document.createElement('div');
      title.dataset.noTranslate = '';
      title.dir = 'auto';
      title.textContent = object.name + ' · ' + stamp(pass.entry) + ' → ' + stamp(pass.exit);
      quality.textContent = OrbitData.freshness(object, pass.entry).label;
      host.append(title, quality);
      if (pass.clippedStart || pass.clippedEnd) {
        const note = document.createElement('p');
        note.textContent = 'المرور محصور بحدود نافذة الحساب؛ الذروة تخص الجزء المحسوب.';
        host.append(note);
      }
      const map = document.createElement('button'),
        calendar = document.createElement('button');
      map.type = calendar.type = 'button';
      map.textContent = 'اعرض المرور على الخريطة';
      map.onclick = () => openPass(pass, object);
      calendar.textContent = 'تنزيل موعد التقويم ICS';
      calendar.onclick = () => download(pass);
      actions.className = 'fleet-pass-actions';
      actions.append(map, calendar);
      host.append(actions);
      const figure = document.createElement('figure'),
        caption = document.createElement('figcaption');
      caption.textContent =
        'مخطط السماء: الشمال أعلى، والشرق يمينًا، والمركز فوق الرأس. الدوائر لارتفاع 0° و30° و60°. المسار هندسي ولا يضمن الرؤية بالعين. الدائرة الممتلئة بداية الجزء المحسوب والمفرغة نهايته.';
      figure.append(caption);
      try {
        const points = PassToolsCore.sky(satellite, object, observer, pass),
          ns = 'http://www.w3.org/2000/svg',
          svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 220 220');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', T('مخطط مسار القمر في السماء'));
        svg.classList.add('fleet-sky');
        for (const r of [90, 60, 30]) {
          const c = document.createElementNS(ns, 'circle');
          for (const [k, v] of Object.entries({
            cx: 110,
            cy: 110,
            r,
            fill: 'none',
            stroke: '#658297',
          }))
            c.setAttribute(k, v);
          svg.append(c);
        }
        for (const [text, x, y] of [
          ['N', 110, 14],
          ['E', 210, 114],
          ['S', 110, 216],
          ['W', 9, 114],
        ]) {
          const n = document.createElementNS(ns, 'text');
          n.textContent = text;
          n.setAttribute('x', x);
          n.setAttribute('y', y);
          n.setAttribute('text-anchor', 'middle');
          n.setAttribute('fill', '#e8f5ff');
          svg.append(n);
        }
        let segment = [];
        const flush = () => {
          if (segment.length > 1) {
            const p = document.createElementNS(ns, 'polyline');
            p.setAttribute('points', segment.map((p) => p.join(',')).join(' '));
            p.setAttribute('fill', 'none');
            p.setAttribute('stroke', MapFleet.color(object.id));
            p.setAttribute('stroke-width', '2');
            svg.append(p);
          }
          segment = [];
        };
        for (const p of points) {
          if (p) segment.push(p);
          else flush();
        }
        flush();
        for (const [p, fill] of [
          [points[0], MapFleet.color(object.id)],
          [points.at(-1), 'none'],
        ])
          if (p) {
            const c = document.createElementNS(ns, 'circle');
            for (const [k, v] of Object.entries({ cx: p[0], cy: p[1], r: 4, fill, stroke: '#fff' }))
              c.setAttribute(k, v);
            svg.append(c);
          }
        figure.append(svg);
      } catch {
        const p = document.createElement('p');
        p.textContent = 'تعذّر رسم مسار السماء من العناصر المتاحة.';
        figure.append(p);
      }
      host.append(figure);
    }
    function timeline() {
      const host = $('fleet-timeline');
      host.replaceChildren();
      const chart = document.createElement('div');
      chart.className = 'fleet-timeline-chart';
      chart.dir = 'ltr';
      const axis = document.createElement('div');
      axis.className = 'fleet-timeline-axis';
      for (let i = 0; i <= 4; i++) {
        const n = document.createElement('span');
        n.dataset.noTranslate = '';
        n.textContent = stamp(result.start + ((result.end - result.start) * i) / 4);
        axis.append(n);
      }
      chart.append(axis);
      for (const object of source) {
        const item = result.items.find((r) => Number(r.id) === Number(object.id)),
          row = document.createElement('div'),
          label = document.createElement('span'),
          track = document.createElement('div');
        row.className = 'fleet-timeline-row';
        label.dataset.noTranslate = '';
        label.textContent = object.name + ' · ' + object.id;
        label.style.borderInlineStart = '4px solid ' + MapFleet.color(object.id);
        track.className = 'fleet-timeline-track';
        for (const pass of item?.rows || []) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'fleet-timeline-pass';
          b.style.left = ((pass.entry - result.start) / (result.end - result.start)) * 100 + '%';
          b.style.width =
            Math.max(0.25, ((pass.exit - pass.entry) / (result.end - result.start)) * 100) + '%';
          b.style.background = MapFleet.color(object.id);
          b.dataset.noTranslate = '';
          b.title = b.ariaLabel =
            object.name + ' · ' + stamp(pass.entry) + ' → ' + stamp(pass.exit);
          b.onclick = () => openPass(pass, object);
          track.append(b);
        }
        if (!item || item.invalid || !item.rows.length) {
          const n = document.createElement('span');
          n.textContent = item?.invalid ? 'تعذّر الحساب' : 'لم يُكتشف مرور';
          track.append(n);
        }
        row.append(label, track);
        chart.append(row);
      }
      host.append(chart);
    }
    function render(data, objects, site) {
      result = data;
      source = objects;
      observer = site;
      area.hidden = false;
      events = source
        .flatMap((object) =>
          (result.items.find((i) => Number(i.id) === Number(object.id))?.rows || []).map(
            (pass) => ({ pass, object }),
          ),
        )
        .sort((a, b) => a.pass.entry - b.pass.entry || a.pass.id - b.pass.id);
      const selected = $('fleet-event').value;
      $('fleet-event').replaceChildren();
      events.forEach(({ pass, object }, i) => {
        const o = document.createElement('option');
        o.value = i;
        o.dataset.noTranslate = '';
        o.textContent = object.name + ' · ' + stamp(pass.entry);
        $('fleet-event').append(o);
      });
      if (selected !== '' && Number(selected) < events.length) $('fleet-event').value = selected;
      timeline();
      detail();
      const checked = new Set(
        [...$('fleet-compare-options').querySelectorAll('input:checked')].map((n) => n.value),
      );
      $('fleet-compare-options').replaceChildren();
      for (const object of source) {
        const l = document.createElement('label'),
          c = document.createElement('input'),
          n = document.createElement('bdi');
        c.type = 'checkbox';
        c.value = object.id;
        c.checked = checked.has(c.value);
        n.dataset.noTranslate = '';
        n.textContent = object.name + ' · ' + object.id;
        l.append(c, n);
        $('fleet-compare-options').append(l);
      }
      $('fleet-compare-result').replaceChildren();
    }
    function compare() {
      const ids = [...$('fleet-compare-options').querySelectorAll('input:checked')].map((n) =>
          Number(n.value),
        ),
        host = $('fleet-compare-result');
      host.replaceChildren();
      if (ids.length < 2 || ids.length > 4) {
        host.textContent = 'اختر قمرين إلى أربعة للمقارنة.';
        return;
      }
      const selected = source.filter((o) => ids.includes(Number(o.id))),
        table = document.createElement('table'),
        now = dateNow();
      table.className = 'analysis-table';
      const data = [
        ['القمر وNORAD', ...selected.map((o) => o.name + ' · ' + o.id)],
        ['نوع المدار', ...selected.map((o) => OrbitAppearance.category(o).toUpperCase())],
        [
          'الارتفاع كم',
          ...selected.map((o) => position(prepare([o])[0], now)?.h.toFixed(1) ?? '—'),
        ],
        [
          'زمن الدورة بالدقائق',
          ...selected.map((o) => (1440 / OrbitData.fields(o).motion).toFixed(1)),
        ],
        ['المهمة', ...selected.map((o) => SatMetadata.get(o.id)?.missionLabel || 'غير متاح')],
        ['المصدر', ...selected.map((o) => OrbitData.sourceLabel(o))],
        ['حداثة العناصر', ...selected.map((o) => OrbitData.freshness(o, now).label)],
        [
          'المرور القادم',
          ...selected.map((o) => {
            const item = result.items.find((i) => Number(i.id) === Number(o.id)),
              next = FleetPassCore.next(item, +now);
            return next.pass
              ? stamp(next.pass.entry)
              : next.state === 'invalid'
                ? 'تعذّر الحساب'
                : 'لم يُكتشف مرور';
          }),
        ],
      ];
      for (const [i, cells] of data.entries()) {
        const tr = document.createElement('tr');
        cells.forEach((v, j) => {
          const td = document.createElement(i === 0 || j === 0 ? 'th' : 'td');
          if (i === 0 && j > 0) td.dataset.noTranslate = '';
          td.textContent = v;
          tr.append(td);
        });
        table.append(tr);
      }
      const at = document.createElement('p');
      at.dataset.noTranslate = '';
      at.textContent = stamp(+now);
      const wrap = document.createElement('div');
      wrap.className = 'report-table-wrap';
      wrap.append(table);
      host.append(at, wrap);
    }
    function tick(now, live) {
      if (!$('fleet-alerts').checked || !result) return;
      if (!live) {
        $('fleet-alert-status').textContent = 'التنبيهات متوقفة لأن وقت الخريطة مثبت أو متوقف.';
        return;
      }
      const due = events.filter(
        ({ pass }) =>
          pass.entry > now &&
          pass.entry - now <= 300000 &&
          !notified.has(pass.id + ':' + pass.entry),
      );
      if (!due.length) return;
      for (const { pass } of due) notified.add(pass.id + ':' + pass.entry);
      $('fleet-alert-status').textContent =
        T('مرور خلال خمس دقائق: ') +
        due.map(({ object }) => object.name + ' · ' + object.id).join(' / ');
    }
    $('fleet-event').onchange = detail;
    $('fleet-compare-run').onclick = compare;
    $('fleet-compare-options').onchange = () => $('fleet-compare-result').replaceChildren();
    $('fleet-alerts').onchange = () => {
      $('fleet-alert-status').textContent = $('fleet-alerts').checked
        ? 'التنبيه مفعّل أثناء ظهور اللوحة وفي الوقت الحالي.'
        : '';
    };
    document.addEventListener('madar-language', () => {
      if (result) render(result, source, observer);
    });
    reset();
    return { reset, render, tick };
  }
  root.FleetExperience = { mount };
})(window);
