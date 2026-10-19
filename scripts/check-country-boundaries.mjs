import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';
const data = (name) => JSON.parse(fs.readFileSync('public/data/' + name)),
  full = data('countries.json'),
  index = data('country-index.json'),
  sa = data('sa-border.json'),
  code = fs.readFileSync('public/country-boundaries.js', 'utf8');
assert.deepEqual(
  sa,
  full.features.find((feature) => feature.id === '682'),
);
assert.deepEqual(
  index.features,
  full.features.map(({ geometry, ...identity }) => identity),
);
const startupBytes = ['country-index.json', 'sa-border.json'].reduce(
  (sum, name) => sum + fs.statSync('public/data/' + name).size,
  0,
);
assert(startupBytes < 40000);
const requests = [];
let fail = true;
const context = vm.createContext({
  fetch: async (url) => {
    requests.push(url);
    if (url === 'data/countries.json' && fail) return { ok: false };
    return { ok: true, json: async () => data(url.slice(5)) };
  },
});
vm.runInContext(code, context);
const api = context.CountryBoundaries,
  identities = await api.index();
assert.equal(identities.length, full.features.length);
assert.equal(requests.length, 2);
assert(!requests.includes('data/countries.json'));
assert.deepEqual(await api.country('682'), sa);
const synthetic = { id: 'test', geometry: { type: 'Polygon', coordinates: [] } };
assert.equal(await api.country('test', synthetic), synthetic);
assert.equal(await api.country('missing'), null);
assert.equal(requests.length, 2);
await assert.rejects(api.country('840'));
fail = false;
const displayed = { ...identities.find((entry) => entry.id === '840'), displayName: 'test name' };
const [us, france] = await Promise.all([api.country('840', displayed), api.country('250')]);
assert.equal(us, displayed);
assert.equal(us.displayName, 'test name');
assert.deepEqual(us.geometry, full.features.find((entry) => entry.id === '840').geometry);
assert.deepEqual(france.geometry, full.features.find((entry) => entry.id === '250').geometry);
for (const original of full.features)
  assert.deepEqual((await api.country(original.id)).geometry, original.geometry);
assert.equal(requests.filter((url) => url === 'data/countries.json').length, 2);
const compressed = (name) => gzipSync(fs.readFileSync('public/data/' + name)).length;
console.log(
  'PASS: exact boundaries for every country; lightweight startup, deduplicated loading, retry, names, synthetic snapshots and unknown IDs',
);
console.log(
  JSON.stringify({
    originalBytes: fs.statSync('public/data/countries.json').size,
    startupBytes,
    originalGzipBytes: compressed('countries.json'),
    startupGzipBytes: compressed('country-index.json') + compressed('sa-border.json'),
  }),
);
