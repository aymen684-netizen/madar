(function (root) {
  'use strict';
  const KEY = 'madar-observer-sites-v1',
    LIMIT = 20;
  function validate(site) {
    const name = typeof site?.name === 'string' ? site.name.trim() : '';
    if (!name || name.length > 80) throw Error('اكتب اسمًا للموقع لا يتجاوز 80 حرفًا.');
    const result = { name };
    for (const [key, min, max] of [
      ['lat', -90, 90],
      ['lon', -180, 180],
      ['height', -500, 9000],
      ['minElevation', 0, 89],
    ]) {
      const value = site[key];
      if (
        (typeof value !== 'number' && typeof value !== 'string') ||
        String(value).trim() === '' ||
        !Number.isFinite(Number(value)) ||
        Number(value) < min ||
        Number(value) > max
      )
        throw Error('أدخل إحداثيات الموقع وارتفاعه وزاوية الأفق ضمن الحدود المحددة.');
      result[key] = Number(value);
    }
    if (![0, 3].includes(Number(site.zone)) || !['0', '3'].includes(String(site.zone)))
      throw Error('اختر UTC أو توقيت الرياض.');
    result.zone = Number(site.zone);
    return result;
  }
  function create({ privacy, id }) {
    let memory = [],
      memoryOnly = false,
      durableIds = new Set();
    const deleteError = () =>
      Error(
        'تعذّر حذف الموقع المحفوظ على الجهاز. أعد تحميل الصفحة بعد عودة التخزين ثم حاول مجددًا.',
      );
    function all() {
      if (!memoryOnly) {
        try {
          const raw = privacy.localGet(KEY);
          const saved = raw && raw.length <= 100000 ? JSON.parse(raw) : null;
          const seen = new Set();
          memory =
            saved?.version === 1 && Array.isArray(saved.sites)
              ? saved.sites.slice(0, LIMIT).flatMap((site) => {
                  try {
                    if (!/^[a-zA-Z0-9-]{1,80}$/.test(site.id) || seen.has(site.id)) return [];
                    const clean = { id: site.id, ...validate(site) };
                    seen.add(site.id);
                    return [clean];
                  } catch {
                    return [];
                  }
                })
              : [];
          durableIds =
            privacy.persistent?.() === false ? new Set() : new Set(memory.map((site) => site.id));
        } catch {
          memoryOnly = true;
        }
      }
      return memory.map((site) => ({ ...site }));
    }
    function write(sites, removing = null) {
      // A failed read/write makes this snapshot session-only until reload. Do not
      // promote it later: another tab may have saved a newer durable list.
      if (memoryOnly) {
        if (removing !== null && durableIds.has(removing)) throw deleteError();
        memory = sites;
        return { persistent: false };
      }
      try {
        const persistent = privacy.localSet(KEY, JSON.stringify({ version: 1, sites })) === true;
        memory = sites;
        durableIds = persistent ? new Set(sites.map((site) => site.id)) : new Set();
        return { persistent };
      } catch {
        memoryOnly = true;
        // Deletion is transactional: keep the visible record when the durable
        // write fails, so the UI cannot claim that it was removed from device.
        if (removing !== null) throw deleteError();
        memory = sites;
        return { persistent: false };
      }
    }
    function save(site, selected = null) {
      const clean = validate(site),
        sites = all();
      const at = selected === null ? -1 : sites.findIndex((s) => s.id === selected);
      if (selected !== null && at < 0)
        throw Error('الموقع لم يعد محفوظًا؛ اختر موقعًا من القائمة.');
      if (at < 0 && sites.length >= LIMIT)
        throw Error('الحد الأقصى 20 موقعًا؛ احذف موقعًا أو حدّث موقعًا موجودًا.');
      const key = at < 0 ? id() : selected;
      if (!/^[a-zA-Z0-9-]{1,80}$/.test(key) || (at < 0 && sites.some((s) => s.id === key)))
        throw Error('تعذّر إنشاء معرّف الموقع؛ حاول مرة أخرى.');
      const record = { id: key, ...clean };
      if (at < 0) sites.push(record);
      else sites[at] = record;
      return { ...write(sites), site: { ...record } };
    }
    function remove(selected) {
      const sites = all();
      if (!sites.some((s) => s.id === selected))
        throw Error('الموقع لم يعد محفوظًا؛ اختر موقعًا من القائمة.');
      return write(
        sites.filter((s) => s.id !== selected),
        selected,
      );
    }
    return { all, save, remove, sessionOnly: () => memoryOnly };
  }
  root.ObserverSitesCore = { KEY, LIMIT, validate, create };
})(typeof window === 'undefined' ? globalThis : window);
