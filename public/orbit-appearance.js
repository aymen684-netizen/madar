(function (root) {
  'use strict';
  const colors = {
    leo: 'rgba(97,217,213,0.55)',
    meo: 'rgba(255,205,116,0.65)',
    geo: 'rgba(181,174,209,0.38)',
    other: 'rgba(174,166,247,0.6)',
  };
  const cache = new WeakMap();
  function category(object) {
    if (cache.has(object)) return cache.get(object);
    const f = root.OrbitData.fields(object),
      motion = f.motion,
      ecc = f.ecc;
    let result = 'other';
    if (Number.isFinite(motion) && motion > 0 && Number.isFinite(ecc) && ecc >= 0 && ecc < 1) {
      const a = Math.cbrt(398600.4418 / Math.pow((motion * 2 * Math.PI) / 86400, 2)),
        perigee = a * (1 - ecc) - 6371,
        apogee = a * (1 + ecc) - 6371,
        period = 1440 / motion;
      if (apogee <= 2000) result = 'leo';
      else if (period >= 1400 && period <= 1480 && ecc < 0.05) result = 'geo';
      else if (perigee >= 2000 && apogee < 35786) result = 'meo';
    }
    cache.set(object, result);
    return result;
  }
  root.OrbitAppearance = { category, color: (regime) => colors[regime] || colors.other };
})(typeof window !== 'undefined' ? window : globalThis);
