import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

function calendar() {
  const root = vm.createContext({});
  const source = new URL('../public/date-calendar.js', import.meta.url);
  vm.runInContext(fs.readFileSync(source, 'utf8'), root, { filename: fileURLToPath(source) });
  return root.DateCalendar;
}

test('valid Gregorian dates round-trip, including leap years', () => {
  const { parse, iso } = calendar();
  for (const date of [
    '0001-01-01',
    '0099-12-31',
    '1900-02-28',
    '2000-02-29',
    '2028-02-29',
    '9999-12-31',
  ])
    assert.equal(iso(parse(date)), date);
});

test('invalid civil dates are rejected', () => {
  const { parse } = calendar();
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
});

test('month navigation respects year bounds', () => {
  const { shift } = calendar();
  assert.equal(shift('2026-12-31', 1), '2027-01-01');
  assert.equal(shift('2026-01-31', -1), '2025-12-01');
  assert.equal(shift('2028-01-31', 1), '2028-02-01');
  assert.equal(shift('0001-01-01', -1), null);
  assert.equal(shift('9999-12-31', 1), null);
  assert.equal(shift('invalid', 1), null);
});

test('date limits are inclusive and reject invalid dates', () => {
  const { allowed } = calendar();
  assert.equal(allowed('2028-02-29', '2028-02-29', '2028-03-01'), true);
  assert.equal(allowed('2028-02-28', '2028-02-29', ''), false);
  assert.equal(allowed('2028-03-02', '', '2028-03-01'), false);
  assert.equal(allowed('2026-02-29', '', ''), false);
});

test('civil dates use UTC noon independently of host timezone', () => {
  const { parse } = calendar();
  // The ISO civil date must be identical in all host timezones.
  assert.equal(parse('2028-02-29').getUTCHours(), 12);
});
