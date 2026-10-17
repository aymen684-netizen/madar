import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const context = { Intl, URL, module: { exports: {} } };
vm.createContext(context);
vm.runInContext(fs.readFileSync('public/satellite-metadata.js', 'utf8'), context);
const api = context.module.exports,
  full = JSON.parse(fs.readFileSync('public/data/satellite-metadata.json')),
  profiles = JSON.parse(fs.readFileSync('public/data/mission-profiles.json'));
api.use(full, profiles);
const core = {};
vm.createContext(core);
vm.runInContext(fs.readFileSync('public/country-inventory-core.js', 'utf8'), core);
const C = core.CountryInventoryCore;
const all = api.inventoryRecords(),
  report = C.build(all, api.inventoryInfo(), 'all');
assert.equal(
  report.rows.length,
  Object.values(full.satellites).filter((r) => r.type === 'PAY').length,
);
assert(report.rows.length > 16000);
assert.equal(new Set(report.rows.map((r) => r.id)).size, report.rows.length);
assert.equal(
  report.groups.reduce((n, g) => n + g.rows.length, 0),
  report.rows.length,
);
assert.equal(report.groups.length, new Set(report.rows.map((r) => r.ownerCode)).size);
const saudi = C.build(api.inventoryRecords('SAUD'), api.inventoryInfo(), 'SAUD');
assert(saudi.rows.length > 0);
assert(saudi.rows.every((r) => r.ownerCode === 'SAUD'));
assert(
  !saudi.rows.some((r) => r.ownerCode === 'GRSA'),
  'do not silently attribute joint entities to individual countries',
);
assert.equal(api.inventoryRecords('GRSA').length, all.filter((r) => r.ownerCode === 'GRSA').length);
for (const row of saudi.rows) {
  assert.equal(row.launch, full.satellites[row.id].launch || 'غير متاح');
  assert.equal(row.name, full.satellites[row.id].catalog.OBJECT_NAME);
  assert.equal(row.orbit.apogee, C.number(full.satellites[row.id].catalog.APOGEE));
  assert(row.identitySource.startsWith('https://celestrak.org/'));
}
const mutable = api.inventoryRecords('SAUD')[0];
mutable.catalog.APOGEE = 'bad';
assert.notEqual(api.inventoryRecords('SAUD')[0].catalog.APOGEE, 'bad');
assert.equal(C.number(null), null);
assert.equal(C.number(''), null);
assert.equal(C.number('0'), 0);
assert.equal(
  C.orbit({ ORBIT_CENTER: 'EA', ORBIT_TYPE: 'ORB', APOGEE: null, PERIGEE: null }).regime,
  'غير محدد',
);
assert.equal(
  C.orbit({ ORBIT_CENTER: 'EA', ORBIT_TYPE: 'ORB', APOGEE: '600', PERIGEE: '400' }).regime,
  'منخفض LEO',
);
assert.equal(
  C.orbit({
    ORBIT_CENTER: 'EA',
    ORBIT_TYPE: 'ORB',
    APOGEE: '35800',
    PERIGEE: '35750',
    PERIOD: '1436',
  }).regime,
  'متزامن GEO',
);
assert.equal(
  C.orbit({ ORBIT_CENTER: '25544', ORBIT_TYPE: 'DOC', APOGEE: '420', PERIGEE: '400' }).regime,
  'ملتحم بجسم مسجل',
);
assert(C.status({ DECAY_DATE: '2025-01-01' }).includes('2025-01-01'));
assert.equal(C.status({ OPS_STATUS_CODE: null }), 'غير متاح');
assert.equal(C.csvRows(report).length, all.length + 1);
assert.equal(C.tableRows(saudi).length, saudi.rows.length);
assert.equal(C.build([], {}, 'NONE').rows.length, 0);
const csv = {};
csv.window = csv;
vm.createContext(csv);
vm.runInContext(fs.readFileSync('public/report-exports.js', 'utf8'), csv);
assert(csv.ReportExports.csv([['=HYPERLINK("bad")']]).includes("'=HYPERLINK"));
console.log(
  'PASS: country inventory covers ' +
    all.length +
    ' catalog payloads, exact launch/orbit fields, independent joint ownership, truthful unknowns, empty results, defensive copies and complete exports',
);

const sourced = report.rows.find((r) => r.operator === 'SpaceX');
assert(sourced);
const csvRows = C.csvRows({ ...report, rows: [sourced] }),
  header = csvRows[0],
  values = csvRows[1];
assert.equal(header.length, values.length);
assert.equal(values[header.indexOf('مشغّل المنظومة المنشور')], 'SpaceX');
assert.equal(values[header.indexOf('المالك القانوني')], 'غير متاح');
assert(C.tableRows({ rows: [sourced] })[0][3].includes('مشغّل المنظومة: SpaceX'));
assert(C.tableRows(saudi).every((row) => row[3].includes('مشغّل المنظومة:')));
