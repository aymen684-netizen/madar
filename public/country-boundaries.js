(function (root) {
  'use strict';
  function create({ fetch }) {
    let indexTask = null,
      boundaryTask = null,
      countries = [];
    async function json(path) {
      const response = await fetch(path);
      if (!response.ok) throw Error('تعذّر تحميل حدود البلدان. حدّث الصفحة لإعادة المحاولة.');
      return response.json();
    }
    function index() {
      if (!indexTask)
        indexTask = Promise.all([json('data/country-index.json'), json('data/sa-border.json')])
          .then(([catalog, sa]) => {
            countries = catalog.features;
            const home = countries.find((country) => country.id === sa.id);
            if (!home || !sa.geometry) throw Error('Invalid country index');
            home.geometry = sa.geometry;
            return countries;
          })
          .catch((error) => {
            indexTask = null;
            throw error;
          });
      return indexTask;
    }
    function load() {
      if (!boundaryTask)
        boundaryTask = index()
          .then(() => json('data/countries.json'))
          .then((full) => {
            const byId = new Map(full.features.map((country) => [country.id, country]));
            // Keep option names, restored inputs and existing feature references intact.
            for (const country of countries) {
              const feature = byId.get(country.id);
              if (!feature?.geometry) throw Error('Incomplete country boundaries');
            }
            for (const country of countries) country.geometry = byId.get(country.id).geometry;
            return countries;
          })
          .catch((error) => {
            boundaryTask = null;
            throw error;
          });
      return boundaryTask;
    }
    async function country(id, current) {
      // Synthetic test features and restored report snapshots retain their own geometry.
      if (current?.id === id && current.geometry) return current;
      await index();
      let feature = countries.find((entry) => entry.id === id);
      if (!feature) return null;
      if (!feature.geometry) {
        await load();
        feature = countries.find((entry) => entry.id === id);
      }
      if (current?.id === id) {
        current.geometry = feature.geometry;
        return current;
      }
      return feature;
    }
    return Object.freeze({ index, country });
  }
  root.CountryBoundaries = create({ fetch: (...args) => root.fetch(...args) });
  root.CountryBoundariesFactory = Object.freeze({ create });
})(globalThis);
