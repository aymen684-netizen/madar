(function (root) {
  'use strict';
  function normalize(value) {
    return String(value ?? '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
      .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/[\s_‐‑‒–—−-]+/g, ' ')
      .trim();
  }
  function compile(query) {
    const tokens = normalize(query)
      .split(' ')
      .filter((t) => t && !['norad', 'id'].includes(t));
    return (o, metadata = {}) => {
      const text = normalize(
        [o.name, o.id, o.omm?.OBJECT_ID, metadata.catalogName, metadata.program]
          .filter(Boolean)
          .join(' '),
      );
      return tokens.every((t) => text.includes(t));
    };
  }
  const HOUR = 3600000,
    collator = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });
  function refine(items, { age = 'all', sort = 'original', time = Date.now() } = {}, epoch) {
    let until = Infinity;
    const limit = age === 'recent' ? 24 * HOUR : 72 * HOUR;
    const data =
      age === 'all'
        ? [...items]
        : items.filter((o) => {
            const e = epoch(o);
            if (!Number.isFinite(e)) return false;
            for (const boundary of [e - limit, e + limit + 1])
              if (boundary > time) until = Math.min(until, boundary);
            const near = Math.abs(e - time) <= limit;
            return age === 'old' ? !near : near;
          });
    if (sort !== 'original')
      data.sort((a, b) => {
        let difference = 0;
        if (sort === 'name') difference = collator.compare(a.name, b.name);
        else if (sort === 'id') difference = Number(a.id) - Number(b.id);
        else if (sort === 'newest') {
          const x = epoch(a),
            y = epoch(b);
          difference = (Number.isFinite(y) ? y : -Infinity) - (Number.isFinite(x) ? x : -Infinity);
          if (Number.isNaN(difference)) difference = 0;
        }
        return difference || Number(a.id) - Number(b.id);
      });
    return { data, until };
  }
  const api = { normalize, compile, refine };
  if (typeof module !== 'undefined') module.exports = api;
  else root.CatalogSearch = api;
})(typeof window !== 'undefined' ? window : globalThis);
