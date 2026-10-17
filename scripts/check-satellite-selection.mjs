import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// No DOM, storage, network or application globals: each instance owns its state.
const context = { module: { exports: {} } };
vm.createContext(context);
vm.runInContext(fs.readFileSync('public/satellite-selection.js', 'utf8'), context);
const { create } = context.module.exports,
  model = create(),
  other = create(),
  first = { id: 1, name: 'FIRST' },
  second = { id: 2, name: 'SECOND' };
const state = () => [model.current, model.byUser, model.tracking];
assert.deepEqual(state(), [null, false, false]);
model.select(null);
assert.deepEqual(state(), [null, false, false]);
model.refreshCatalog([first, second]);
assert.deepEqual(state(), [first, false, false], 'automatic selection is not a user choice');
model.select(second);
model.toggleTracking();
assert.deepEqual(state(), [second, true, true]);
const newer = { ...second, name: 'UPDATED ELEMENTS' };
model.refreshCatalog([first, newer]);
assert.deepEqual(
  state(),
  [newer, true, true],
  'refresh must replace the object, preserving intent',
);
assert.equal(model.reconcile([first, newer]), false);
assert.deepEqual(state(), [newer, true, true]);
model.select(first);
assert.deepEqual(state(), [first, true, true], 'choosing another satellite retains tracking');
model.select(newer);
assert.equal(model.reconcile([first]), true);
assert.deepEqual(
  state(),
  [first, false, false],
  'filter removal clears explicit choice and tracking',
);
model.select(second);
model.toggleTracking();
model.reconcile([first], { preserveIntent: true });
assert.deepEqual(
  state(),
  [first, true, true],
  'catalog filtering retains the legacy loading policy',
);
model.refreshCatalog([second]);
assert.deepEqual(state(), [second, false, true], 'missing catalog ID loses explicit choice');
model.restore(first);
assert.deepEqual(state(), [first, false, true], 'automatic draft restoration retains tracking');
model.restore(second, true);
assert.deepEqual(state(), [second, true, true]);
model.restore(first, 'true');
assert.equal(model.byUser, false, 'only an explicit boolean restores user intent');
model.refreshCatalog([]);
assert.deepEqual(state(), [null, false, true]);
assert.equal(model.reconcile([]), true);
assert.deepEqual(state(), [null, false, false]);
model.restore(second, true);
assert.equal(other.current, null);
assert.equal(other.byUser, false);
assert.equal(other.tracking, false);
assert.throws(() => {
  model.current = first;
}, TypeError);
assert.throws(() => {
  model.byUser = false;
}, TypeError);
assert.throws(() => {
  model.tracking = true;
}, TypeError);
console.log(
  'PASS: isolated satellite selection, catalog refresh, filter reconciliation, draft intent and tracking transitions',
);
