(function (root) {
  'use strict';
  const missing = 'غير متاح',
    notice =
      'الحصر يشمل الحمولات الفضائية الموجودة في نسخة مدار من الفهرس العام، وليس جميع ما أُطلق تاريخيًا أو الأقمار غير المعلنة. الدولة أو الجهة هي نسبة الملكية المنشورة في الفهرس، ولا تثبت المالك القانوني أو المشغّل الحالي. الجهات المشتركة تُعرض مستقلة ولا تُنسب تلقائيًا إلى كل دولة. وصف المنظومة يوضح غرضها المنشور، ولا يثبت حمولة كل قمر أو استمرار تشغيله.';
  const orbitNote =
    'قيم المدار لقطة من SATCAT بتاريخ النسخة، وليست عناصر آنية أو مسارًا محسوبًا وقت إنشاء التقرير. تصنيف المدار تقريبي؛ المتزامن لا يعني ثابتًا فوق نقطة. القيم المفقودة لا تُعامل كأصفار.';
  const statusLabels = {
    '+': 'نشط حسب الفهرس',
    '-': 'غير تشغيلي حسب الفهرس',
    P: 'تشغيل جزئي',
    B: 'احتياطي',
    S: 'استعداد',
    X: 'مهمة ممتدة',
    D: 'خرج من المدار',
    U: 'حالة غير معروفة',
  };
  function number(v) {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function orbit(c) {
    const apogee = number(c.APOGEE),
      perigee = number(c.PERIGEE),
      period = number(c.PERIOD),
      inclination = number(c.INCLINATION);
    let regime = 'غير محدد';
    if (c.ORBIT_TYPE === 'DOC' || /^\d+$/.test(c.ORBIT_CENTER || '')) regime = 'ملتحم بجسم مسجل';
    else if (
      c.ORBIT_CENTER === 'EA' &&
      c.ORBIT_TYPE === 'ORB' &&
      apogee !== null &&
      perigee !== null &&
      apogee >= perigee &&
      perigee >= 0
    ) {
      if (apogee <= 2000) regime = 'منخفض LEO';
      else if (
        period >= 1400 &&
        period <= 1480 &&
        (apogee - perigee) / (apogee + perigee + 12742) < 0.05
      )
        regime = 'متزامن GEO';
      else if (perigee >= 2000 && apogee < 35786) regime = 'متوسط MEO';
      else regime = 'مدار آخر حول الأرض';
    } else if (c.ORBIT_CENTER && c.ORBIT_CENTER !== 'EA') regime = 'حول جسم آخر: ' + c.ORBIT_CENTER;
    return {
      regime,
      apogee,
      perigee,
      period,
      inclination,
      center: c.ORBIT_CENTER || missing,
      type: c.ORBIT_TYPE || missing,
    };
  }
  function status(c) {
    return c.DECAY_DATE
      ? 'خرج من المدار بتاريخ ' + c.DECAY_DATE
      : statusLabels[c.OPS_STATUS_CODE] || missing;
  }
  function build(records, info, owner) {
    const rows = records
      .filter((r) => r.ownerCode === owner || owner === 'all')
      .map((r) => ({ ...r, orbit: orbit(r.catalog), status: status(r.catalog) }))
      .sort(
        (a, b) =>
          a.ownerLabel.localeCompare(b.ownerLabel, 'ar') ||
          a.name.localeCompare(b.name, 'en', { numeric: true }) ||
          a.id - b.id,
      );
    const groups = [];
    for (const row of rows) {
      let group = groups.at(-1);
      if (group?.code !== row.ownerCode) {
        group = { code: row.ownerCode, label: row.ownerLabel, rows: [] };
        groups.push(group);
      }
      group.rows.push(row);
    }
    return {
      schema: 1,
      kind: 'country-satellite-inventory',
      owner,
      ownerLabel:
        owner === 'all' ? 'جميع الدول والجهات' : rows[0]?.ownerLabel || info.ownerLabel || owner,
      createdAt: new Date().toISOString(),
      catalogRetrievedAt: info.catalogRetrievedAt,
      sourceSha256: info.sourceSha256,
      source: info.source,
      documentation: info.documentation,
      notice,
      orbitNote,
      rows,
      groups,
      stats: {
        satellites: rows.length,
        owners: groups.length,
        unknownMission: rows.filter((r) => r.missionKind === 'unknown').length,
        missingLaunch: rows.filter((r) => r.launch === missing).length,
        unclassifiedOrbit: rows.filter((r) => r.orbit.regime === 'غير محدد').length,
      },
    };
  }
  const headers = [
    'الدولة أو الجهة المسجلة',
    'القمر',
    'رقم NORAD',
    'المعرّف الدولي',
    'تاريخ الإطلاق',
    'تصنيف المدار التقريبي',
    'الحضيض كم',
    'الأوج كم',
    'الدورة دقيقة',
    'الميل درجة',
    'الحالة المنشورة',
    'تاريخ الخروج من المدار',
    'المهمة',
    'حالة توثيق المهمة',
    'ملاحظة المهمة',
    'مصدر الهوية',
    'مصدر المهمة',
    'تاريخ نسخة الفهرس UTC',
    'مشغّل المنظومة المنشور',
    'مصدر المشغّل',
    'تاريخ مراجعة المشغّل',
    'المالك القانوني',
    'ملاحظة نسبة الجهة',
  ];
  function csvRows(r) {
    return [
      headers,
      ...r.rows.map((x) => [
        x.ownerLabel,
        x.name,
        x.id,
        x.internationalId,
        x.launch,
        x.orbit.regime,
        x.orbit.perigee ?? '',
        x.orbit.apogee ?? '',
        x.orbit.period ?? '',
        x.orbit.inclination ?? '',
        x.status,
        x.catalog.DECAY_DATE || '',
        x.mission,
        x.evidenceLabel,
        x.missionNote,
        x.identitySource,
        x.missionSource,
        r.catalogRetrievedAt,
        x.operator || missing,
        x.operatorSource || '',
        x.operatorChecked || '',
        missing,
        x.ownerNote || '',
      ]),
    ];
  }
  function orbitText(o) {
    const value = (n, unit) => (n === null ? missing : n + ' ' + unit);
    return [
      o.regime,
      'الحضيض: ' + value(o.perigee, 'كم'),
      'الأوج: ' + value(o.apogee, 'كم'),
      'الدورة: ' + value(o.period, 'دقيقة'),
      'الميل: ' + value(o.inclination, 'درجة'),
    ].join('\n');
  }
  function tableRows(r) {
    return r.rows.map((x) => [
      x.name + '\nNORAD ' + x.id,
      x.launch + '\n' + x.internationalId,
      orbitText(x.orbit),
      x.mission +
        '\n' +
        x.evidenceLabel +
        '\nمشغّل المنظومة: ' +
        (x.operator || 'غير موثق في المصادر المراجعة') +
        (x.missionNote && x.missionKind !== 'program' ? '\n' + x.missionNote : ''),
      {
        text: x.status,
        links: [
          { label: 'سجل الفهرس', url: x.identitySource },
          ...(x.missionSource ? [{ label: 'مصدر المهمة', url: x.missionSource }] : []),
          ...(x.operatorSource && x.operatorSource !== x.missionSource
            ? [{ label: 'مصدر مشغّل المنظومة', url: x.operatorSource }]
            : []),
        ],
      },
    ]);
  }
  root.CountryInventoryCore = {
    build,
    orbit,
    number,
    status,
    csvRows,
    tableRows,
    orbitText,
    notice,
    orbitNote,
    headers,
    tableHeaders: [
      'القمر ورقمه',
      'الإطلاق والمعرّف الدولي',
      'المدار المسجل',
      'المهمة والتوثيق',
      'الحالة والمصادر',
    ],
  };
})(typeof window !== 'undefined' ? window : globalThis);
