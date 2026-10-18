import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = {};
vm.createContext(root);
for (const file of ['orbit-data.js', 'orbit-appearance.js', 'map-orbit-filter.js'])
  vm.runInContext(fs.readFileSync('public/' + file, 'utf8'), root);
const data = [15.5, 2, 1.0027, 0.5].map((motion, i) => ({
  id: i + 1,
  omm: { MEAN_MOTION: motion, ECCENTRICITY: 0.001 },
}));
const types = ['leo', 'meo', 'geo', 'other'];
assert.deepEqual(data.map(root.OrbitAppearance.category), types);
const filter = root.MapOrbitFilter.create(root.OrbitAppearance.category);
assert.equal(filter.display(data), data, 'default view retains the original array');
assert.equal(filter.toggle('invalid'), false);
filter.toggle('leo');
const visible = filter.display(data);
assert.deepEqual(
  Array.from(visible, (o) => o.id),
  [2, 3, 4],
);
assert.equal(filter.display(data), visible, 'reuse filtered data between map ticks');
assert.equal(filter.matches(null), false);
const paths = data.map((o) => Object.assign([], { fleetId: o.id }));
assert.deepEqual(
  Array.from(filter.paths(paths, data), (p) => p.fleetId),
  [2, 3, 4],
);
for (const type of types.slice(1)) filter.toggle(type);
assert.equal(filter.display(data).length, 0, 'all types may be hidden');
assert.equal(filter.paths(paths, data).length, 0);
assert.equal(data.length, 4, 'filtering never removes source/fleet objects');
filter.toggle('geo');
assert.deepEqual(
  Array.from(filter.display(data), (o) => o.id),
  [3],
);
const replacement = [{ ...data[2], id: 30 }];
assert.equal(filter.display(replacement)[0].id, 30, 'source replacement invalidates the cache');
for (const type of ['leo', 'meo', 'other']) filter.toggle(type);
assert.equal(filter.display(data), data);
assert.equal(filter.paths(paths, data), paths);
console.log(
  'PASS: independent map orbit toggles, combined/empty views, stable cache, source replacement and non-destructive fleet path filtering',
);
