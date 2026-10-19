import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const c = {};
vm.createContext(c);
vm.runInContext(fs.readFileSync('public/globe-picking.js', 'utf8'), c);
const P = c.GlobePicking,
  front = { id: 1 },
  near = { id: 2 },
  back = { id: 3 };
const options = { radius: 16, project: (p) => p, visible: (p) => p.visible !== false };
assert.equal(
  P.pick(
    [
      [{ x: 11, y: 12 }, front],
      [{ x: 10, y: 10 }, near],
    ],
    10,
    10,
    options,
  ),
  near,
);
assert.equal(P.pick([[{ x: 10, y: 10, visible: false }, back]], 10, 10, options), null);
assert.equal(P.pick([[{ x: 27, y: 10 }, front]], 10, 10, options), null);
assert(P.unobscured({ x: 0, y: 0, z: 300 }, { x: 0, y: 0, z: 110 }, 100));
assert(!P.unobscured({ x: 0, y: 0, z: 300 }, { x: 0, y: 0, z: -110 }, 100));
assert(P.unobscured({ x: 0, y: 0, z: 300 }, { x: 200, y: 0, z: 0 }, 100));
const docListeners = {},
  listeners = {},
  holder = {
    ownerDocument: { addEventListener: (t, f) => (docListeners[t] = f), removeEventListener() {} },
    addEventListener: (t, f) => (listeners[t] = f),
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  },
  selected = [],
  world = {
    camera: () => ({ position: { x: 0, y: 0, z: 300 } }),
    getCoords: (a, b, h) => ({ x: 0, y: 0, z: h ? 110 : 100 }),
    getScreenCoords: () => ({ x: 100, y: 100 }),
  };
P.install(holder, {
  world: () => world,
  candidates: () => [[{ lat: 0, lng: 0, alt: 1 }, front]],
  select: (o) => selected.push(o),
});
const event = (type, id = 1, x = 100) => ({
  type,
  pointerId: id,
  clientX: x,
  clientY: 100,
  pointerType: 'touch',
  button: 0,
});
listeners.pointerdown(event('pointerdown'));
const up = event('pointerup');
listeners.pointerup(up);
assert.equal(selected.length, 1);
assert(P.handled(up));
let stopped = 0;
docListeners.click({
  clientX: 100,
  clientY: 100,
  preventDefault() {
    stopped++;
  },
  stopImmediatePropagation() {
    stopped++;
  },
});
assert.equal(stopped, 2);
listeners.pointerdown(event('pointerdown'));
listeners.pointermove(event('pointermove', 1, 130));
listeners.pointerup(event('pointerup', 1, 130));
assert.equal(selected.length, 1);
listeners.pointerdown(event('pointerdown'));
listeners.pointerdown(event('pointerdown', 2));
listeners.pointerup(event('pointerup'));
listeners.pointerup(event('pointerup', 2));
assert.equal(selected.length, 1);
console.log(
  'PASS: nearest screen target, touch radius, Earth occlusion, single taps, drag and pinch exclusion, cached-hover suppression',
);

listeners.pointerdown(event('pointerdown'));
listeners.pointerup(event('pointerup'));
docListeners.pointerdown();
docListeners.click({
  clientX: 100,
  clientY: 100,
  preventDefault() {
    stopped++;
  },
  stopImmediatePropagation() {
    stopped++;
  },
});
assert.equal(stopped, 2);
console.log(
  'PASS: selection does not activate a newly revealed card button; independent next clicks remain available',
);
const sites = [];
let candidateReads = 0;
world.toGlobeCoords = (x, y) => (x < 200 ? { lat: 0, lng: 0 } : null);
P.install(holder, {
  world: () => world,
  candidates: () => {
    candidateReads++;
    return [];
  },
  select: () => {
    throw Error('site mode must not select satellites');
  },
  surface: { active: () => true, select: (point) => sites.push(point) },
});
listeners.pointerdown(event('pointerdown'));
listeners.pointerup(event('pointerup'));
assert.equal(sites[0].lat, 0);
assert.equal(sites[0].lng, 0);
assert.equal(candidateReads, 0);
listeners.pointerdown(event('pointerdown', 1, 250));
listeners.pointerup(event('pointerup', 1, 250));
assert.equal(sites[1], null, 'off-Earth taps cannot reuse an old hit');
listeners.pointerdown(event('pointerdown'));
listeners.pointermove(event('pointermove', 1, 135));
listeners.pointerup(event('pointerup', 1, 135));
listeners.pointerdown(event('pointerdown'));
listeners.pointerdown(event('pointerdown', 2));
listeners.pointerup(event('pointerup'));
listeners.pointerup(event('pointerup', 2));
assert.equal(sites.length, 2, 'drag and pinch must not choose a surface location');
console.log(
  'PASS: explicit surface mode, zero coordinates, off-Earth rejection, no satellite sampling and drag/pinch exclusion',
);
