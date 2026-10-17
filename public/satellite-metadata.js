(function (root) {
  'use strict';
  let catalog = null,
    profiles = null,
    pending = null,
    details = null,
    detailsPending = null;
  let membership = new Map();
  const ownerNote =
    'جهة الفهرس هي نسبة الملكية المنشورة في SATCAT؛ ليست دولة الإطلاق أو شهادة بالمالك القانوني أو المشغّل الحالي. مشغّل المنظومة يُعرض من مصدر مستقل عند توثيقه.';
  function indexProfiles(extra) {
    membership = new Map();
    for (const [program, ids] of Object.entries(extra?.members || {}))
      for (const id of ids) membership.set(String(id), { program });
  }
  const names = new Intl.DisplayNames(['ar'], { type: 'region' });
  const typeLabels = {
    PAY: 'حمولة فضائية',
    DEB: 'حطام مداري',
    'R/B': 'مرحلة صاروخية',
    UNK: 'نوع غير محدد',
  };
  function safeSource(value) {
    try {
      const u = new URL(value);
      return u.protocol === 'https:' && !u.username && !u.password ? u.href : '';
    } catch {
      return '';
    }
  }
  function validateSummary(base) {
    if (base.compactVersion == null) return base;
    if (base.compactVersion !== 1 || !Array.isArray(base.descriptionTemplates))
      throw Error('unsupported identity catalog');
    for (const record of Object.values(base.satellites)) {
      const description = record.description;
      if (description == null) continue;
      const template = base.descriptionTemplates[description];
      if (
        !Number.isInteger(description) ||
        description < 0 ||
        !template ||
        typeof template !== 'object' ||
        Array.isArray(template)
      )
        throw Error('invalid identity description');
    }
    return base;
  }
  function load() {
    if (catalog) return Promise.resolve(catalog);
    if (!pending)
      pending = Promise.all([
        fetch('data/satellite-metadata-compact.json?v=62').then((r) => {
          if (!r.ok) throw Error('metadata unavailable');
          return r.json();
        }),
        fetch('data/mission-profiles.json?v=50')
          .then((r) => {
            if (!r.ok) throw Error('profiles unavailable');
            return r.json();
          })
          .catch(() => null),
      ])
        .then(([base, extra]) => {
          catalog = validateSummary(base);
          details = base.sourceDetailsDeferred ? null : base;
          profiles = extra;
          indexProfiles(extra);
          return catalog;
        })
        .catch((e) => {
          pending = null;
          throw e;
        });
    return pending;
  }
  async function loadDetails() {
    await load();
    if (details) return details;
    if (!detailsPending)
      detailsPending = (async () => {
        const response = await fetch('data/satellite-metadata.json?v=42');
        if (!response.ok) throw Error('source details unavailable');
        const text = await response.text();
        if (text.length > 30000000) throw Error('source details too large');
        const digest = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        const sha = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(
          '',
        );
        if (sha !== catalog.sourceSha256) throw Error('source details snapshot mismatch');
        const full = JSON.parse(text);
        if (
          full.catalogRetrievedAt !== catalog.catalogRetrievedAt ||
          Object.keys(full.satellites).length !== Object.keys(catalog.satellites).length
        )
          throw Error('source details snapshot mismatch');
        details = full;
        return details;
      })().catch((e) => {
        detailsPending = null;
        throw e;
      });
    return detailsPending;
  }
  function get(id) {
    const key = String(id),
      r = catalog?.satellites[key],
      description =
        catalog?.compactVersion === 1 && r?.description != null
          ? catalog.descriptionTemplates[r.description]
          : r,
      owner = catalog?.owners[r?.owner],
      fields = details?.satellites[key]?.catalog || r?.catalog;
    const profile = profiles?.satellites?.[key] || membership.get(key),
      program = profiles?.programs?.[profile?.program];
    const detail = profile?.scope === 'individual' ? profile : program;
    const country =
      owner?.arabic || (owner?.iso2 ? names.of(owner.iso2) : owner?.name) || r?.owner || 'غير متاح';
    const identitySource = /^[1-9]\d{0,8}$/.test(key)
      ? 'https://celestrak.org/satcat/records.php?CATNR=' + key
      : '';
    let mission = description?.mission || 'لم يُعثر على وصف موثق للمهمة في المصادر المراجعة',
      kind = description?.missionKind || 'unknown';
    let missionSource = safeSource(description?.missionSource),
      missionSourceTitle = 'مصدر وصف المهمة',
      missionNote = '',
      checked = '';
    if (detail && r?.type === 'PAY') {
      mission = detail.mission;
      kind = profile.scope === 'individual' ? 'documented' : 'program';
      missionSource = safeSource(detail.source);
      missionSourceTitle = detail.sourceTitle;
      checked = detail.checked || profiles.checked;
      missionNote =
        kind === 'program'
          ? 'الغرض المنشور للمنظومة، مع ربط العضوية بالاسم ورقم NORAD في الفهرس. لا يؤكد حمولة هذا القمر أو حالته التشغيلية الحالية.'
          : 'وصف منشور لهذه المهمة؛ وجود عناصر مدارية لا يثبت استمرار التشغيل.';
    }
    if (r?.type === 'DEB') {
      mission = 'حطام مداري لا يحمل مهمة تشغيلية';
      kind = 'object-type';
      missionSource = identitySource;
    } else if (r?.type === 'R/B') {
      mission = 'مرحلة صاروخية وليست قمرًا تشغيليًا';
      kind = 'object-type';
      missionSource = identitySource;
    }
    if (kind === 'unknown')
      missionNote =
        'يمكن عرض الهوية والمدار المنشورين حتى عند غياب وصف المهمة. لا تُستنتج مهمة سرية من الاسم أو المدار.';
    const evidenceLabel =
      {
        documented: 'مهمة موثقة',
        program: 'غرض المنظومة موثق',
        category: 'تصنيف عام',
        unknown: 'تفاصيل المهمة غير موثقة',
        'object-type': 'نوع الجسم مسجل',
      }[kind] || 'تفاصيل المهمة غير موثقة';
    const operatorSource = safeSource(detail?.operatorSource),
      operator = r?.type === 'PAY' && operatorSource && detail?.operator ? detail.operator : '';
    return {
      ownerNote,
      operator,
      operatorSource: operator ? operatorSource : '',
      operatorChecked: operator ? detail.checked || profiles.checked || '' : '',
      operatorScope: operator ? 'program' : 'unknown',
      legalOwner: null,
      catalog: fields ? { ...fields } : null,
      catalogRetrievedAt: catalog?.catalogRetrievedAt || catalog?.retrieved || '',
      country,
      ownerCode: r?.owner || '',
      mission,
      missionKind: kind,
      missionLabel:
        mission +
        (kind === 'category' ? ' (تصنيف عام)' : kind === 'program' ? ' (وصف المنظومة)' : ''),
      countrySource: r ? identitySource : '',
      missionSource,
      missionSourceTitle,
      missionNote,
      evidenceLabel,
      checked,
      catalogName: profile?.name || '',
      program: program?.title || '',
      objectType: typeLabels[r?.type] || 'غير متاح',
      retrieved: catalog?.retrieved || '',
      launch: r?.launch || 'غير متاح',
      orbitSource: description?.orbitSource || 'CelesTrak',
      ownerIso2: owner?.iso2 || '',
    };
  }
  function use(data, extra = null) {
    catalog = data;
    details = data;
    profiles = extra;
    indexProfiles(extra);
    pending = null;
    detailsPending = null;
  }
  function owners() {
    return Object.entries(
      Object.fromEntries(
        [
          ...new Set([
            ...Object.keys(catalog?.owners || {}),
            ...Object.values(catalog?.satellites || {})
              .map((r) => r.owner)
              .filter(Boolean),
          ]),
        ].map((code) => [code, catalog?.owners?.[code] || {}]),
      ),
    )
      .map(([code, o]) => ({
        code,
        label: o.arabic || (o.iso2 ? names.of(o.iso2) : o.name) || code,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ar'));
  }
  function inventoryInfo() {
    return {
      catalogRetrievedAt: catalog?.catalogRetrievedAt || '',
      sourceSha256: catalog?.sourceSha256 || '',
      source: catalog?.ownerSource || 'https://celestrak.org/pub/satcat.csv',
      documentation:
        catalog?.catalogDocumentation || 'https://celestrak.org/satcat/satcat-format.php',
    };
  }
  function inventoryRecords(owner = 'all') {
    if (!details) throw Error('حمّل تفاصيل الفهرس أولًا.');
    return Object.entries(details.satellites)
      .filter(([, r]) => r.type === 'PAY' && (owner === 'all' || r.owner === owner))
      .map(([id, r]) => {
        const m = get(id),
          c = r.catalog || {};
        return {
          id: Number(id),
          name: c.OBJECT_NAME || m.catalogName || 'NORAD ' + id,
          internationalId: c.OBJECT_ID || 'غير متاح',
          launch: r.launch || 'غير متاح',
          ownerCode: r.owner || '',
          ownerLabel: m.country,
          catalog: { ...c },
          mission: m.mission,
          missionKind: m.missionKind,
          evidenceLabel: m.evidenceLabel,
          missionNote: m.missionNote,
          identitySource: m.countrySource,
          missionSource: m.missionSource,
          checked: m.checked,
          operator: m.operator,
          operatorSource: m.operatorSource,
          operatorChecked: m.operatorChecked,
          operatorScope: m.operatorScope,
          legalOwner: m.legalOwner,
          ownerNote: m.ownerNote,
        };
      });
  }
  const api = {
    load,
    loadDetails,
    inventoryInfo,
    inventoryRecords,
    detailsLoaded: () => !!details,
    get,
    use,
    owners,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.SatMetadata = api;
})(typeof window !== 'undefined' ? window : globalThis);
