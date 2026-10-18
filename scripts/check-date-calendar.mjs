import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = {};
vm.createContext(root);
vm.runInContext(fs.readFileSync('public/date-calendar.js', 'utf8'), root);
const { parse, iso, shift, allowed } = root.DateCalendar;
for (const date of [
  '0001-01-01',
  '0099-12-31',
  '1900-02-28',
  '2000-02-29',
  '2028-02-29',
  '9999-12-31',
])
  assert.equal(iso(parse(date)), date);
for (const invalid of [
  '',
  '0000-01-01',
  '10000-01-01',
  '2026-02-29',
  '1900-02-29',
  '2026-04-31',
  '2026-13-01',
  '2026-01-00',
  '2026-1-01',
  'x',
])
  assert.equal(parse(invalid), null, invalid);
assert.equal(shift('2026-12-31', 1), '2027-01-01');
assert.equal(shift('2026-01-31', -1), '2025-12-01');
assert.equal(shift('2028-01-31', 1), '2028-02-01');
assert.equal(shift('0001-01-01', -1), null);
assert.equal(shift('9999-12-31', 1), null);
assert.equal(shift('invalid', 1), null);
assert.equal(allowed('2028-02-29', '2028-02-29', '2028-03-01'), true);
assert.equal(allowed('2028-02-28', '2028-02-29', ''), false);
assert.equal(allowed('2028-03-02', '', '2028-03-01'), false);
assert.equal(allowed('2026-02-29', '', ''), false);
// The ISO civil date must be identical in all host timezones.
assert.equal(parse('2028-02-29').getUTCHours(), 12);
console.log('Gregorian civil dates, leap years, bounds and month navigation passed.');
