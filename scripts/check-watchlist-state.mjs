import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const context = vm.createContext({});
for (const file of ['orbit-data.js', 'watchlist-state.js'])
  vm.runInContext(fs.readFileSync('public/' + file, 'utf8'), context);
const orbit = context.OrbitData,
  create = context.WatchlistState.create,
  seed = JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json')),
  first = orbit.fromOmm(seed, { mode: 'live', fetchedAt: 100 }),
  second = orbit.fromOmm({ ...seed, NORAD_CAT_ID: 100002, OBJECT_NAME: 'SECOND' }),
  older = orbit.fromOmm({ ...seed, EPOCH: '1999-01-01T00:00:00Z' }),
  newer = orbit.fromOmm({ ...seed, EPOCH: '2026-10-17T00:00:00Z' });
function setup({
  legacy = '[]',
  revision = '0',
  record = null,
  persistent = true,
  put = true,
  failRead = false,
  failLocal = false,
} = {}) {
  const local = new Map([
      ['orbit-favorites', legacy],
      ['orbit-cache-favorites-revision', revision],
    ]),
    writes = [];
  let clock = 1000;
  const model = create({
    orbit,
    privacy: {
      localGet: (key) => local.get(key),
      localSet: (key, value) => {
        if (failLocal) throw Error('Storage unavailable');
        local.set(key, value);
      },
      persistent: () => persistent,
    },
    store: {
      get: async (key) => {
        assert.equal(key, 'orbit-favorites-v2');
        if (failRead) throw Error('Read unavailable');
        return record;
      },
      put: async (key, value) => {
        assert.equal(key, 'orbit-favorites-v2');
        writes.push(value);
        return put;
      },
    },
    now: () => clock,
  });
  return {
    model,
    local,
    writes,
    setClock: (value) => {
      clock = value;
    },
  };
}
const legacy = JSON.stringify([first, null, { name: 'invalid' }]),
  a = setup({ legacy, revision: '20', record: { version: 2, updated: 19, items: [second] } });
assert.equal(a.model.items.length, 1, 'legacy list is available synchronously and validated');
await a.model.ready;
assert.equal(
  a.model.items[0].id,
  first.id,
  'older durable storage cannot overwrite local revision',
);
const b = setup({
  legacy,
  revision: '20',
  record: { version: 2, updated: 20, items: [second, null] },
});
await b.model.ready;
assert.equal(b.model.items.length, 1);
assert.equal(b.model.items[0].id, second.id, 'equal or newer durable record takes precedence');
for (const options of [
  { legacy: '{bad' },
  { legacy: '{}', record: { version: 1, updated: 90, items: [second] } },
  { legacy, failRead: true },
]) {
  const test = setup(options);
  await test.model.ready;
  assert.equal(test.model.items.length, options.legacy === legacy ? 1 : 0);
}
a.model.toggle(second);
assert.equal(a.model.has(second.id), true);
assert.equal(a.model.items.length, 2);
assert.throws(() => a.model.items.push(first), /extensible|read only|readonly/i);
assert.throws(() => {
  a.model.items = [];
}, TypeError);
assert.equal(b.model.items.length, 1, 'instances have independent lists');
assert.equal(await a.model.save(), true);
assert.equal(a.writes[0].version, 2);
assert.equal(a.writes[0].updated, 1000);
assert.equal(JSON.parse(a.local.get('orbit-favorites')).length, 2);
assert.equal(a.local.get('orbit-cache-favorites-revision'), '1000');
a.model.toggle(second);
a.setClock(5);
await a.model.save();
assert.equal(
  a.writes[1].updated,
  1001,
  'revision remains monotonic when the clock moves backwards',
);
assert.equal(a.writes[0].items.length, 2, 'later edits do not mutate an earlier save snapshot');
a.writes[1].items[0].omm.MEAN_MOTION = 999;
assert.notEqual(a.model.items[0].omm.MEAN_MOTION, 999);
assert.equal(a.model.refresh([older]), false, 'refresh cannot downgrade orbital elements');
assert.equal(orbit.epoch(a.model.items[0]), orbit.epoch(first));
assert.equal(a.model.refresh([newer]), true);
assert.equal(orbit.epoch(a.model.items[0]), orbit.epoch(newer));
assert.equal(a.model.refresh([newer]), false, 'identical refresh does not request another save');
const fetched = { ...newer, provenance: { mode: 'live', fetchedAt: 200 } };
assert.equal(a.model.refresh([fetched]), true, 'same elements can receive newer source metadata');
a.model.merge([older, second]);
assert.equal(a.model.items.length, 2);
assert.equal(orbit.epoch(a.model.items[0]), orbit.epoch(newer));
const replacement = [second];
a.model.replace(replacement);
replacement.push(first);
assert.equal(a.model.items.length, 1, 'import caller cannot mutate the owned list structure');
for (const options of [
  { persistent: false, put: false },
  { failLocal: true, put: false },
  { failLocal: true, put: true },
  { put: false },
]) {
  const test = setup(options);
  await test.model.ready;
  test.model.toggle(first);
  assert.equal(
    await test.model.save(),
    options.put || (!options.failLocal && options.persistent !== false),
  );
  assert.equal(test.model.items.length, 1, 'session list survives durable storage failure');
}
const noStore = create({
  orbit,
  privacy: { localGet: () => null, localSet: () => {}, persistent: () => false },
});
await noStore.ready;
noStore.toggle(first);
assert.equal(await noStore.save(), false);
console.log(
  'PASS: isolated watchlist, legacy and durable revision precedence, invalid storage fallback, monotonic save snapshots, no orbital downgrade, source refresh, import ownership and session-only persistence',
);
