import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const c = { Date, setTimeout, console };
vm.createContext(c);
c.window = c;
c.self = c;
for (const f of [
  'vendor/satellite.min.js',
  'orbit-data.js',
  'catalog-search.js',
  'report-insights.js',
  'country-report-core.js',
  'report-engine.js',
])
  vm.runInContext(fs.readFileSync('public/' + f, 'utf8'), c);
const C = c.CountryReportCore,
  S = c.satellite,
  O = c.OrbitData,
  base = {
    group: 'owner',
    ownerEnabled: false,
    owners: [],
    ownerLabels: [],
    missionEnabled: false,
    mission: '',
    evidence: 'all',
    evidenceLabel: 'الكل',
    altitudeEnabled: false,
    minAltitude: 0,
    maxAltitude: 2000,
    timeEnabled: false,
    from: '00:00',
    to: '23:59',
  };
assert.throws(() => C.validate({ ...base, ownerEnabled: true }));
assert.throws(() => C.validate({ ...base, missionEnabled: true }));
assert.throws(() => C.validate({ ...base, altitudeEnabled: true, minAltitude: NaN }));
assert.throws(() => C.validate({ ...base, timeEnabled: true, from: '24:00' }));
assert.throws(() => C.checkBudget(16000, 0, 7 * 864e5, 10));
assert.throws(() => C.checkBudget(1, 0, 8 * 864e5, 60));
assert(C.checkBudget(2, 0, 3 * 864e5, 60) > 0);
const m = {
  ownerCode: 'US',
  country: 'الولايات المتحدة',
  missionLabel: 'اتصالات وملاحة',
  missionKind: 'category',
};
assert(
  C.metadataMatches(m, {
    ...base,
    ownerEnabled: true,
    owners: ['US'],
    missionEnabled: true,
    mission: 'مِلاحة',
    evidence: 'category',
  }),
);
assert(!C.metadataMatches(m, { ...base, ownerEnabled: true, owners: ['PRC'] }));
assert(C.metadataMatches({}, { ...base, ownerEnabled: true, owners: ['unknown'] }));
assert(
  !C.metadataMatches(m, {
    ...base,
    missionEnabled: true,
    mission: 'ملاحة',
    evidence: 'documented',
  }),
);
const at = (s) => Date.parse('2026-10-15T' + s + ':00Z');
assert(
  C.passMatches(
    { height: 500, entry: at('22:00') },
    {
      ...base,
      altitudeEnabled: true,
      minAltitude: 500,
      maxAltitude: 500,
      timeEnabled: true,
      from: '22:00',
      to: '02:00',
    },
    0,
  ),
);
assert(
  C.passMatches(
    { height: 500, entry: at('01:00') },
    { ...base, timeEnabled: true, from: '22:00', to: '02:00' },
    0,
  ),
);
assert(!C.passMatches({ height: null, entry: at('12:00') }, { ...base, altitudeEnabled: true }, 0));
assert(
  !C.passMatches(
    { entry: at('12:00') },
    { ...base, timeEnabled: true, from: '22:00', to: '02:00' },
    0,
  ),
);
assert(
  C.passMatches(
    { entry: at('19:00') },
    { ...base, timeEnabled: true, from: '22:00', to: '02:00' },
    3,
  ),
);
assert.equal(
  C.union([
    { entry: 0, exit: 2000 },
    { entry: 1000, exit: 3000 },
  ]),
  3,
);
const recurrenceRows = [0, 1, 2].map((d) => ({
    id: 1,
    name: 'A',
    entry: at('23:10') + d * 864e5,
    exit: at('23:11') + d * 864e5,
    height: 500,
    metadata: m,
  })),
  r = {
    start: Date.parse('2026-10-15T00:00:00Z'),
    end: Date.parse('2026-10-18T00:00:00Z'),
    offset: 0,
    criteria: base,
    result: { rows: recurrenceRows, total: 1, unique: 1 },
  };
assert(C.recurring(recurrenceRows, r).includes('23:00–23:29 (3 من 3'));
assert(
  !C.recurring(
    recurrenceRows.map((p) => ({ ...p, clippedStart: true })),
    r,
  ).includes('23:00–23:29'),
);
assert(C.recurring(recurrenceRows, { ...r, end: r.start + 864e5 }).includes('أقل من ثلاثة'));
assert.equal(C.satellites(r).length, 1);
assert.equal(C.groups(recurrenceRows, 'date', 0).length, 3);
assert.equal(
  C.apply(r, { ...base, altitudeEnabled: true, minAltitude: 600, maxAltitude: 1000 }).result.rows
    .length,
  0,
);
assert.equal(r.result.rows.length, 3, 'filter must not mutate source');
const o = O.fromOmm(JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json', 'utf8'))),
  t = O.epoch(o),
  rec = O.satrec(S, o),
  p = c.ReportEngine.point(S, rec, t),
  pv = S.propagate(rec, new Date(t));
assert(Math.abs(p.speed - Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z)) < 1e-12);
assert(p.speed > 1 && p.speed < 12);
const feature = {
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [p.lng - 10, p.lat - 10],
        [p.lng + 10, p.lat - 10],
        [p.lng + 10, p.lat + 10],
        [p.lng - 10, p.lat + 10],
        [p.lng - 10, p.lat - 10],
      ],
    ],
  },
};
const result = await c.ReportEngine.scan(S, [o], feature, t, t + 120000, 10000, null, null, {
  details: true,
});
assert(result.rows.length);
assert(result.rows.every((p) => p.track.length === 61 && p.speed > 0 && p.groundDistance > 0));
const failing = {
  ...S,
  propagate: (rec, date) => (+date === t + 10000 ? null : S.propagate(rec, date)),
};
const failed = await c.ReportEngine.scan(failing, [o], feature, t, t + 120000, 10000);
assert.equal(failed.rows.length, 0);
assert.equal(failed.invalid, 1, 'mid-scan propagation failure must not become a false exit');
console.log(
  'PASS: combined owner/mission filters, unknowns, midnight/local-time windows, altitude boundaries, scan budgets, non-mutating views, overlap union, evidence-based recurrence, real SGP4 speed/full tracks and failed propagation exclusion',
);
