import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const context = { module: { exports: {} } };
vm.createContext(context);
vm.runInContext(fs.readFileSync('public/orbit-data.js', 'utf8'), context);
const orbit = context.module.exports;
context.module = { exports: {} };
vm.runInContext(fs.readFileSync('public/map-fleet-core.js', 'utf8'), context);
const core = context.module.exports,
  model = core.create(orbit),
  seed = JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json')),
  items = Array.from({ length: 13 }, (_, i) =>
    orbit.fromOmm({ ...seed, NORAD_CAT_ID: 100001 + i, OBJECT_NAME: 'FLEET TEST ' + i }),
  );
assert.equal(model.add({ id: 1 }), 'invalid');
for (const o of items.slice(0, 12)) assert.equal(model.add(o), 'added');
assert.equal(model.size, 12);
assert.equal(model.add(items[12]), 'full');
assert.equal(model.add({ ...items[0], id: String(items[0].id) }), 'exists');
assert.equal(new Set(model.entries().map((e) => e.color)).size, 12);
const saved = model.snapshot(),
  color = model.color(items[5].id);
assert(model.remove(items[0].id));
assert.equal(model.add(items[12]), 'added');
assert.equal(model.color(items[5].id), color);
assert.equal(model.toggle(items[12]), 'removed');
assert.equal(model.toggle(items[12]), 'added');
const copy = model.snapshot();
copy.items[0].object.omm.MEAN_MOTION = 99;
assert.notEqual(model.snapshot().items[0].object.omm.MEAN_MOTION, 99);
const restored = core.create(orbit);
assert(restored.restore(saved));
assert.equal(restored.size, 12);
assert.equal(restored.color(items[5].id), color);
assert(!restored.restore({ ...saved, items: [...saved.items, saved.items[0]] }));
assert.equal(restored.size, 12);
const revision = restored.revision;
assert(
  !restored.refresh([{ ...items[0], omm: { ...items[0].omm, EPOCH: '2000-01-01T00:00:00Z' } }]),
);
assert.equal(restored.revision, revision);
const newer = { ...items[0], omm: { ...items[0].omm, EPOCH: '2026-10-16T12:00:00Z' } };
assert(restored.refresh([newer]));
assert.equal(
  restored.color(newer.id),
  model.color(newer.id) ||
    (saved.items.find((e) => e.object.id === newer.id) &&
      core.colors[saved.items.find((e) => e.object.id === newer.id).slot]),
);
assert.equal(
  restored.snapshot().items.find((e) => e.object.id === newer.id).object.omm.EPOCH,
  newer.omm.EPOCH,
);
restored.clear();
assert.equal(restored.size, 0);
console.log(
  'PASS: twelve-satellite selection limit, stable distinct colors, removal/replacement, defensive persistence, older-data rejection and fresh model updates',
);
