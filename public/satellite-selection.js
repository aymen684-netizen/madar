(function (root) {
  'use strict';
  function create() {
    let current = null,
      byUser = false,
      tracking = false;
    return Object.freeze({
      get current() {
        return current;
      },
      get byUser() {
        return byUser;
      },
      get tracking() {
        return tracking;
      },
      select(object) {
        if (!object) return;
        current = object;
        byUser = true;
      },
      refreshCatalog(objects) {
        const previousId = current?.id;
        current = objects.find((object) => object.id === previousId) || objects[0] || null;
        if (current?.id !== previousId) byUser = false;
      },
      reconcile(objects, { preserveIntent = false } = {}) {
        if (objects.some((object) => object.id === current?.id)) return false;
        current = objects[0] || null;
        // Loading a catalog retains the existing tracking policy; a user filter resets it.
        if (!preserveIntent) {
          byUser = false;
          tracking = false;
        }
        return true;
      },
      restore(object, explicitlyChosen = false) {
        current = object || null;
        byUser = explicitlyChosen === true;
      },
      toggleTracking() {
        tracking = !tracking;
      },
    });
  }
  const api = Object.freeze({ create });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SatelliteSelection = api;
})(typeof window !== 'undefined' ? window : globalThis);
