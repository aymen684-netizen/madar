(function (root) {
  'use strict';
  function create(category) {
    const types = ['leo', 'meo', 'geo', 'other'],
      enabled = new Set(types);
    let revision = 0,
      cache = null;
    function matches(object) {
      if (!object) return false;
      const type = category(object);
      return enabled.has(types.includes(type) ? type : 'other');
    }
    return {
      enabled: (type) => enabled.has(type),
      toggle(type) {
        if (!types.includes(type)) return false;
        if (enabled.has(type)) enabled.delete(type);
        else enabled.add(type);
        revision++;
        return true;
      },
      matches,
      display(data) {
        if (enabled.size === types.length) return data;
        if (cache?.base === data && cache.revision === revision) return cache.data;
        const filtered = enabled.size ? data.filter(matches) : [];
        cache = { base: data, revision, data: filtered };
        return filtered;
      },
      paths(paths, objects) {
        if (enabled.size === types.length) return paths;
        const ids = new Set(objects.filter(matches).map((o) => o.id));
        return paths.filter((path) => ids.has(path.fleetId));
      },
    };
  }
  root.MapOrbitFilter = { create };
  if (!root.document) return;
  const filter = create(root.OrbitAppearance.category);
  Object.assign(root.MapOrbitFilter, filter);
  const legend = document.getElementById('orbit-legend');
  for (const button of legend.querySelectorAll('button[data-orbit]')) {
    button.setAttribute('aria-pressed', 'true');
    button.onclick = () => {
      filter.toggle(button.dataset.orbit);
      button.setAttribute('aria-pressed', String(filter.enabled(button.dataset.orbit)));
      root.GlobeMotion?.interrupt();
      pathAt = 0;
      update();
    };
  }
})(globalThis);
