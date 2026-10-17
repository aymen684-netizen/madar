(function (root) {
  'use strict';
  function create({ search, orbit, prepare, getMetadata, matchesDisplay }) {
    let rowCache;
    function countryMatches(o, value) {
      if (value === 'all') return true;
      const meta = getMetadata(o.id);
      if (value === 'unknown') return !meta?.ownerCode;
      if (value.startsWith('owner:')) return meta?.ownerCode === value.slice(6);
      if (value === 'CIS') return meta?.ownerCode === 'CIS';
      if (value === 'other')
        return meta?.ownerCode && !['US', 'CIS', 'PRC', 'IND', 'ISRO'].includes(meta.ownerCode);
      return meta?.ownerIso2 === value;
    }
    function rows({ dataset, query, country, onlySaved, age, sort, time, displayKey }) {
      const key = JSON.stringify([query, country, onlySaved, age, sort, displayKey]),
        same = rowCache?.dataset === dataset && rowCache.key === key;
      if (same && (age === 'all' || (time >= rowCache.time && time < rowCache.until)))
        return rowCache.data;
      let base;
      if (same) base = rowCache.base;
      else {
        const matches = search.compile(query);
        base = (onlySaved ? prepare(dataset) : dataset).filter((o) => {
          if (!countryMatches(o, country) || !matchesDisplay(o)) return false;
          if (!query) return true;
          const meta = getMetadata(o.id);
          return matches(o, {
            catalogName: [meta?.catalogName, orbit.fields(o).internationalId].join(' '),
            program: meta?.program,
          });
        });
      }
      const { data, until } = search.refine(base, { age, sort, time }, orbit.epoch);
      rowCache = { dataset, key, base, data, time, until };
      return data;
    }
    return Object.freeze({
      rows,
      invalidate: () => {
        rowCache = null;
      },
    });
  }
  const api = Object.freeze({ create });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CatalogRows = api;
})(typeof window !== 'undefined' ? window : globalThis);
