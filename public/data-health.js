(function (root) {
  'use strict';
  function create({ document, orbit, now = Date.now }) {
    const $ = (id) => document.getElementById(id);
    let healthKey = '',
      healthDataset = null;
    function render({
      object: o,
      time,
      byUser,
      fixedTime,
      paused,
      dataset,
      sourceDataset,
      connection: c,
    }) {
      const wallTime = now();
      if ($('health-display'))
        $('health-display').textContent =
          new Date(time).toISOString().slice(0, 19).replace('T', ' ') +
          ' UTC' +
          (fixedTime
            ? ' · وقت مختار'
            : paused
              ? ' · متوقف مؤقتًا'
              : ' · موقع محسوب في الوقت الحالي');
      if ($('health-connection'))
        $('health-connection').textContent =
          (c?.transport === 'server'
            ? 'عبر خادم مدار'
            : c?.transport === 'direct'
              ? 'اتصال مباشر من المتصفح'
              : 'لم يُفحص الاتصال بعد') +
          ' · ' +
          ({
            live: 'وصلت بيانات من المصدر',
            cache: 'نسخة محفوظة من جلب موثق',
            blocked: 'الاتصال متوقف مؤقتًا',
            error: 'تعذّر الاتصال',
          }[c?.state] || 'بيانات احتياطية أو مستوردة') +
          (c?.upstreamStatus ? ' · HTTP ' + c.upstreamStatus : '') +
          (c?.retryAt
            ? ' · إعادة المحاولة بعد ' +
              new Date(c.retryAt).toISOString().slice(0, 19).replace('T', ' ') +
              ' UTC'
            : '');
      if ($('health-count'))
        $('health-count').textContent =
          sourceDataset.length.toLocaleString('en-US') +
          ' سجلًا محمّلًا · ' +
          dataset.length.toLocaleString('en-US') +
          ' نتيجة بعد التصفية';
      const key = JSON.stringify([
        byUser,
        o?.id || '',
        o ? orbit.key(o) : '',
        Math.floor(Number(time) / 60000),
        Math.floor(wallTime / 60000),
        o?.provenance || {},
        !!fixedTime,
        sourceDataset.note || '',
        sourceDataset.rejected || 0,
      ]);
      if (key === healthKey && dataset === healthDataset) return;
      healthKey = key;
      healthDataset = dataset;
      const panel = $('data-health');
      if (!panel) return;
      const h = o ? orbit.freshness(o, time) : null,
        p = o?.provenance || {};
      const stamp = (t) =>
        Number.isFinite(Number(t)) && t != null
          ? new Date(Number(t)).toISOString().slice(0, 19).replace('T', ' ') + ' UTC'
          : 'غير متاح';
      const modes = {
        live: 'جلب مباشر من المصدر',
        cache: 'نسخة محفوظة من جلب سابق',
        local: 'نسخة احتياطية محلية',
        derived: 'تصنيف تقريبي من النسخة الاحتياطية',
        independent: 'رصد علني مستقل',
        imported: 'بيانات مستوردة',
      };
      panel.dataset.level = h?.level || 'unknown';
      const summary = $('data-health-summary');
      summary.replaceChildren();
      for (const [kind, text] of [
        ['name', o && byUser ? 'بيانات ' + o.name : 'حالة بيانات الأقمار'],
        ['source', o ? modes[p.mode] || 'مصدر غير موثق' : null],
        ['freshness', byUser ? h?.label : 'تختلف حداثة العناصر بين الأقمار'],
      ]) {
        if (!text) continue;
        const part = document.createElement('span');
        part.className = 'health-badge health-' + kind;
        part.textContent = text;
        summary.append(part);
      }
      summary.title = byUser
        ? 'تفاصيل القمر المحدد: المصدر وتاريخ العناصر وآخر جلب ناجح؛ الحداثة محسوبة بالنسبة إلى وقت العرض.'
        : 'حالة المصدر؛ اختر قمرًا لعرض حداثة عناصره وتفاصيله.';
      $('health-source').textContent = o
        ? orbit.sourceLabel(o) + ' · ' + (modes[p.mode] || 'سجل محفوظ دون تاريخ جلب موثق')
        : '—';
      $('health-format').textContent = o
        ? o.omm
          ? 'OMM JSON · يدعم أرقام NORAD الطويلة'
          : 'TLE · تنسيق قديم لبيانات منشورة سابقًا'
        : '—';
      $('health-epoch').textContent = stamp(h?.epoch);
      $('health-retrieved').textContent = stamp(p.fetchedAt);
      $('health-distance').textContent =
        h && Number.isFinite(h.hours)
          ? (Number(time) >= h.epoch
              ? 'تاريخ العناصر يسبق وقت العرض بـ '
              : 'تاريخ العناصر يلي وقت العرض بـ ') +
            h.hours.toFixed(1) +
            ' ساعة؛ هذا عمر النموذج بالنسبة إلى العرض، وليس تأخر موضع القمر.'
          : 'غير متاح';
      const age = o && Number.isFinite(h?.epoch) ? (wallTime - h.epoch) / 3600000 : NaN;
      $('health-age').textContent = Number.isFinite(age)
        ? (age >= 0 ? 'قبل الآن بـ ' : 'بعد الآن بـ ') + Math.abs(age).toFixed(1) + ' ساعة'
        : 'غير متاح';
      const old = dataset.filter((item) => orbit.freshness(item, time).level === 'old').length;
      $('health-range').textContent =
        old +
        ' من ' +
        dataset.length +
        ' عنصرًا يبعد أكثر من 3 أيام عن وقت العرض؛ هذا مؤشر حداثة وليس نسبة دقة.';
      $('health-note').textContent =
        (p.mode === 'imported'
          ? 'سجل مستورد من ملف؛ لم يُتحقق من مصدر عناصره ولم يحدث جلب مباشر عند استعادته. '
          : '') +
        (p.snapshot ? 'النسخة الاحتياطية: ' + p.snapshot + '. ' : '') +
        (sourceDataset.note ? sourceDataset.note + ' ' : '') +
        'يجري تحديث الحساب كل ثانية، ولا تصل قياسات جديدة كل ثانية. الدقة تتأثر بعمر العناصر والمناورات. ' +
        (fixedTime ? 'لم يُحمّل أرشيف خاص بالتاريخ المختار. ' : '') +
        'تُراجع بيانات المصدر تلقائيًا بعد انتهاء ساعتين عند ظهور الصفحة وفي الوقت الحالي. قد تبقى العناصر نفسها إذا لم ينشر المصدر نموذجًا أحدث؛ لا تُغيّر تواريخها لإظهار حداثة غير حقيقية.';
      $('health-invalid').textContent = sourceDataset.rejected
        ? 'استُبعد ' + sourceDataset.rejected + ' سجلًا غير صالح من الاستجابة.'
        : '';
    }
    return Object.freeze({ render });
  }
  const api = Object.freeze({ create });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DataHealth = api;
})(typeof window !== 'undefined' ? window : globalThis);
