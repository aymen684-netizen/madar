(function (root) {
  'use strict';
  let opening = null,
    queue = Promise.resolve();
  const memory = new Map();
  const persistent = () => !root.Privacy || root.Privacy.persistent();
  function open() {
    if (!root.indexedDB) return Promise.resolve(null);
    if (!opening)
      opening = new Promise((resolve, reject) => {
        const r = root.indexedDB.open('madar-session', 1);
        r.onupgradeneeded = () => {
          if (!r.result.objectStoreNames.contains('records')) r.result.createObjectStore('records');
        };
        r.onsuccess = () => {
          r.result.onversionchange = () => {
            r.result.close();
            opening = null;
          };
          resolve(r.result);
        };
        r.onerror = () => {
          opening = null;
          reject(r.error);
        };
      });
    return opening;
  }
  function enqueue(action) {
    const p = queue.then(action, action);
    queue = p.catch(() => {});
    return p;
  }
  async function get(key) {
    if (!persistent()) return memory.get(key) || null;
    try {
      const db = await open();
      if (!db || !persistent()) return memory.get(key) || null;
      return await new Promise((resolve, reject) => {
        const r = db.transaction('records', 'readonly').objectStore('records').get(key);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => reject(r.error);
      });
    } catch {
      return memory.get(key) || null;
    }
  }
  function put(key, value) {
    if (root.Privacy && !root.Privacy.persistent()) {
      memory.set(key, value);
      return Promise.resolve(false);
    }
    memory.set(key, value);
    return enqueue(async () => {
      try {
        if (!persistent()) return false;
        const db = await open();
        if (!db || !persistent()) return false;
        await new Promise((resolve, reject) => {
          const tx = db.transaction('records', 'readwrite');
          tx.objectStore('records').put(value, key);
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
        return true;
      } catch {
        return false;
      }
    });
  }
  function remove(key) {
    memory.delete(key);
    return enqueue(async () => {
      if (!persistent()) return;
      try {
        const db = await open();
        if (db && persistent())
          await new Promise((resolve, reject) => {
            const tx = db.transaction('records', 'readwrite');
            tx.objectStore('records').delete(key);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
          });
      } catch {}
    });
  }
  function clearAll() {
    memory.clear();
    return enqueue(async () => {
      const db = await open();
      if (!db) return;
      await new Promise((resolve, reject) => {
        const tx = db.transaction('records', 'readwrite');
        tx.objectStore('records').clear();
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      memory.clear();
    });
  }
  const api = { get, put, remove, clearAll };
  if (typeof module !== 'undefined') module.exports = api;
  else root.StateStore = api;
})(typeof window !== 'undefined' ? window : globalThis);
