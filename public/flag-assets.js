(function (root) {
  'use strict';
  const cache = new Map();
  async function bytes(code) {
    code = String(code || '').toLowerCase();
    if (!/^[a-z]{2}$/.test(code)) return null;
    if (!cache.has(code))
      cache.set(
        code,
        fetch('assets/flags/' + code + '.png')
          .then((r) => (r.ok ? r.arrayBuffer() : null))
          .then((b) => (b ? new Uint8Array(b) : null))
          .catch(() => null),
      );
    return cache.get(code);
  }
  async function enrich(report) {
    const iso = report.country?.properties?.iso2;
    const rows = report.result?.rows || report.analysis?.matrix || [];
    const codes = [...new Set(rows.map((r) => r.metadata?.ownerIso2).filter(Boolean))];
    report.flagBytes = await bytes(iso);
    report.ownerFlags = {};
    await Promise.all(
      codes.map(async (c) => {
        const b = await bytes(c);
        if (b) report.ownerFlags[c] = b;
      }),
    );
    return report;
  }
  function dimensions(data, width = 64) {
    if (!data?.length) return { width, height: 43 };
    const b = new DataView(data.buffer, data.byteOffset, data.byteLength),
      w = b.getUint32(16),
      h = b.getUint32(20);
    return { width, height: Math.round((width * h) / w) };
  }
  function flagImage(code) {
    const i = document.createElement('img');
    i.className = 'country-flag';
    i.alt = 'علم البلد';
    i.src = 'assets/flags/' + String(code).toLowerCase() + '.png';
    i.onerror = () => i.remove();
    return i;
  }
  const api = { bytes, enrich, dimensions, flagImage };
  if (typeof module !== 'undefined') module.exports = api;
  else root.FlagAssets = api;
})(typeof window !== 'undefined' ? window : globalThis);
