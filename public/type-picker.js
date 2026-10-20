(function (root) {
  'use strict';
  const groups = () => root.SatGroups,
    labels = new Proxy({}, { get: (_, k) => groups()?.labels[k] });
  function selected(prefix) {
    const field = document.getElementById?.(prefix + '-types');
    if (field && field.dataset.typesMounted !== 'true')
      return JSON.parse(field.dataset.selectedTypes || '[]').filter((k) => labels[k]);
    return Array.from(document.querySelectorAll('#' + prefix + '-types input:checked'))
      .map((e) => e.value)
      .filter((k) => labels[k]);
  }
  function set(prefix, keys) {
    const field = document.getElementById(prefix + '-types');
    field.dataset.selectedTypes = JSON.stringify(keys.filter((k) => labels[k]));
    for (const e of field.querySelectorAll('input')) e.checked = keys.includes(e.value);
  }
  function name(keys) {
    return keys.map((k) => labels[k]).join(' + ');
  }
  async function dataset(key, force = false) {
    let result;
    try {
      result = await groups().fetchGroup(key, parse, { force });
    } catch (e) {
      throw Error(e.message || 'تعذّر تحميل النوع: ' + labels[key]);
    }
    if (!result.data.length) throw Error('لا توجد عناصر مدارية للنوع: ' + labels[key]);
    result.data.source = result.source;
    return result.data;
  }
  async function load(prefix, force = false) {
    const keys = selected(prefix);
    if (!keys.length) throw Error('اختر نوعًا واحدًا على الأقل.');
    const settled = await Promise.allSettled(keys.map((k) => dataset(k, force)));
    const ok = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    if (!ok.length) throw Error(settled.find((r) => r.status === 'rejected').reason.message);
    const failed = keys.filter((k, i) => settled[i].status === 'rejected');
    if (failed.length && prefix !== 'catalog')
      throw Error(
        'لم يُنشأ التقرير لأن بعض الأنواع لم تُحمّل: ' + failed.map((k) => labels[k]).join('، '),
      );
    const merged = OrbitData.merge(ok);
    merged.rejected = ok.reduce((n, d) => n + (d.rejected || 0), 0);
    merged.failed = failed.map((k) => labels[k]);
    merged.derived = ok.some((d) => d.source === 'derived');
    return merged;
  }
  function describe(data, label) {
    return label + (data.derived ? ' · تصنيف تقريبي من النسخة الاحتياطية' : '');
  }
  function lock(prefix, value) {
    document.getElementById(prefix + '-types').dataset.typesLocked = String(value);
    for (const e of document.querySelectorAll(
      '#' + prefix + '-types input, [data-type-prefix="' + prefix + '"]',
    ))
      e.disabled = value;
  }
  const presets = [
    { key: 'stations', label: 'المحطات', types: ['stations'] },
    { key: 'navigation', label: 'الملاحة', types: ['gnss'] },
    { key: 'military', label: 'العسكرية العلنية', types: ['military', 'intelligence'] },
    { key: 'active', label: 'الكل', types: [] },
  ];
  function sync(prefix) {
    const keys = selected(prefix),
      scope = document.getElementById(prefix === 'catalog' ? 'group' : prefix + '-scope').value;
    for (const button of document.querySelectorAll('[data-type-prefix="' + prefix + '"]')) {
      const preset = presets.find((p) => p.key === button.dataset.typePreset),
        active = preset.types.length
          ? preset.types.length === keys.length && preset.types.every((k) => keys.includes(k))
          : keys.length === 0 && scope === 'active';
      button.setAttribute('aria-pressed', String(active));
    }
  }
  function applyPreset(prefix, key) {
    const preset = presets.find((p) => p.key === key);
    if (!preset) return;
    const inputs = [...document.querySelectorAll('#' + prefix + '-types input')];
    if (
      document.getElementById(prefix + '-types').dataset.typesLocked === 'true' ||
      inputs.some((e) => e.disabled)
    )
      return;
    set(prefix, preset.types);
    if (prefix === 'catalog') {
      if (key === 'active') document.getElementById('group').value = 'active';
      loadCatalog();
    } else document.getElementById(prefix + '-scope').value = key === 'active' ? 'active' : 'types';
    sync(prefix);
    root.DraftState?.schedule();
  }
  function loadCatalog() {
    onlySaved = false;
    document.getElementById('search').value = '';
    const quick = document.getElementById('shell-query');
    if (quick) quick.value = '';
    document.getElementById('all').classList.add('active');
    document.getElementById('saved').classList.remove('active');
    root.load?.();
  }
  function mountPresets(prefix, parent) {
    const row = document.createElement('div');
    row.className = 'type-presets';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', 'مجموعات جاهزة');
    for (const preset of presets) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = preset.label;
      button.dataset.typePrefix = prefix;
      button.dataset.typePreset = preset.key;
      button.onclick = () => applyPreset(prefix, preset.key);
      row.append(button);
    }
    parent.append(row);
    sync(prefix);
    return row;
  }
  if (document.getElementById)
    for (const prefix of ['catalog', 'report', 'analysis', 'observer']) {
      const field = document.getElementById(prefix + '-types');
      mountPresets(prefix, field);
      const advanced = field.querySelector('.type-advanced');
      field.append(advanced);
      field.addEventListener('change', () => sync(prefix));
      document
        .getElementById(prefix === 'catalog' ? 'group' : prefix + '-scope')
        .addEventListener('change', () => sync(prefix));
    }
  root.TypePicker = { selected, set, name, load, lock, describe, applyPreset, mountPresets, sync };
})(window);
