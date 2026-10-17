import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const context = vm.createContext({ TextEncoder });
for (const p of ['orbit-data.js', 'watchlist-backup.js'])
  vm.runInContext(fs.readFileSync('public/' + p, 'utf8'), context);
const O = context.OrbitData,
  B = context.WatchlistBackup,
  fixture = JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json', 'utf8'));
const omm = O.fromOmm(fixture, { mode: 'live', fetchedAt: 123 }),
  tle = O.parse(fs.readFileSync('public/data/stations.txt', 'utf8'))[0];
const text = B.pack([omm, tle], new Date('2026-10-14T00:00:00Z')),
  file = JSON.parse(text);
assert.equal(file.version, 1);
assert.equal(file.items.length, 2);
assert(!file.items[0].rec);
assert(!file.items[0].provenance);
assert.equal(file.items[0].omm.NORAD_CAT_ID, 100001);
const restored = B.read(text);
assert.equal(restored.items.length, 2);
for (const row of restored.items) {
  assert.equal(row.provenance.mode, 'imported');
  assert.equal(row.provenance.fetchedAt, null);
  assert(O.valid(row));
}
function payload(items) {
  return JSON.stringify({ format: 'madar-watchlist', version: 1, items });
}
const newer = O.fromOmm({ ...fixture, EPOCH: '2000-06-28T18:50:19Z' }),
  forged = {
    ...file.items[0],
    provenance: { mode: 'live', fetchedAt: Date.now(), evil: 'not retained' },
  };
const clean = B.read(
  payload([
    forged,
    newer,
    { ...forged, id: 2 },
    { ...forged, omm: { ...forged.omm, INCLINATION: true } },
    { name: 'bad' },
  ]),
);
assert.equal(clean.duplicates, 1);
assert.equal(clean.rejected, 3);
assert.equal(clean.items.length, 1);
assert.equal(clean.items[0].omm.EPOCH, newer.omm.EPOCH);
assert.equal(clean.items[0].provenance.mode, 'imported');
assert(!clean.items[0].provenance.evil);
const plan = B.plan([omm, tle], clean.items);
assert.equal(plan.updated, 1);
assert.equal(plan.added, 0);
assert.equal(plan.items.length, 2);
assert.equal(omm.omm.EPOCH, fixture.EPOCH, 'preview must not mutate the existing list');
const keep = B.plan([newer], restored.items);
assert.equal(keep.kept, 1);
assert.equal(keep.added, 1);
assert.equal(keep.items[0].omm.EPOCH, newer.omm.EPOCH);
for (const input of [
  'not json',
  '[]',
  JSON.stringify({ format: 'madar-watchlist', version: 2, items: [] }),
  payload([]),
  payload([{ id: 1 }]),
  payload(Array(20001).fill(null)),
])
  assert.throws(() => B.read(input));
assert.throws(() => B.read(' '.repeat(B.maxBytes + 1)));
assert.throws(() => B.pack([]));
assert.throws(() => B.read(payload([{ ...file.items[1], l1: file.items[1].l1 + 'extra' }])));
console.log(
  'PASS: OMM/TLE backup roundtrip, six-digit IDs, strict schema/size limits, honest imported provenance, invalid/duplicate counts, non-destructive merge and no orbital downgrade',
);
