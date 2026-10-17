import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const c = { Date, setTimeout };
vm.createContext(c);
for (const file of [
  'vendor/satellite.min.js',
  'orbit-data.js',
  'report-insights.js',
  'observer-engine.js',
  'fleet-pass-core.js',
])
  vm.runInContext(fs.readFileSync('public/' + file, 'utf8'), c);
const O = c.OrbitData,
  S = c.satellite,
  F = c.FleetPassCore,
  fixture = JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json')),
  objects = Array.from({ length: 12 }, (_, i) =>
    O.fromOmm({ ...fixture, NORAD_CAT_ID: 100001 + i }),
  ),
  t = O.epoch(objects[0]),
  pv = S.propagate(O.satrec(S, objects[0]), new Date(t)),
  g = S.eciToGeodetic(pv.position, S.gstime(new Date(t))),
  request = {
    start: t,
    end: t + 600000,
    step: 10,
    observer: {
      lat: (g.latitude * 180) / Math.PI,
      lon: (g.longitude * 180) / Math.PI,
      height: 0,
      minElevation: 10,
    },
  },
  result = await F.scan(S, objects, request);
assert.equal(result.items.length, 12);
assert.equal(new Set(result.items.map((item) => item.id)).size, 12);
for (const item of result.items) {
  assert.equal(item.invalid, false);
  assert.equal(item.rows.length, 1);
  const pass = item.rows[0];
  assert(pass.clippedStart);
  assert(pass.elevation > 89.99);
  assert.equal(F.next(item, t).state, 'ongoing');
  assert.equal(F.next(item, pass.exit).state, 'none');
}
const pass = result.items[0].rows[0];
assert.equal(F.next({ rows: [pass] }, t - 1).state, 'upcoming');
assert.equal(F.countdown({ entry: 3661000, exit: 3662000 }, 0), '01:01:01');
assert.equal(F.countdown({ entry: 0, exit: 3000 }, 1001), '00:00:02');
assert.equal(F.countdown({ entry: 0, exit: 0 }, 1000), '00:00:00');
assert.equal(F.next({ rows: [], invalid: true }, t).state, 'invalid');
assert.equal(F.next({ rows: [] }, t).state, 'none');
for (const invalid of [[], [...objects, objects[0]], [objects[0], objects[0]], [{ id: 1 }]])
  await assert.rejects(F.scan(S, invalid, request));
await assert.rejects(F.scan(S, objects, { ...request, end: t + 864e5 + 1 }));
const failed = await F.scan({ ...S, propagate: () => null }, objects.slice(0, 2), request);
assert(failed.items.every((item) => item.invalid && item.rows.length === 0));
console.log(
  'PASS: twelve real SGP4 site passes, clipped overhead peaks, exact entry/exit countdown boundaries, invalid versus no-pass states, and bounded unique selections',
);
