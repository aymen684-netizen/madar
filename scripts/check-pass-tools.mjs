import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const c = vm.createContext({ TextEncoder, Date });
for (const file of [
  'vendor/satellite.min.js',
  'orbit-data.js',
  'observer-engine.js',
  'pass-tools-core.js',
])
  vm.runInContext(fs.readFileSync('public/' + file, 'utf8'), c);
const P = c.PassToolsCore,
  R = Math.PI / 180;
assert.deepEqual(Array.from(P.polar(0, 0)), [110, 20]);
assert.deepEqual(Array.from(P.polar(90, 0)), [200, 110]);
assert.deepEqual(Array.from(P.polar(270, 90)), [110, 110]);
assert.equal(P.polar(null, 10), null);
for (const center of [
  { lat: 0, lng: 179.9, h: 400 },
  { lat: 89.9, lng: -179.9, h: 35786 },
]) {
  for (const elevation of [0, 10, 89]) {
    const boundary = P.footprint(center, elevation);
    assert.equal(boundary.length, 73);
    const expected =
      Math.acos((6371 / (6371 + center.h)) * Math.cos(elevation * R)) - elevation * R;
    for (const [lat, lng, alt] of boundary) {
      assert(Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && alt === 0.002);
      const angle = Math.acos(
        Math.max(
          -1,
          Math.min(
            1,
            Math.sin(lat * R) * Math.sin(center.lat * R) +
              Math.cos(lat * R) * Math.cos(center.lat * R) * Math.cos((lng - center.lng) * R),
          ),
        ),
      );
      assert(Math.abs(angle - expected) < 1e-7);
    }
  }
}
assert.equal(P.footprint({ lat: 0, lng: 0, h: -1 }).length, 0);
const fixture = JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json')),
  o = c.OrbitData.fromOmm(fixture),
  S = c.satellite,
  t = c.OrbitData.epoch(o),
  rec = c.OrbitData.satrec(S, o),
  g = S.eciToGeodetic(S.propagate(rec, new Date(t)).position, S.gstime(new Date(t)));
const sky = P.sky(
  S,
  o,
  { lat: g.latitude / R, lon: g.longitude / R, height: 0 },
  { entry: t - 60000, exit: t + 60000 },
);
assert.equal(sky.length, 49);
assert.equal(sky[24], null, 'zenith does not invent an azimuth');
assert(sky.some((p) => p && p.every(Number.isFinite)));
const pass = {
  id: 100001,
  name: 'قمر، عربي '.repeat(30) + '\r\nBEGIN:VEVENT',
  entry: t,
  exit: t + 60000,
};
for (const language of ['ar', 'en']) {
  const ics = P.calendar([pass], { language, now: t });
  assert.equal(
    (ics.match(/\r\nBEGIN:VEVENT/g) || []).length,
    1,
    'satellite names cannot inject calendar events',
  );
  assert(
    ics.includes(
      'DTSTART:' +
        new Date(t)
          .toISOString()
          .replace(/[-:]/g, '')
          .replace(/\.\d{3}/, ''),
    ),
  );
  for (const line of ics.split('\r\n'))
    assert(Buffer.byteLength(line) <= 75, 'calendar folding counts UTF-8 bytes');
  assert(!ics.includes('LOCATION:'));
  assert.equal(
    P.calendar([{ ...pass, exit: t - 1 }], { language, now: t }).includes('BEGIN:VEVENT'),
    false,
  );
}
console.log(
  'PASS: polar geometry, true spherical visibility boundaries across poles/dateline, real SGP4 sky path/zenith gaps, UTC Gregorian ICS, UTF-8 folding and calendar injection protection',
);
