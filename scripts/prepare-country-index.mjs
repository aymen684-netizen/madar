import fs from 'node:fs';
const root = new URL('../public/data/', import.meta.url),
  source = JSON.parse(fs.readFileSync(new URL('countries.json', root))),
  sa = source.features.find((feature) => feature.id === '682');
if (!sa?.geometry) throw Error('Saudi boundary missing');
fs.writeFileSync(
  new URL('country-index.json', root),
  JSON.stringify({
    type: 'FeatureCollection',
    features: source.features.map(({ geometry, ...identity }) => identity),
  }),
);
// Exact original coordinates: display and report calculations use the same boundary.
fs.writeFileSync(new URL('sa-border.json', root), JSON.stringify(sa));
console.log('Prepared lightweight country index and exact Saudi boundary');
