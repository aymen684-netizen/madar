(function (root) {
  'use strict';
  const VERSION = '52',
    missing = 'غير متاح',
    documented = new Set(['documented', 'individual', 'program']);
  const labels = {
    documented: 'مهمة فردية موثقة',
    individual: 'مهمة فردية موثقة',
    program: 'وصف منظومة موثق',
    category: 'تصنيف عام للمهمة',
    unknown: 'مهمة غير موثقة',
  };
  function known(v) {
    return (
      typeof v === 'string' && v.trim() !== '' && ![missing, 'غير موثق', '—'].includes(v.trim())
    );
  }
  function https(v) {
    try {
      const u = new URL(v);
      return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;
    } catch {
      return null;
    }
  }
  function date(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const t = Date.parse(v);
    return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
  }
  function metric(key, label, count, total, scope) {
    return { key, label, count, total, percent: total > 0 ? (count / total) * 100 : null, scope };
  }
  function distribution(label, values) {
    const counts = new Map();
    for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
    const sorted = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ar')),
      items = sorted.slice(0, 5).map(([label, count]) => ({ label, count }));
    if (sorted.length > 5)
      items.push({ label: 'بقية الفئات', count: sorted.slice(5).reduce((n, x) => n + x[1], 0) });
    return { label, total: values.length, items };
  }
  function build(r) {
    const inventory = r.kind === 'country-satellite-inventory',
      windows = r.windows || [r],
      rows = inventory ? r.rows : windows.flatMap((w) => w.result?.rows || []),
      unique = [...new Map(rows.map((x) => [x.id, x])).values()],
      metrics = [],
      notes = [],
      executive = [],
      distributions = [],
      refs = new Map();
    const addRef = (label, url) => {
        const safe = https(url);
        if (safe && !refs.has(safe)) refs.set(safe, { label, url: safe });
      },
      metadata = (x) => (inventory ? x : x.metadata || {}),
      total = unique.length,
      scope = 'الأقمار المختلفة في النتائج المختارة';
    if (inventory) {
      executive.push(
        'عدد الأقمار في الحصر ' +
          total +
          ' · الدول والجهات المسجلة ' +
          r.stats.owners +
          ' · وفق نسخة الفهرس المختارة.',
        'نسخة الفهرس UTC ' +
          (r.catalogRetrievedAt || missing) +
          ' · إنشاء التقرير UTC ' +
          r.createdAt,
      );
      distributions.push(
        distribution(
          'توزيع المدارات المسجلة',
          unique.map((x) => x.orbit.regime),
        ),
      );
      notes.push(r.notice, r.orbitNote);
      addRef('مصدر الفهرس', r.source);
      addRef('توثيق حقول الفهرس', r.documentation);
    } else if (r.windows) {
      executive.push(
        'حالات المرور عبر الفترات ' +
          rows.length +
          ' · عدد الفترات ' +
          windows.length +
          ' · الأقمار المختلفة ' +
          total +
          '.',
        'أقمار حاضرة في جميع الفترات ' +
          (r.analysis?.commonAll.length || 0) +
          ' · أقمار متكررة في فترتين أو أكثر ' +
          (r.analysis?.repeated.length || 0) +
          '.',
      );
      notes.push(
        'مجموع المرور عبر الفترات قد يعد المرور نفسه أكثر من مرة عند تداخلها. تشابه ساعة اليوم يختلف عن التزامن الفعلي، ولا يدل على نشاط تشغيلي.',
      );
    } else {
      executive.push(
        'حالات المرور المحسوبة ' +
          rows.length +
          ' · الأقمار المختلفة ' +
          total +
          ' · الأقمار المفحوصة ' +
          (r.result?.total ?? 0) +
          '.',
      );
      if (root.ReportInsights && Number.isFinite(r.start) && Number.isFinite(r.end)) {
        const s = root.ReportInsights.summary(r);
        executive.push(
          'زمن وجود قمر واحد على الأقل ضمن نطاق الحساب ' +
            duration(s.unionSeconds) +
            '؛ مجموع مدد المرور ' +
            duration(s.sumSeconds) +
            ' وقد تتداخل.',
        );
      }
      if (r.observer) {
        const peak = rows.reduce(
          (a, b) => (Number.isFinite(b.elevation) && (!a || b.elevation > a.elevation) ? b : a),
          null,
        );
        if (peak)
          executive.push(
            'أعلى زاوية ارتفاع مقدّرة ' +
              peak.elevation.toFixed(1) +
              '° للقمر ' +
              peak.name +
              ' · NORAD ' +
              peak.id +
              '.',
          );
      }
    }
    if (!inventory) {
      executive.push(
        'نطاق الأقمار ' +
          (r.scopeName || missing) +
          ' · خطوة الفحص ' +
          (r.step ?? missing) +
          ' ثانية',
      );
      for (const [i, w] of windows.entries())
        if (Number.isFinite(w.start) && Number.isFinite(w.end))
          executive.push(
            (r.windows ? 'الفترة ' + (i + 1) + ' · ' : 'الفترة ') +
              new Date(w.start + (r.offset || 0) * 36e5)
                .toISOString()
                .slice(0, 19)
                .replace('T', ' ') +
              ' إلى ' +
              new Date(w.end + (r.offset || 0) * 36e5)
                .toISOString()
                .slice(0, 19)
                .replace('T', ' ') +
              ' · ' +
              (r.zoneLabel || 'UTC'),
          );
      if (r.criteria && root.CountryReportCore)
        notes.push(...root.CountryReportCore.criteriaText(r));
      if (r.observer)
        executive.push(
          'موقع الرصد ' +
            r.observer.name +
            ' · خط العرض ' +
            r.observer.lat +
            ' · خط الطول ' +
            r.observer.lon +
            ' · ارتفاع الموقع ' +
            r.observer.height +
            ' مترًا · حد زاوية الارتفاع ' +
            r.observer.minElevation +
            '°',
        );
    }
    if (
      !inventory &&
      windows.every((w) => Number.isInteger(w.result?.invalid) && w.result.invalid >= 0)
    )
      executive.push(
        (r.windows ? 'حالات فحص تعذّرت عبر الفترات ' : 'أقمار تعذّر حسابها ') +
          windows.reduce((n, w) => n + w.result.invalid, 0) +
          ' · نتائجها مستبعدة من حالات المرور.',
      );
    if (!rows.length)
      executive.push(
        inventory
          ? 'لا توجد حمولات لهذه الجهة في النسخة المتاحة؛ لا يثبت ذلك عدم امتلاكها أقمارًا.'
          : 'لم تُكتشف حالات ضمن عينة الفحص؛ لا تؤكد النتيجة عدم المرور.',
      );
    // Identity metrics describe distinct result IDs; orbital freshness describes the complete scan.
    if (inventory || !r.observer) {
      metrics.push(
        metric(
          'launch',
          'تاريخ إطلاق متاح',
          unique.filter((x) => date(metadata(x).launch)).length,
          total,
          scope,
        ),
        metric(
          'identity',
          'دولة أو جهة منشورة',
          unique.filter(
            (x) =>
              known(inventory ? x.ownerCode : metadata(x).ownerCode) &&
              known(inventory ? x.ownerLabel : metadata(x).country),
          ).length,
          total,
          scope,
        ),
        metric(
          'mission',
          'مهمة أو منظومة لها مرجع',
          unique.filter(
            (x) => documented.has(metadata(x).missionKind) && https(metadata(x).missionSource),
          ).length,
          total,
          scope,
        ),
      );
      distributions.push(
        distribution(
          'مستوى وصف المهمة',
          unique.map((x) =>
            documented.has(metadata(x).missionKind) && !https(metadata(x).missionSource)
              ? labels.unknown
              : labels[metadata(x).missionKind] || labels.unknown,
          ),
        ),
      );
    }
    if (inventory) {
      metrics.push(
        metric(
          'internationalId',
          'معرّف دولي متاح',
          unique.filter((x) => known(x.internationalId)).length,
          total,
          scope,
        ),
        metric(
          'orbit',
          'مدار قابل للتصنيف',
          unique.filter((x) => x.orbit.regime !== 'غير محدد').length,
          total,
          scope,
        ),
      );
    } else {
      const qs = windows.map((w) => w.result?.quality),
        valid = qs.every(
          (q) =>
            q &&
            ['total', 'recent', 'aging', 'old', 'unknown', 'fetched'].every(
              (k) => Number.isInteger(q[k]) && q[k] >= 0,
            ) &&
            q.recent + q.aging + q.old + q.unknown === q.total &&
            q.fetched <= q.total,
        );
      if (valid) {
        const sum = (k) => qs.reduce((n, q) => n + q[k], 0),
          scanned = sum('total'),
          qualityScope = r.windows
            ? 'حالات فحص الأقمار عبر الفترات؛ قد يتكرر القمر'
            : 'جميع الأقمار المفحوصة قبل تصفية النتائج';
        for (const [key, label] of [
          ['recent', 'عناصر ضمن 24 ساعة من كامل الفترة'],
          ['aging', 'عناصر من 24 إلى 72 ساعة'],
          ['old', 'عناصر أبعد من 72 ساعة'],
          ['unknown', 'تاريخ عناصر غير متاح'],
          ['fetched', 'وقت جلب موثق'],
        ])
          metrics.push(metric(key, label, sum(key), scanned, qualityScope));
        const epochs = qs
          .flatMap((q) => [q.minEpoch, q.maxEpoch])
          .filter((v) => typeof v === 'number' && Number.isFinite(v));
        if (epochs.length)
          notes.push(
            'مدى تواريخ العناصر UTC ' +
              new Date(Math.min(...epochs)).toISOString() +
              ' إلى ' +
              new Date(Math.max(...epochs)).toISOString(),
          );
      } else notes.push('مؤشرات حداثة المصدر غير متاحة لهذا التقرير المحفوظ؛ أعد الحساب لتحديثها.');
      notes.push(
        r.observer
          ? 'المرور فوق الأفق حساب هندسي؛ لا يضمن الرؤية بالعين ولا تشغيل مستشعر.'
          : 'المرور داخل الحدود الجغرافية حساب للإسقاط الأرضي؛ لا يثبت التصوير أو الاتصال أو الاستهداف.',
        'الفحص الزمني قد يفوّت مرورًا أقصر من خطوة الحساب. النتائج تقديرات من العناصر المتاحة، وليست أرشيفًا تاريخيًا مرصودًا.',
      );
      addRef('العناصر المدارية والفهرس CelesTrak', 'https://celestrak.org/');
      addRef('الحساب satellite.js', 'https://github.com/shashwatak/satellite-js');
      if (!r.observer) addRef('حدود Natural Earth', 'https://www.naturalearthdata.com/');
      if (rows.some((x) => x.provenance?.mode === 'independent'))
        addRef('الرصد العلني المستقل McCants', 'https://mmccants.org/tles/');
    }
    for (const row of unique) {
      const m = metadata(row);
      if (!inventory && https(m.countrySource))
        addRef('فهرس الهوية SATCAT', 'https://celestrak.org/satcat/');
      addRef('مصدر المهمة', m.missionSource);
    }
    notes.push(
      'هذه مؤشرات اكتمال وحداثة للمعلومات، وليست نسبة لدقة التنبؤ. غياب المعلومة لا يعني غياب القمر أو المهمة.',
    );
    return {
      overview: overview(r, rows, total, inventory),
      version: VERSION,
      kind: inventory ? 'inventory' : r.windows ? 'analysis' : r.observer ? 'observer' : 'report',
      executive,
      metrics,
      distributions,
      notes: [...new Set(notes.filter(Boolean))],
      references: [...refs.values()],
    };
  }
  function overview(r, rows, total, inventory) {
    if (inventory)
      return [
        'يشمل الحصر ' + total + ' قمرًا للجهات المسجلة في الفهرس.',
        'نسخة الفهرس UTC ' + (r.catalogRetrievedAt || missing) + '.',
        'نسبة الأقمار إلى جهة في الفهرس لا تثبت الملكية القانونية أو التشغيل الحالي.',
      ];
    const out = [
      'رُصدت حسابيًا ' +
        rows.length +
        ' حالة مرور لـ ' +
        total +
        ' قمرًا مختلفًا' +
        (r.windows ? ' عبر ' + r.windows.length + ' فترات.' : '.'),
    ];
    const longest = rows
      .filter((x) => Number.isFinite(x.duration) && x.duration >= 0)
      .reduce((a, b) => (!a || b.duration > a.duration ? b : a), null);
    if (longest)
      out.push('أطول مرور ' + duration(longest.duration) + ' للقمر ' + longest.name + '.');
    const sources = [
      ...new Set(
        (r.windows || [r]).flatMap((w) =>
          Object.entries(w.result?.quality?.sources || {})
            .filter(([, n]) => n > 0)
            .map(([label]) => label),
        ),
      ),
    ];
    out.push(
      sources.length
        ? 'مصادر الحساب: ' + sources.join('، ') + '.'
        : 'مصدر العناصر غير موثق في هذا التقرير.',
    );
    const invalid = (r.windows || [r]).reduce((n, w) => n + (w.result?.invalid || 0), 0);
    out.push(
      !rows.length
        ? 'لم تُكتشف حالات ضمن عينة الفحص؛ لا تؤكد النتيجة عدم المرور.'
        : invalid
          ? 'تعذّر حساب ' + invalid + ' حالة فحص؛ النتائج تقديرية من العناصر المتاحة.'
          : 'النتائج تقديرات مدارية ولا تثبت الرؤية أو التصوير أو الاتصال.',
    );
    return out;
  }
  function duration(s) {
    return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), Math.floor(s % 60)]
      .map((v) => String(v).padStart(2, '0'))
      .join(':');
  }
  root.ReportBrief = { build, metric, VERSION };
})(typeof window !== 'undefined' ? window : globalThis);
