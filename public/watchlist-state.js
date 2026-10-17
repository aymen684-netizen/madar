(function (root) {
  'use strict';
  function create({ orbit, privacy, store, now = Date.now }) {
    let items = Object.freeze([]),
      revision = 0;
    function replace(data) {
      items = Object.freeze(data.slice());
    }
    function validItems(data) {
      return Array.isArray(data)
        ? data.filter((o) => o && typeof o.name === 'string' && orbit.valid(o))
        : [];
    }
    try {
      replace(validItems(JSON.parse(privacy.localGet('orbit-favorites') || '[]')));
    } catch {}
    const ready = (async () => {
      try {
        const record = await store?.get('orbit-favorites-v2'),
          localRevision = Number(privacy.localGet('orbit-cache-favorites-revision') || 0);
        if (
          record?.version === 2 &&
          Array.isArray(record.items) &&
          record.updated >= localRevision
        ) {
          replace(validItems(record.items));
          revision = record.updated;
        } else revision = localRevision;
      } catch {}
    })();
    async function save() {
      const snapshot = items.map(orbit.serialize),
        updated = (revision = Math.max(now(), revision + 1));
      let local = false;
      try {
        privacy.localSet('orbit-favorites', JSON.stringify(snapshot));
        privacy.localSet('orbit-cache-favorites-revision', String(updated));
        local = privacy.persistent();
      } catch {}
      const durable = await store?.put('orbit-favorites-v2', {
        version: 2,
        updated,
        items: snapshot,
      });
      return local || durable === true;
    }
    function has(id) {
      return items.some((o) => o.id === id);
    }
    function toggle(object) {
      const exists = has(object.id);
      replace(
        exists ? items.filter((o) => o.id !== object.id) : [...items, orbit.serialize(object)],
      );
    }
    function merge(data) {
      replace(orbit.merge([items, data]).map(orbit.serialize));
    }
    function refresh(data) {
      const byId = new Map(data.map((o) => [o.id, o]));
      let changed = false;
      const next = items.map((old) => {
        const candidate = byId.get(old.id);
        if (
          candidate &&
          orbit.epoch(candidate) >= orbit.epoch(old) &&
          (orbit.key(candidate) !== orbit.key(old) ||
            (candidate.provenance?.fetchedAt || 0) > (old.provenance?.fetchedAt || 0) ||
            (!old.provenance && candidate.provenance))
        ) {
          changed = true;
          return orbit.serialize(candidate);
        }
        return old;
      });
      replace(next);
      return changed;
    }
    return Object.freeze({
      get items() {
        return items;
      },
      ready,
      save,
      has,
      toggle,
      replace,
      merge,
      refresh,
    });
  }
  const api = Object.freeze({ create });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WatchlistState = api;
})(typeof window !== 'undefined' ? window : globalThis);
