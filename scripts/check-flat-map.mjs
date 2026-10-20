import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const context = { window: {} };
vm.runInNewContext(fs.readFileSync('public/flat-map.js', 'utf8'), context);
const { project, bounded, segments, limit } = context.window.FlatMap;
const rect = { x: 20, y: 30, width: 720, height: 360 };
assert.equal(project(90, 0, rect).y, 30);
assert.equal(project(-90, 0, rect).y, 390);
assert.equal(project(0, 0, rect).x, 380);
assert.equal(project(0, -180, rect).x, 20);
assert.equal(project(0, 180, rect).x, 20);
assert.equal(project(0, 540, rect).x, 20);
for (const [lat, lng] of [
  [91, 0],
  [NaN, 1],
  [0, Infinity],
])
  assert.equal(project(lat, lng, rect), null);
const objects = Array.from({ length: 700 }, (_, id) => ({ id }));
const shown = bounded(objects, 699, [650, 651]);
assert.equal(shown.length, limit);
for (const id of [699, 650, 651]) assert(shown.some((o) => o.id === id));
assert.equal(new Set(shown.map((o) => o.id)).size, limit);
assert(
  !bounded(objects.slice(0, 10), 699, [650]).some((o) => o.id === 699),
  'priority never bypasses filters',
);
assert.equal(
  segments(
    [
      { lat: 0, lng: 179 },
      { lat: 0, lng: -179 },
      { lat: 0, lng: -170 },
    ],
    rect,
  ).length,
  1,
  'ground tracks break at the date line',
);
assert.equal(
  segments([{ lat: 0, lng: 0 }, null, { lat: 0, lng: 10 }], rect).length,
  0,
  'invalid positions break the path',
);
const noCanvas = context.window.FlatMap.create({
  document: { createElement: () => ({ getContext: () => null }) },
});
assert.equal(noCanvas.activate(), false);
assert.equal(noCanvas.active(), false);
console.log(
  'PASS: 2D projection poles/date line, invalid positions, capped filtered priorities, split ground tracks and unavailable Canvas fallback',
);
