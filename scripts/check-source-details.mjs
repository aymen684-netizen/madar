import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const c = { module: { exports: {} } };
vm.createContext(c);
vm.runInContext(fs.readFileSync('public/source-details.js', 'utf8'), c);
const D = c.module.exports;
const o = {
    id: 100001,
    name: 'test',
    omm: { NORAD_CAT_ID: 100001 },
    provenance: { mode: 'imported', fetchedAt: null },
  },
  m = {
    catalog: { RCS: null },
    countrySource: 'https://celestrak.org/satcat/records.php?CATNR=100001',
    catalogRetrievedAt: '2026-10-16T06:00:00Z',
  };
assert.equal(D.record(o, m).orbitSource, null);
assert.equal(
  D.record({ ...o, provenance: { mode: 'independent' } }, m).orbitSource,
  'https://mmccants.org/tles/',
);
assert.equal(D.value('RCS', null), 'غير منشور');
assert.equal(D.value('PERIGEE', 0), '0');
assert.equal(D.value('OPS_STATUS_CODE', 'P'), 'تشغيل جزئي (P)');
assert.equal(D.value('LAUNCH_SITE', 'UNKNOWN'), 'UNKNOWN');
assert.equal(D.record(o, {}).catalog, null);
const base = JSON.parse(fs.readFileSync('public/data/satellite-metadata.json')),
  snap = JSON.parse(fs.readFileSync('public/data/source-snapshot.json')),
  gp = JSON.parse(fs.readFileSync('public/data/active-omm.json'));
assert.equal(gp.length, snap.count);
assert.equal(new Set(gp.map((r) => r.NORAD_CAT_ID)).size, gp.length);
for (const row of gp) {
  const identity = base.satellites[row.NORAD_CAT_ID];
  assert(identity?.catalog);
  assert.equal(Number(identity.catalog.NORAD_CAT_ID), row.NORAD_CAT_ID);
}
const O = { module: { exports: {} } };
vm.createContext(O);
vm.runInContext(fs.readFileSync('public/orbit-data.js', 'utf8'), O);
const parsed = O.module.exports.parse(gp);
assert.equal(parsed.length, gp.length);
const sample = {
  ...gp[0],
  CLASSIFICATION_TYPE: 'U',
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 123,
  CENTER_NAME: 'EARTH',
};
assert.equal(O.module.exports.fromOmm(sample).omm.REV_AT_EPOCH, 123);
assert.equal(
  O.module.exports.fromOmm({ ...sample, REV_AT_EPOCH: 'bad' }).omm.REV_AT_EPOCH,
  undefined,
);
console.log(
  'PASS: complete active snapshot and SATCAT identity coverage, optional OMM fields, explicit missing values, original-source attribution and source export',
);
